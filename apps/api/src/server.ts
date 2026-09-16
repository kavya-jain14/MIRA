import { createServer } from "node:http";

import { handleRequest } from "./app.js";
import { initializeDatabase } from "./db.js";
import { startAutonomousScheduler } from "./scheduler.js";
import { serveWebApp } from "./static.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

await initializeDatabase();

const server = createServer(
  (request, response) => {
    void serveWebApp(request, response).then((served) => {
      if (!served) {
        return handleRequest(request, response);
      }

      return undefined;
    }).catch(
      (error: unknown) => {
        console.error(
          "Unhandled API error:",
          error,
        );

        if (!response.headersSent) {
          response.statusCode = 500;

          response.setHeader(
            "Content-Type",
            "application/json; charset=utf-8",
          );

          response.end(
            JSON.stringify({
              message: "Internal server error.",
            }),
          );
        } else {
          response.end();
        }
      },
    );
  },
);

let scheduler: ReturnType<typeof startAutonomousScheduler> | null = null;

server.listen(port, host, () => {
  if (process.env.FAULTLINE_EMBEDDED_SCHEDULER !== "false") {
    scheduler = startAutonomousScheduler();
  }

  console.log(
    `FAULTLINE API running at http://${host}:${port}`,
  );
});

function shutdown(): void {
  scheduler?.stop();
  server.close(() => {
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
