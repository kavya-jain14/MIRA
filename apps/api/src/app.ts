import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  ControlRoomSnapshotSchema,
  FeedResponseSchema,
  InitializeAgentRequestSchema,
  InitializeAgentResponseSchema,
} from "@faultline/contracts";

import {
  countPosts,
  countRejected,
  createAgent,
  getAgent,
  getPosts,
  getRejectedDecisions,
  getRuns,
  getSourceHealth,
} from "./db.js";
import { getRuntimeConfig, scheduleAt } from "./config.js";
import { handleApiCors } from "./cors.js";
import {
  normalizePublishedPostText,
  normalizeSourceProse,
} from "./editorial/generator.js";

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  response.statusCode = status;
  response.setHeader(
    "Content-Type",
    "application/json; charset=utf-8",
  );
  response.end(JSON.stringify(payload));
}

function now(): string {
  return new Date().toISOString();
}

async function readBody(
  request: IncomingMessage,
): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function createAgentId(personaName: string): string {
  const slug = personaName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `faultline-${slug || "agent"}-${randomUUID().slice(0, 6)}`;
}

export function buildControlRoom(agentId: string) {
  const agent = getAgent(agentId);

  if (!agent) {
    return null;
  }

  const checkedAt = now();
  const runtime = getRuntimeConfig();
  const heartbeatAge = agent.workerHeartbeatAt
    ? Date.now() - Date.parse(agent.workerHeartbeatAt)
    : Number.POSITIVE_INFINITY;
  const workerHealthy = heartbeatAge <= Math.max(60_000, runtime.pollMs * 5);
  const sourceHealth = getSourceHealth();
  const sourceState =
    sourceHealth.length === 0
      ? "unknown"
      : sourceHealth.every((item) => item.state === "healthy")
        ? "healthy"
        : sourceHealth.some((item) => item.state === "healthy")
          ? "degraded"
          : "offline";

  return ControlRoomSnapshotSchema.parse({
    agentId,

    autonomy: {
      initializedAt: agent.initializedAt,
      lastRunAt: agent.lastRunAt,
      nextRunAt: agent.nextRunAt,
      postsPublished: countPosts(agentId),
      candidatesRejected: countRejected(agentId),
      workerState: agent.workerState,
    },

    editorialLedger: getRejectedDecisions(agentId)
      .map((decision) => ({
        id: decision.id,
        title: decision.title,
        finalScore: decision.finalScore,
        reason: decision.reason,
        sourceUrl: decision.sourceUrl,
        decidedAt: decision.decidedAt,
      })),

    runs: getRuns(agentId).map((run) => ({
      id: run.id,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      status: run.status === "completed" || run.status === "running" ||
        run.status === "partial" || run.status === "failed"
        ? run.status
        : "partial",
      discovered: run.discovered,
      rejected: run.rejected,
      published: run.published,
      summary: run.summary,
    })),

    health: [
      {
        key: "api",
        label: "API",
        state: "healthy",
        detail: "API process is responding.",
        checkedAt,
      },
      {
        key: "worker",
        label: "Autonomous worker",
        state: workerHealthy
          ? "healthy"
          : agent.workerHeartbeatAt
            ? "offline"
            : "unknown",
        detail: workerHealthy
          ? `Durable scheduler heartbeat received at ${agent.workerHeartbeatAt}.`
          : agent.workerHeartbeatAt
            ? `Last scheduler heartbeat at ${agent.workerHeartbeatAt} is stale.`
            : "Waiting for the first durable scheduler heartbeat.",
        checkedAt,
      },
      {
        key: "database",
        label: "Database",
        state: "healthy",
        detail: "Durable SQLite database is available.",
        checkedAt,
      },
      {
        key: "sources",
        label: "Primary sources",
        state: sourceState,
        detail:
          sourceHealth.length === 0
            ? "No source fetch has completed yet."
            : sourceHealth
                .map((item) => `${item.label}: ${item.state}`)
                .join("; ")
                .slice(0, 300),
        checkedAt,
      },
    ],
  });
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );

  if (handleApiCors(request, response, url.pathname)) {
    return;
  }

  /*
   * Health endpoint
   */
  if (
    request.method === "GET" &&
    url.pathname === "/health"
  ) {
    sendJson(response, 200, {
      status: "ok",
      service: "faultline-api",
      checkedAt: now(),
    });

    return;
  }

  /*
   * POST /api/agent/init
   */
  if (
    request.method === "POST" &&
    url.pathname === "/api/agent/init"
  ) {
    let body: unknown;

    try {
      body = JSON.parse(await readBody(request));
    } catch {
      sendJson(response, 400, {
        message: "Request body must be valid JSON.",
      });

      return;
    }

    const parsed =
      InitializeAgentRequestSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        message: "Invalid agent initialization payload.",
      });

      return;
    }

    const initializedAt = now();

    /*
     * Important:
     * This only schedules a future run.
     * It does NOT execute discovery or publishing.
     */
    const nextRunAt = scheduleAt(
      getRuntimeConfig().initialDelayMs,
      0,
      new Date(initializedAt),
    );

    const agentId = createAgentId(
      parsed.data.persona.name,
    );

    createAgent({
      agentId,
      personaName: parsed.data.persona.name,
      personaDomain: parsed.data.persona.domain,
      initializedAt,
      nextRunAt,
    });

    const payload =
      InitializeAgentResponseSchema.parse({
        agentId,
      });

    sendJson(response, 201, payload);

    return;
  }

  /*
   * GET /api/agent/feed
   *
   * READ ONLY.
   *
   * This endpoint never:
   * - discovers sources
   * - calls an LLM
   * - judges candidates
   * - publishes
   * - starts a worker
   */
  if (
    request.method === "GET" &&
    url.pathname === "/api/agent/feed"
  ) {
    const agentId = url.searchParams.get("agentId");

    if (!agentId) {
      sendJson(response, 400, {
        message: "agentId is required.",
      });

      return;
    }

    if (!getAgent(agentId)) {
      sendJson(response, 404, {
        message: "Agent not found.",
      });

      return;
    }

    const posts = getPosts(agentId);

    const payload = FeedResponseSchema.parse({
      posts: posts.map((post) => ({
        id: post.id,
        createdAt: post.createdAt,
        text: normalizePublishedPostText(post.text),
        rationale: normalizeSourceProse(post.rationale).replace(
          /because It\b/g,
          "because it",
        ),
        sources: post.sources,
      })),
    });

    sendJson(response, 200, payload);

    return;
  }

  /*
   * GET /api/agent/control-room
   */
  if (
    request.method === "GET" &&
    url.pathname === "/api/agent/control-room"
  ) {
    const agentId = url.searchParams.get("agentId");

    if (!agentId) {
      sendJson(response, 400, {
        message: "agentId is required.",
      });

      return;
    }

    const snapshot = buildControlRoom(agentId);

    if (!snapshot) {
      sendJson(response, 404, {
        message: "Agent not found.",
      });

      return;
    }

    sendJson(response, 200, snapshot);

    return;
  }
  sendJson(response, 404, {
    message: "Route not found.",
  });
}
