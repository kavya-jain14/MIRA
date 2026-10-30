import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.MIRA_TEST_DATABASE_URL;
const databaseKind = process.env.MIRA_TEST_DATABASE_KIND ?? "postgres";
assert.ok(["postgres", "pglite"].includes(databaseKind), "Database kind must be postgres or pglite.");
assert.ok(databaseUrl, "Set MIRA_TEST_DATABASE_URL to a disposable local Postgres database.");
const target = new URL(databaseUrl);
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
    /^\/mira_(?:test|oct20)(?:_|$)/.test(target.pathname),
  "Persistence smoke only accepts local databases named mira_test* or mira_oct20*.",
);

const now = new Date("2026-08-09T12:00:00.000Z");
const leaseExpiry = new Date(now.getTime() + 90_000);
const intervalMs = 60_000;

async function runPhase(phase, agentId) {
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.FAULTLINE_USE_IN_MEMORY_DB;
  const db = await import("../apps/api/dist/db.js");
  const { runDueAgentsOnce } = await import("../apps/api/dist/scheduler.js");
  const { SourceRegistry } = await import("../apps/api/dist/sources/index.js");
  const { buildControlRoom } = await import("../apps/api/dist/app.js");
  const candidate = {
    sourceId: "CIVN-2026-RESTART",
    sourceKind: "cert-in",
    title: "Critical remote code execution in model-serving gateway",
    summary: "CERT-In reports an actively exploited remote code execution vulnerability in an internet-facing model-serving gateway and recommends applying the vendor update immediately.",
    url: "https://www.cert-in.org.in/example/CIVN-2026-RESTART",
    publishedAt: "2026-08-09T10:00:00.000Z",
    sourceName: "Deterministic integration fixture",
    tags: ["ai", "security", "actively exploited", "patch"],
    rawContent: "Risk Assessment: Critical. Required action: apply the vendor update and verify exposed systems.",
  };
  const weak = {
    ...candidate,
    sourceId: "OFF-TOPIC-RESTART",
    title: "Quarterly lifestyle update",
    summary: "A quarterly lifestyle announcement about office cafeteria menus, employee clubs, and upcoming social events.",
    url: "https://www.cert-in.org.in/example/OFF-TOPIC-RESTART",
    tags: ["announcement"],
    rawContent: "Office cafeteria menu and employee clubs.",
  };
  const sourceRegistryFactory = () => new SourceRegistry([{
    kind: "cert-in",
    name: "Deterministic integration fixture",
    async fetchCandidates() { return [candidate, weak]; },
  }], { retries: 0, timeoutMs: 1_000 });
  const tick = (time) => runDueAgentsOnce({
    clock: () => time,
    runtime: { intervalMs, scheduleJitterMs: 0 },
    sourceRegistryFactory,
  });

  try {
    await db.initializeDatabase();
    if (phase === "seed") {
      await db.createAgent({
        agentId, personaName: "Mira", personaDomain: "AI Reliability & Security",
        initializedAt: now.toISOString(), nextRunAt: now.toISOString(),
      });
      assert.deepEqual(await tick(now), { due: 1, completed: 1, failed: 0 });
      assert.equal((await db.getPosts(agentId)).length, 1);
      assert.equal((await db.getRejectedDecisions(agentId)).length, 1);
      const run = (await db.getRuns(agentId))[0];
      await assert.rejects(db.withTransaction(async () => {
        await db.createDecision({
          id: `${agentId}-rollback`, runId: run.id, agentId,
          title: "Must roll back", finalScore: 0, verdict: "reject",
          reason: "Injected transaction failure.", sourceUrl: "https://example.com/rollback",
          decidedAt: now.toISOString(),
        });
        throw new Error("injected rollback");
      }), /injected rollback/);
      assert.equal((await db.getDecisions(agentId)).some(row => row.id.endsWith("-rollback")), false);
      assert.equal(await db.acquireAgentLease({
        agentId, token: `${agentId}-interrupted-worker`, now: now.toISOString(),
        lockedUntil: leaseExpiry.toISOString(),
      }), true);
      // Exit without releasing this durable lease, as an interrupted worker would.
      return {
        posts: await db.getPosts(agentId), decisions: await db.getDecisions(agentId),
        memories: await db.listMemories(agentId), agent: await db.getAgent(agentId),
      };
    }

    const before = {
      posts: await db.getPosts(agentId), decisions: await db.getDecisions(agentId),
      memories: await db.listMemories(agentId), agent: await db.getAgent(agentId),
    };
    assert.equal(before.agent.lockToken, `${agentId}-interrupted-worker`);
    assert.deepEqual(await tick(new Date(leaseExpiry.getTime() - 1)), { due: 0, completed: 0, failed: 0 });
    assert.equal((await db.getRuns(agentId)).length, 1);
    assert.deepEqual(await tick(leaseExpiry), { due: 1, completed: 1, failed: 0 });
    assert.deepEqual(await db.getPosts(agentId), before.posts);
    assert.deepEqual(await db.getDecisions(agentId), before.decisions);
    assert.equal((await db.getRuns(agentId)).length, 2);
    assert.equal((await db.getRuns(agentId))[0].published, 0);
    const after = await db.getAgent(agentId);
    assert.equal(after.lockToken, null);
    assert.equal(after.lockedUntil, null);
    assert.equal(after.nextRunAt, new Date(leaseExpiry.getTime() + intervalMs).toISOString());
    const snapshot = await buildControlRoom(agentId);
    assert.equal(snapshot.autonomy.postsPublished, 1);
    assert.equal(snapshot.autonomy.candidatesRejected, 1);
    assert.equal(snapshot.editorialLedger.length, 1);
    return before;
  } finally {
    await db.closeDatabase();
  }
}

if (process.argv[2] === "--phase") {
  console.log(JSON.stringify(await runPhase(process.argv[3], process.argv[4])));
} else {
  const agentId = `persistence-smoke-${randomUUID()}`;
  const file = fileURLToPath(import.meta.url);
  const child = phase => JSON.parse(execFileSync(process.execPath, [file, "--phase", phase, agentId], {
    encoding: "utf8", timeout: 20_000,
  }));
  try {
    const seeded = child("seed");
    const restarted = child("restart");
    assert.deepEqual(restarted, seeded);
    console.log(`PASS (${databaseKind}): retained posts, decisions, memory and schedule across separate client processes; rollback, active/expired leases and duplicate suppression verified. Database-server restart and live providers were not tested.`);
  } finally {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const table of ["memories", "decisions", "posts", "runs", "agents"]) {
        await client.query(`DELETE FROM ${table} WHERE agent_id = $1`, [agentId]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}
