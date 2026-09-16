import { getRuntimeConfig, type RuntimeConfig } from "./config.js";
import { getDueAgentIds, touchWorkerHeartbeat } from "./db.js";
import { SourceRegistry } from "./sources/index.js";
import { runAgentOnce } from "./worker.js";

export interface SchedulerOptions {
  runtime?: Partial<RuntimeConfig>;
  clock?: () => Date;
  sourceRegistryFactory?: () => SourceRegistry;
  logger?: Pick<Console, "error" | "info">;
}

export interface SchedulerTickResult {
  due: number;
  completed: number;
  failed: number;
}

export async function runDueAgentsOnce(
  options: SchedulerOptions = {},
): Promise<SchedulerTickResult> {
  const clock = options.clock ?? (() => new Date());
  const now = clock();
  await touchWorkerHeartbeat(now.toISOString());
  const dueAgentIds = await getDueAgentIds(now.toISOString());
  const results = await Promise.allSettled(
    dueAgentIds.map((agentId) =>
      runAgentOnce(agentId, {
        clock,
        runtime: options.runtime,
        sourceRegistry: options.sourceRegistryFactory?.(),
      }),
    ),
  );

  return {
    due: dueAgentIds.length,
    completed: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

export function startAutonomousScheduler(options: SchedulerOptions = {}) {
  const runtime = { ...getRuntimeConfig(), ...options.runtime };
  const logger = options.logger ?? console;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const scheduleNextTick = (): void => {
    if (stopped) {
      return;
    }

    timer = setTimeout(() => void tick(), runtime.pollMs);
  };

  const tick = async (): Promise<void> => {
    if (stopped || running) {
      scheduleNextTick();
      return;
    }

    running = true;

    try {
      const result = await runDueAgentsOnce({ ...options, runtime });

      if (result.due > 0) {
        logger.info(
          `FAULTLINE scheduler processed ${result.due} due agent(s): ${result.completed} completed, ${result.failed} failed.`,
        );
      }
    } catch (error) {
      logger.error("FAULTLINE scheduler tick failed:", error);
    } finally {
      running = false;
      scheduleNextTick();
    }
  };

  void tick();

  return {
    stop(): void {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
