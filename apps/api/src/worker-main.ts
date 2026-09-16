import { initializeDatabase } from "./db.js";
import { startAutonomousScheduler } from "./scheduler.js";

await initializeDatabase();

const scheduler = startAutonomousScheduler();

console.log("FAULTLINE autonomous worker is polling durable schedules.");

function shutdown(): void {
  scheduler.stop();
  process.exitCode = 0;
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
