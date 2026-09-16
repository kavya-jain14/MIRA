import { randomUUID } from "node:crypto";

import { getRuntimeConfig, scheduleAt, type RuntimeConfig } from "./config.js";
import {
  acquireAgentLease,
  completeRun,
  createDecision,
  createRun,
  getAgent,
  releaseAgentLease,
  updateAgentWorkerState,
  upsertSourceHealth,
  withTransaction,
} from "./db.js";
import { EditorialMemory } from "./editorial/memory.js";
import { EditorialPipeline, type ProcessedCandidate } from "./editorial/pipeline.js";
import { publishCandidate } from "./editorial/publish.js";
import { SourceRegistry } from "./sources/index.js";

export interface WorkerRunResult {
  runId: string | null;
  skipped: boolean;
  discovered: number;
  rejected: number;
  duplicates: number;
  published: number;
  degraded: boolean;
}

export interface RunAgentOptions {
  sourceRegistry?: SourceRegistry;
  memory?: EditorialMemory;
  clock?: () => Date;
  runtime?: Partial<RuntimeConfig>;
}

function orderedCandidates(items: ProcessedCandidate[]): ProcessedCandidate[] {
  return [...items].sort((left, right) => {
    const scoreDifference =
      right.editorialScore.total - left.editorialScore.total;

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return Date.parse(right.candidate.publishedAt) - Date.parse(left.candidate.publishedAt);
  });
}

export async function runAgentOnce(
  agentId: string,
  options: RunAgentOptions = {},
): Promise<WorkerRunResult> {
  const agent = await getAgent(agentId);

  if (!agent) {
    throw new Error(`Agent ${agentId} does not exist.`);
  }

  const runtime = { ...getRuntimeConfig(), ...options.runtime };
  const clock = options.clock ?? (() => new Date());
  const leaseToken = randomUUID();
  const leaseStartedAt = clock();
  const acquired = await acquireAgentLease({
    agentId,
    token: leaseToken,
    now: leaseStartedAt.toISOString(),
    lockedUntil: new Date(
      leaseStartedAt.getTime() + runtime.leaseMs,
    ).toISOString(),
  });

  if (!acquired) {
    return {
      runId: null,
      skipped: true,
      discovered: 0,
      rejected: 0,
      duplicates: 0,
      published: 0,
      degraded: false,
    };
  }

  const runId = randomUUID();
  const startedAt = clock().toISOString();
  let discovered = 0;
  let rejected = 0;
  let duplicates = 0;
  let published = 0;

  await createRun({ id: runId, agentId, startedAt });

  try {
    await updateAgentWorkerState(agentId, {
      workerState: "discovering",
      workerHeartbeatAt: startedAt,
    });

    const registry = options.sourceRegistry ?? new SourceRegistry();
    const sourceResults = await registry.fetchAll();
    const candidates = sourceResults.flatMap((result) => result.candidates);
    const sourceErrors = sourceResults
      .filter((result) => result.error !== null)
      .map((result) => `${result.source}: ${result.error}`);

    await Promise.all(
      sourceResults.map((result) =>
        upsertSourceHealth({
          key: result.source,
          label: result.label,
          state: result.error ? "degraded" : "healthy",
          detail: result.error
            ? `Fetch failed after ${result.attempts} attempt(s): ${result.error}`
            : `${result.candidates.length} candidate(s) fetched in ${result.attempts} attempt(s).`,
          checkedAt: result.checkedAt,
        }),
      ),
    );

    discovered = candidates.length;
    await updateAgentWorkerState(agentId, {
      workerState: "judging",
      workerHeartbeatAt: clock().toISOString(),
    });

    const pipeline = new EditorialPipeline(
      options.memory ?? new EditorialMemory(agentId),
      agent.personaDomain,
    );
    const completedAt = clock();
    const degraded = sourceErrors.length > 0;

    await withTransaction(async () => {
      const pipelineResult = await pipeline.process(candidates, completedAt);
      duplicates = pipelineResult.duplicates.length;

      const qualified = orderedCandidates(pipelineResult.accepted);
      const selected = qualified.slice(0, runtime.maxPostsPerRun);
      const selectedFingerprints = new Set(
        selected.map((item) => item.fingerprint),
      );
      rejected = pipelineResult.processed.length - selected.length;

      await updateAgentWorkerState(agentId, {
        workerState: selected.length > 0 ? "publishing" : "judging",
        workerHeartbeatAt: completedAt.toISOString(),
      });

      for (const item of pipelineResult.processed) {
        const isSelected = selectedFingerprints.has(item.fingerprint);
        const shouldRecordDecision = isSelected || !item.seenBefore;

        if (!shouldRecordDecision) {
          continue;
        }

        const reason =
          item.decision === "accepted" && !isSelected
            ? `Deferred at ${item.editorialScore.total}/100 because a stronger candidate was selected for this paced publishing cycle.`
            : item.reasons.join(" ");

        await createDecision({
          id: randomUUID(),
          runId,
          agentId,
          title: item.candidate.title,
          finalScore: item.editorialScore.total,
          verdict: isSelected ? "publish" : "reject",
          reason,
          sourceUrl: item.candidate.url,
          decidedAt: completedAt.toISOString(),
        });
      }

      for (const item of selected) {
        const result = await publishCandidate(agent, item, {
          candidatesConsidered: discovered,
          candidatesRejected: rejected,
          runnerUpScore: qualified[1]?.editorialScore.total ?? null,
        });

        if (result.published) {
          published += 1;
        }
      }

      const nextRunAt = scheduleAt(
        runtime.intervalMs,
        runtime.scheduleJitterMs,
        completedAt,
      );
      const summary = [
        `Discovered ${discovered}; rejected or deferred ${rejected}; published ${published}.`,
        duplicates > 0
          ? `${duplicates} durable-memory duplicate(s) were blocked.`
          : "No exact duplicate reached publishing.",
        sourceErrors.length > 0
          ? `Partial source failure: ${sourceErrors.join(" | ")}`
          : "All configured primary sources responded.",
      ].join(" ");

      await completeRun({
        id: runId,
        completedAt: completedAt.toISOString(),
        status: degraded ? "partial" : "completed",
        discovered,
        rejected,
        published,
        summary,
      });
      await updateAgentWorkerState(agentId, {
        workerState: degraded ? "degraded" : "idle",
        lastRunAt: completedAt.toISOString(),
        nextRunAt,
        workerHeartbeatAt: completedAt.toISOString(),
      });
    });

    return {
      runId,
      skipped: false,
      discovered,
      rejected,
      duplicates,
      published,
      degraded,
    };
  } catch (error) {
    const completedAt = clock();
    const message = error instanceof Error ? error.message : String(error);

    await withTransaction(async () => {
      await completeRun({
        id: runId,
        completedAt: completedAt.toISOString(),
        status: "failed",
        discovered,
        rejected,
        published,
        summary: `Worker failed safely: ${message}`,
      });
      await updateAgentWorkerState(agentId, {
        workerState: "degraded",
        lastRunAt: completedAt.toISOString(),
        nextRunAt: scheduleAt(runtime.failureRetryMs, 0, completedAt),
        workerHeartbeatAt: completedAt.toISOString(),
      });
    });

    throw error;
  } finally {
    await releaseAgentLease(agentId, leaseToken);
  }
}
