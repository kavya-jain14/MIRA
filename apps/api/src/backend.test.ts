import { createServer } from "node:http";

import { beforeAll, describe, expect, it } from "vitest";

import { SourceRegistry } from "./sources/index.js";
import type {
  SourceAdapter,
  SourceCandidate,
} from "./sources/types.js";

const databasePath = `/tmp/faultline-backend-test-${process.pid}-${Date.now()}.sqlite`;
process.env.FAULTLINE_DB_PATH = databasePath;

const NOW = new Date("2026-08-09T12:00:00.000Z");

function strongCandidate(): SourceCandidate {
  return {
    sourceId: "CIVN-2026-9999",
    sourceKind: "cert-in",
    title: "Critical remote code execution in model-serving gateway",
    summary:
      "CERT-In reports an actively exploited remote code execution vulnerability in an internet-facing model-serving gateway and recommends applying the vendor update immediately.",
    url: "https://www.cert-in.org.in/example/CIVN-2026-9999",
    publishedAt: "2026-08-09T10:00:00.000Z",
    sourceName: "CERT-In Advisories",
    tags: ["ai", "security", "actively exploited", "patch"],
    rawContent:
      "Risk Assessment: Critical. Required action: apply the vendor update and verify exposed systems.",
  };
}

function secondStrongCandidate(): SourceCandidate {
  return {
    ...strongCandidate(),
    sourceId: "CIVN-2026-9998",
    title: "Critical authentication bypass in an AI gateway",
    summary:
      "CERT-In reports a critical authentication bypass in an internet-facing AI gateway and recommends applying the vendor security update immediately.",
    url: "https://www.cert-in.org.in/example/CIVN-2026-9998",
    publishedAt: "2026-08-09T09:00:00.000Z",
  };
}

function weakCandidate(): SourceCandidate {
  return {
    sourceId: "OFF-TOPIC-1",
    sourceKind: "cert-in",
    title: "Quarterly lifestyle update",
    summary:
      "A quarterly lifestyle announcement about office cafeteria menus, employee clubs, and upcoming social events.",
    url: "https://www.cert-in.org.in/example/OFF-TOPIC-1",
    publishedAt: "2026-08-09T10:00:00.000Z",
    sourceName: "CERT-In Advisories",
    tags: ["announcement"],
  };
}

class FixedAdapter implements SourceAdapter {
  readonly kind = "cert-in" as const;
  readonly name = "Deterministic primary source";

  constructor(
    private readonly candidates: SourceCandidate[],
    private readonly delayMs = 0,
  ) {}

  async fetchCandidates(): Promise<SourceCandidate[]> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    return this.candidates;
  }
}

let dbModule: typeof import("./db.js");
let workerModule: typeof import("./worker.js");
let schedulerModule: typeof import("./scheduler.js");
let appModule: typeof import("./app.js");

beforeAll(async () => {
  dbModule = await import("./db.js");
  workerModule = await import("./worker.js");
  schedulerModule = await import("./scheduler.js");
  appModule = await import("./app.js");
});

describe("durable autonomous runtime", () => {
  it("publishes one paced, evaluator-compatible post and persists real telemetry", async () => {
    const agentId = "agent-first-cycle";
    dbModule.createAgent({
      agentId,
      personaName: "Mira",
      personaDomain: "AI Reliability & Security",
      initializedAt: NOW.toISOString(),
      nextRunAt: NOW.toISOString(),
    });
    const registry = new SourceRegistry(
      [new FixedAdapter([strongCandidate(), weakCandidate()])],
      { retries: 0, timeoutMs: 1_000 },
    );

    const result = await workerModule.runAgentOnce(agentId, {
      sourceRegistry: registry,
      clock: () => NOW,
      runtime: { scheduleJitterMs: 0 },
    });

    expect(result).toMatchObject({
      skipped: false,
      discovered: 2,
      rejected: 1,
      duplicates: 0,
      published: 1,
    });

    const posts = dbModule.getPosts(agentId);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.text).toContain("Signal —");
    expect(posts[0]?.text).toContain("Fault line —");
    expect(posts[0]?.text).toContain("Builder move —");
    expect(posts[0]?.rationale).toContain("Selected because");
    expect(posts[0]?.rationale).toContain("Relevant now because");
    expect(posts[0]?.rationale).toContain("Chosen over");

    const snapshot = appModule.buildControlRoom(agentId);
    expect(snapshot?.runs).toHaveLength(1);
    expect(snapshot?.editorialLedger).toHaveLength(1);
    expect(snapshot?.editorialLedger[0]?.title).toBe(weakCandidate().title);
    expect(snapshot?.autonomy.postsPublished).toBe(1);
    expect(snapshot?.autonomy.candidatesRejected).toBe(1);
    expect(snapshot?.health.find((item) => item.key === "sources")?.state).toBe(
      "healthy",
    );
  });

  it("blocks published duplicates without duplicating ledger decisions", async () => {
    const agentId = "agent-first-cycle";
    const registry = new SourceRegistry(
      [new FixedAdapter([strongCandidate(), weakCandidate()])],
      { retries: 0, timeoutMs: 1_000 },
    );

    const result = await workerModule.runAgentOnce(agentId, {
      sourceRegistry: registry,
      clock: () => new Date(NOW.getTime() + 60_000),
      runtime: { scheduleJitterMs: 0 },
    });

    expect(result).toMatchObject({
      discovered: 2,
      duplicates: 1,
      published: 0,
      rejected: 2,
    });
    expect(dbModule.getPosts(agentId)).toHaveLength(1);
    expect(dbModule.countRejected(agentId)).toBe(1);
    expect(dbModule.getRejectedDecisions(agentId)).toHaveLength(1);
  });

  it("publishes a qualified deferred topic during a later autonomous cycle", async () => {
    const agentId = "agent-paced-backlog";
    dbModule.createAgent({
      agentId,
      personaName: "Mira",
      personaDomain: "AI Reliability & Security",
      initializedAt: NOW.toISOString(),
      nextRunAt: NOW.toISOString(),
    });
    const registry = new SourceRegistry(
      [new FixedAdapter([strongCandidate(), secondStrongCandidate()])],
      { retries: 0, timeoutMs: 1_000 },
    );

    const first = await workerModule.runAgentOnce(agentId, {
      sourceRegistry: registry,
      clock: () => NOW,
      runtime: { scheduleJitterMs: 0, maxPostsPerRun: 1 },
    });
    const second = await workerModule.runAgentOnce(agentId, {
      sourceRegistry: registry,
      clock: () => new Date(NOW.getTime() + 60_000),
      runtime: { scheduleJitterMs: 0, maxPostsPerRun: 1 },
    });

    expect(first).toMatchObject({ published: 1, rejected: 1, duplicates: 0 });
    expect(second).toMatchObject({ published: 1, rejected: 1, duplicates: 1 });
    expect(dbModule.getPosts(agentId)).toHaveLength(2);
    expect(dbModule.countRejected(agentId)).toBe(0);
    expect(appModule.buildControlRoom(agentId)?.editorialLedger).toHaveLength(0);
  });

  it("collapses historical duplicate decisions into a current unique ledger", () => {
    const agentId = "agent-ledger-compaction";
    const runId = "run-ledger-compaction";
    dbModule.createAgent({
      agentId,
      personaName: "Mira",
      personaDomain: "AI Reliability & Security",
      initializedAt: NOW.toISOString(),
      nextRunAt: new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
    });
    dbModule.createRun({ id: runId, agentId, startedAt: NOW.toISOString() });

    const createDecision = (
      id: string,
      sourceUrl: string,
      verdict: "publish" | "reject",
      decidedAt: string,
      reason = verdict === "publish" ? "Selected." : "Withheld.",
      finalScore = verdict === "publish" ? 90 : 40,
    ): void => {
      dbModule.createDecision({
        id,
        runId,
        agentId,
        title: `Candidate ${id}`,
        finalScore,
        verdict,
        reason,
        sourceUrl,
        decidedAt,
      });
    };

    createDecision(
      "reject-a-editorial",
      "https://example.com/a",
      "reject",
      NOW.toISOString(),
      "Rejected at 40/100 because the topic did not clear the editorial bar.",
      40,
    );
    createDecision(
      "reject-a-duplicate",
      "https://example.com/a",
      "reject",
      new Date(NOW.getTime() + 1_000).toISOString(),
      "Rejected because this exact source/topic fingerprint already exists in durable editorial memory.",
      0,
    );
    createDecision("reject-b", "https://example.com/b", "reject", NOW.toISOString());
    createDecision(
      "publish-b",
      "https://example.com/b",
      "publish",
      new Date(NOW.getTime() + 2_000).toISOString(),
    );

    expect(dbModule.countRejected(agentId)).toBe(1);
    expect(dbModule.getRejectedDecisions(agentId).map((item) => item.id)).toEqual([
      "reject-a-editorial",
    ]);
    expect(appModule.buildControlRoom(agentId)?.editorialLedger).toHaveLength(1);
  });

  it("uses a durable lease so concurrent workers cannot double-publish", async () => {
    const agentId = "agent-concurrency";
    dbModule.createAgent({
      agentId,
      personaName: "Mira",
      personaDomain: "AI Reliability & Security",
      initializedAt: NOW.toISOString(),
      nextRunAt: NOW.toISOString(),
    });
    const registry = new SourceRegistry(
      [new FixedAdapter([strongCandidate()], 50)],
      { retries: 0, timeoutMs: 1_000 },
    );

    const results = await Promise.all([
      workerModule.runAgentOnce(agentId, { sourceRegistry: registry }),
      workerModule.runAgentOnce(agentId, { sourceRegistry: registry }),
    ]);

    expect(results.filter((result) => result.skipped)).toHaveLength(1);
    expect(dbModule.getPosts(agentId)).toHaveLength(1);
  });

  it("runs due agents without any feed or browser request", async () => {
    const agentId = "agent-scheduled";
    dbModule.createAgent({
      agentId,
      personaName: "Mira",
      personaDomain: "AI Reliability & Security",
      initializedAt: NOW.toISOString(),
      nextRunAt: NOW.toISOString(),
    });

    const result = await schedulerModule.runDueAgentsOnce({
      clock: () => NOW,
      runtime: { scheduleJitterMs: 0 },
      sourceRegistryFactory: () =>
        new SourceRegistry([new FixedAdapter([strongCandidate()])], {
          retries: 0,
          timeoutMs: 1_000,
        }),
    });

    expect(result).toEqual({ due: 1, completed: 1, failed: 0 });
    expect(dbModule.getPosts(agentId)).toHaveLength(1);
  });

  it("retries a transient source failure within a bounded timeout", async () => {
    let attempts = 0;
    const adapter: SourceAdapter = {
      kind: "nvd",
      name: "Retry source",
      async fetchCandidates() {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("temporary upstream failure");
        }

        return [strongCandidate()];
      },
    };
    const registry = new SourceRegistry([adapter], {
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 500,
    });

    const [result] = await registry.fetchAll();
    expect(result?.error).toBeNull();
    expect(result?.attempts).toBe(2);
    expect(result?.candidates).toHaveLength(1);
  });

  it("allows the configured Vercel origin and rejects unknown preflights", async () => {
    const previousOrigins = process.env.FAULTLINE_CORS_ORIGINS;
    process.env.FAULTLINE_CORS_ORIGINS = "https://mira-test.vercel.app";

    const server = createServer((request, response) => {
      void appModule.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address.");
    }

    try {
      const allowed = await fetch(
        `http://127.0.0.1:${address.port}/api/agent/init`,
        {
          method: "OPTIONS",
          headers: {
            Origin: "https://mira-test.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
          },
        },
      );

      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe(
        "https://mira-test.vercel.app",
      );
      expect(allowed.headers.get("access-control-allow-methods")).toContain(
        "POST",
      );

      const rejected = await fetch(
        `http://127.0.0.1:${address.port}/api/agent/init`,
        {
          method: "OPTIONS",
          headers: {
            Origin: "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
          },
        },
      );

      expect(rejected.status).toBe(403);
      expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      if (previousOrigins === undefined) {
        delete process.env.FAULTLINE_CORS_ORIGINS;
      } else {
        process.env.FAULTLINE_CORS_ORIGINS = previousOrigins;
      }
    }
  });
});
