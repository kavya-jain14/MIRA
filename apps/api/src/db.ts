import { AsyncLocalStorage } from "node:async_hooks";

import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

export type WorkerState =
  | "idle"
  | "discovering"
  | "judging"
  | "publishing"
  | "degraded";

export interface AgentRecord {
  agentId: string;
  personaName: string;
  personaDomain: string;
  initializedAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  workerState: WorkerState;
  workerHeartbeatAt: string | null;
  lockToken: string | null;
  lockedUntil: string | null;
}

export interface PostRecord {
  id: string;
  agentId: string;
  fingerprint: string | null;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
}

export interface DecisionRecord {
  id: string;
  runId: string | null;
  agentId: string;
  title: string;
  finalScore: number;
  verdict: "publish" | "reject";
  reason: string;
  sourceUrl: string;
  decidedAt: string;
}

export interface RunRecord {
  id: string;
  agentId: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "partial" | "failed";
  discovered: number;
  rejected: number;
  published: number;
  summary: string;
}

export interface MemoryRecord {
  agentId: string;
  fingerprint: string;
  sourceId: string;
  sourceKind: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  publishedPostId: string | null;
}

export interface SourceHealthRecord {
  key: string;
  label: string;
  state: "healthy" | "degraded" | "offline" | "unknown";
  detail: string;
  checkedAt: string;
}

interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

const transactionClient = new AsyncLocalStorage<PoolClient>();
let poolPromise: Promise<Pool> | null = null;
let initializationPromise: Promise<void> | null = null;

async function createPool(): Promise<Pool> {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (connectionString) {
    return new Pool({
      connectionString,
      max: Number(process.env.FAULTLINE_DB_POOL_SIZE ?? 5),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  if (
    process.env.NODE_ENV === "test" ||
    process.env.FAULTLINE_USE_IN_MEMORY_DB === "true"
  ) {
    const { newDb } = await import("pg-mem");
    const memory = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = memory.adapters.createPg();

    return new adapter.Pool() as unknown as Pool;
  }

  throw new Error(
    "DATABASE_URL is required. Set FAULTLINE_USE_IN_MEMORY_DB=true only for local disposable development.",
  );
}

async function getPool(): Promise<Pool> {
  poolPromise ??= createPool();
  return poolPromise;
}

async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<R>> {
  await initializeDatabase();
  const activeClient = transactionClient.getStore();
  const executor: Queryable = activeClient ?? (await getPool());

  return executor.query<R>(text, values);
}

export async function initializeDatabase(): Promise<void> {
  initializationPromise ??= (async () => {
    const pool = await getPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        persona_name TEXT NOT NULL,
        persona_domain TEXT NOT NULL,
        initialized_at TEXT NOT NULL,
        next_run_at TEXT,
        last_run_at TEXT,
        worker_state TEXT NOT NULL,
        worker_heartbeat_at TEXT,
        lock_token TEXT,
        locked_until TEXT
      );

      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(agent_id),
        fingerprint TEXT,
        created_at TEXT NOT NULL,
        text TEXT NOT NULL,
        rationale TEXT NOT NULL,
        sources_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(agent_id),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        discovered INTEGER NOT NULL DEFAULT 0,
        rejected INTEGER NOT NULL DEFAULT 0,
        published INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        run_id TEXT REFERENCES runs(id),
        agent_id TEXT NOT NULL REFERENCES agents(agent_id),
        title TEXT NOT NULL,
        final_score INTEGER NOT NULL,
        verdict TEXT NOT NULL DEFAULT 'reject',
        reason TEXT NOT NULL,
        source_url TEXT NOT NULL,
        decided_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memories (
        agent_id TEXT NOT NULL REFERENCES agents(agent_id),
        fingerprint TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        seen_count INTEGER NOT NULL DEFAULT 1,
        published_post_id TEXT REFERENCES posts(id),
        PRIMARY KEY (agent_id, fingerprint)
      );

      CREATE TABLE IF NOT EXISTS source_health (
        source_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        state TEXT NOT NULL,
        detail TEXT NOT NULL,
        checked_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agents_due
        ON agents(next_run_at);

      CREATE INDEX IF NOT EXISTS idx_posts_agent_created
        ON posts(agent_id, created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_agent_fingerprint
        ON posts(agent_id, fingerprint)
        WHERE fingerprint IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_runs_agent_started
        ON runs(agent_id, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_decisions_agent_decided
        ON decisions(agent_id, decided_at DESC);

      CREATE INDEX IF NOT EXISTS decisions_agent_source_verdict_idx
        ON decisions(agent_id, source_url, verdict, decided_at);
    `);
  })();

  return initializationPromise;
}

export async function closeDatabase(): Promise<void> {
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise;
  await pool.end();
  poolPromise = null;
  initializationPromise = null;
}

export async function withTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  await initializeDatabase();
  const existingClient = transactionClient.getStore();

  if (existingClient) {
    return operation();
  }

  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await transactionClient.run(client, operation);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createAgent(input: {
  agentId: string;
  personaName: string;
  personaDomain: string;
  initializedAt: string;
  nextRunAt: string;
}): Promise<AgentRecord> {
  await query(
    `INSERT INTO agents (
      agent_id, persona_name, persona_domain, initialized_at,
      next_run_at, last_run_at, worker_state, worker_heartbeat_at,
      lock_token, locked_until
    ) VALUES ($1, $2, $3, $4, $5, NULL, 'idle', NULL, NULL, NULL)`,
    [
      input.agentId,
      input.personaName,
      input.personaDomain,
      input.initializedAt,
      input.nextRunAt,
    ],
  );

  const agent = await getAgent(input.agentId);

  if (!agent) {
    throw new Error("Agent was not persisted.");
  }

  return agent;
}

export async function getAgent(agentId: string): Promise<AgentRecord | null> {
  const result = await query<AgentRecord>(
    `SELECT
      agent_id AS "agentId",
      persona_name AS "personaName",
      persona_domain AS "personaDomain",
      initialized_at AS "initializedAt",
      next_run_at AS "nextRunAt",
      last_run_at AS "lastRunAt",
      worker_state AS "workerState",
      worker_heartbeat_at AS "workerHeartbeatAt",
      lock_token AS "lockToken",
      locked_until AS "lockedUntil"
    FROM agents
    WHERE agent_id = $1`,
    [agentId],
  );

  return result.rows[0] ?? null;
}

export async function getDueAgentIds(
  now: string,
  limit = 25,
): Promise<string[]> {
  const result = await query<{
    agentId: string;
    nextRunAt: string;
    lockedUntil: string | null;
  }>(
    `SELECT agent_id AS "agentId", next_run_at AS "nextRunAt",
      locked_until AS "lockedUntil"
    FROM agents
    WHERE next_run_at IS NOT NULL
    ORDER BY next_run_at ASC`,
  );

  const nowMs = Date.parse(now);

  return result.rows
    .filter((row) => {
      const nextRunMs = Date.parse(row.nextRunAt);
      const lockedUntilMs = row.lockedUntil
        ? Date.parse(row.lockedUntil)
        : Number.NEGATIVE_INFINITY;

      return nextRunMs <= nowMs && lockedUntilMs <= nowMs;
    })
    .slice(0, limit)
    .map((row) => row.agentId);
}

export async function acquireAgentLease(input: {
  agentId: string;
  token: string;
  now: string;
  lockedUntil: string;
}): Promise<boolean> {
  const result = await query(
    `UPDATE agents
    SET lock_token = $1, locked_until = $2
    WHERE agent_id = $3
      AND (locked_until IS NULL OR locked_until <= $4)`,
    [input.token, input.lockedUntil, input.agentId, input.now],
  );

  return result.rowCount === 1;
}

export async function releaseAgentLease(
  agentId: string,
  token: string,
): Promise<void> {
  await query(
    `UPDATE agents
    SET lock_token = NULL, locked_until = NULL
    WHERE agent_id = $1 AND lock_token = $2`,
    [agentId, token],
  );
}

export async function touchWorkerHeartbeat(checkedAt: string): Promise<void> {
  await query("UPDATE agents SET worker_heartbeat_at = $1", [checkedAt]);
}

export async function updateAgentWorkerState(
  agentId: string,
  input: {
    workerState: WorkerState;
    lastRunAt?: string | null;
    nextRunAt?: string | null;
    workerHeartbeatAt?: string | null;
  },
): Promise<AgentRecord> {
  const current = await getAgent(agentId);

  if (!current) {
    throw new Error(`Agent ${agentId} does not exist.`);
  }

  const has = (key: keyof typeof input): boolean =>
    Object.prototype.hasOwnProperty.call(input, key);

  await query(
    `UPDATE agents
    SET worker_state = $1, last_run_at = $2, next_run_at = $3,
        worker_heartbeat_at = $4
    WHERE agent_id = $5`,
    [
      input.workerState,
      has("lastRunAt") ? input.lastRunAt ?? null : current.lastRunAt,
      has("nextRunAt") ? input.nextRunAt ?? null : current.nextRunAt,
      has("workerHeartbeatAt")
        ? input.workerHeartbeatAt ?? null
        : current.workerHeartbeatAt,
      agentId,
    ],
  );

  const updated = await getAgent(agentId);

  if (!updated) {
    throw new Error("Agent was not updated.");
  }

  return updated;
}

export async function getPosts(agentId: string): Promise<PostRecord[]> {
  const result = await query<{
    id: string;
    agentId: string;
    fingerprint: string | null;
    createdAt: string;
    text: string;
    rationale: string;
    sourcesJson: string;
  }>(
    `SELECT id, agent_id AS "agentId", fingerprint,
      created_at AS "createdAt", text, rationale,
      sources_json AS "sourcesJson"
    FROM posts
    WHERE agent_id = $1
    ORDER BY created_at DESC, id DESC`,
    [agentId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    fingerprint: row.fingerprint,
    createdAt: row.createdAt,
    text: row.text,
    rationale: row.rationale,
    sources: JSON.parse(row.sourcesJson) as string[],
  }));
}

export async function countPosts(agentId: string): Promise<number> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM posts WHERE agent_id = $1",
    [agentId],
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function createPost(input: {
  id: string;
  agentId: string;
  fingerprint: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
}): Promise<PostRecord> {
  await query(
    `INSERT INTO posts (
      id, agent_id, fingerprint, created_at, text, rationale, sources_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.id,
      input.agentId,
      input.fingerprint,
      input.createdAt,
      input.text,
      input.rationale,
      JSON.stringify(input.sources),
    ],
  );

  const post = (await getPosts(input.agentId)).find(
    (item) => item.id === input.id,
  );

  if (!post) {
    throw new Error("Post was not persisted.");
  }

  return post;
}

export async function countRejected(agentId: string): Promise<number> {
  const result = await query<{
    sourceUrl: string;
    verdict: "publish" | "reject";
  }>(
    `SELECT source_url AS "sourceUrl", verdict
    FROM decisions
    WHERE agent_id = $1`,
    [agentId],
  );
  const published = new Set(
    result.rows
      .filter((row) => row.verdict === "publish")
      .map((row) => row.sourceUrl),
  );
  const rejected = new Set(
    result.rows
      .filter(
        (row) =>
          row.verdict === "reject" && !published.has(row.sourceUrl),
      )
      .map((row) => row.sourceUrl),
  );

  return rejected.size;
}

export async function createRun(input: {
  id: string;
  agentId: string;
  startedAt: string;
}): Promise<void> {
  await query(
    `INSERT INTO runs (
      id, agent_id, started_at, completed_at, status,
      discovered, rejected, published, summary
    ) VALUES ($1, $2, $3, NULL, 'running', 0, 0, 0, 'Run in progress.')`,
    [input.id, input.agentId, input.startedAt],
  );
}

export async function completeRun(input: {
  id: string;
  completedAt: string;
  status: "completed" | "partial" | "failed";
  discovered: number;
  rejected: number;
  published: number;
  summary: string;
}): Promise<void> {
  await query(
    `UPDATE runs
    SET completed_at = $1, status = $2, discovered = $3, rejected = $4,
        published = $5, summary = $6
    WHERE id = $7`,
    [
      input.completedAt,
      input.status,
      input.discovered,
      input.rejected,
      input.published,
      input.summary.slice(0, 500),
      input.id,
    ],
  );
}

export async function getRuns(
  agentId: string,
  limit = 100,
): Promise<RunRecord[]> {
  const result = await query<RunRecord>(
    `SELECT id, agent_id AS "agentId", started_at AS "startedAt",
      completed_at AS "completedAt", status, discovered, rejected,
      published, summary
    FROM runs
    WHERE agent_id = $1
    ORDER BY started_at DESC, id DESC
    LIMIT $2`,
    [agentId, limit],
  );

  return result.rows;
}

export async function createDecision(input: {
  id: string;
  runId: string;
  agentId: string;
  title: string;
  finalScore: number;
  verdict: "publish" | "reject";
  reason: string;
  sourceUrl: string;
  decidedAt: string;
}): Promise<void> {
  await query(
    `INSERT INTO decisions (
      id, run_id, agent_id, title, final_score, verdict,
      reason, source_url, decided_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.id,
      input.runId,
      input.agentId,
      input.title,
      input.finalScore,
      input.verdict,
      input.reason.slice(0, 1_000),
      input.sourceUrl,
      input.decidedAt,
    ],
  );
}

export async function getDecisions(
  agentId: string,
  limit = 100,
): Promise<DecisionRecord[]> {
  const result = await query<DecisionRecord>(
    `SELECT id, run_id AS "runId", agent_id AS "agentId", title,
      final_score AS "finalScore", verdict, reason,
      source_url AS "sourceUrl", decided_at AS "decidedAt"
    FROM decisions
    WHERE agent_id = $1
    ORDER BY decided_at DESC, id DESC
    LIMIT $2`,
    [agentId, limit],
  );

  return result.rows;
}

export async function getRejectedDecisions(
  agentId: string,
  limit = 100,
): Promise<DecisionRecord[]> {
  const decisions = await getDecisions(agentId, 10_000);
  const published = new Set(
    decisions
      .filter((decision) => decision.verdict === "publish")
      .map((decision) => decision.sourceUrl),
  );
  const selected = new Map<string, DecisionRecord>();
  const isDuplicateReason = (reason: string): boolean =>
    reason.startsWith(
      "Rejected because this exact source/topic fingerprint already exists",
    ) || reason.startsWith(
      "Rejected because this exact source/topic has already been published",
    );

  for (const decision of decisions) {
    if (
      decision.verdict !== "reject" ||
      published.has(decision.sourceUrl)
    ) {
      continue;
    }

    const existing = selected.get(decision.sourceUrl);

    if (!existing || (isDuplicateReason(existing.reason) && !isDuplicateReason(decision.reason))) {
      selected.set(decision.sourceUrl, decision);
    }
  }

  return [...selected.values()]
    .sort((left, right) => {
      const timeDifference =
        Date.parse(right.decidedAt) - Date.parse(left.decidedAt);

      return timeDifference !== 0
        ? timeDifference
        : right.id.localeCompare(left.id);
    })
    .slice(0, limit);
}

export async function getMemory(
  agentId: string,
  fingerprint: string,
): Promise<MemoryRecord | null> {
  const result = await query<MemoryRecord>(
    `SELECT agent_id AS "agentId", fingerprint, source_id AS "sourceId",
      source_kind AS "sourceKind", title, summary,
      canonical_url AS "canonicalUrl", first_seen_at AS "firstSeenAt",
      last_seen_at AS "lastSeenAt", seen_count AS "seenCount",
      published_post_id AS "publishedPostId"
    FROM memories
    WHERE agent_id = $1 AND fingerprint = $2`,
    [agentId, fingerprint],
  );

  const record = result.rows[0];
  return record ? { ...record, seenCount: Number(record.seenCount) } : null;
}

export async function listMemories(
  agentId: string,
  limit = 500,
): Promise<MemoryRecord[]> {
  const result = await query<MemoryRecord>(
    `SELECT agent_id AS "agentId", fingerprint, source_id AS "sourceId",
      source_kind AS "sourceKind", title, summary,
      canonical_url AS "canonicalUrl", first_seen_at AS "firstSeenAt",
      last_seen_at AS "lastSeenAt", seen_count AS "seenCount",
      published_post_id AS "publishedPostId"
    FROM memories
    WHERE agent_id = $1
    ORDER BY last_seen_at DESC
    LIMIT $2`,
    [agentId, limit],
  );

  return result.rows.map((row) => ({
    ...row,
    seenCount: Number(row.seenCount),
  }));
}

export async function upsertMemory(
  input: Omit<MemoryRecord, "seenCount" | "publishedPostId">,
): Promise<MemoryRecord> {
  await query(
    `INSERT INTO memories (
      agent_id, fingerprint, source_id, source_kind, title, summary,
      canonical_url, first_seen_at, last_seen_at, seen_count, published_post_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL)
    ON CONFLICT(agent_id, fingerprint) DO UPDATE SET
      last_seen_at = EXCLUDED.last_seen_at,
      seen_count = memories.seen_count + 1`,
    [
      input.agentId,
      input.fingerprint,
      input.sourceId,
      input.sourceKind,
      input.title,
      input.summary,
      input.canonicalUrl,
      input.firstSeenAt,
      input.lastSeenAt,
    ],
  );

  const record = await getMemory(input.agentId, input.fingerprint);

  if (!record) {
    throw new Error("Editorial memory was not persisted.");
  }

  return record;
}

export async function markMemoryPublished(
  agentId: string,
  fingerprint: string,
  postId: string,
): Promise<void> {
  await query(
    `UPDATE memories
    SET published_post_id = $1
    WHERE agent_id = $2 AND fingerprint = $3`,
    [postId, agentId, fingerprint],
  );
}

export async function upsertSourceHealth(
  input: SourceHealthRecord,
): Promise<void> {
  await query(
    `INSERT INTO source_health (
      source_key, label, state, detail, checked_at
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(source_key) DO UPDATE SET
      label = EXCLUDED.label,
      state = EXCLUDED.state,
      detail = EXCLUDED.detail,
      checked_at = EXCLUDED.checked_at`,
    [
      input.key,
      input.label,
      input.state,
      input.detail.slice(0, 300),
      input.checkedAt,
    ],
  );
}

export async function getSourceHealth(): Promise<SourceHealthRecord[]> {
  const result = await query<SourceHealthRecord>(
    `SELECT source_key AS key, label, state, detail, checked_at AS "checkedAt"
    FROM source_health
    ORDER BY source_key ASC`,
  );

  return result.rows;
}
