import type { IncomingMessage, ServerResponse } from "node:http";

const LOCAL_ORIGINS = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

function configuredOrigins(): Set<string> {
  return new Set(
    (process.env.FAULTLINE_CORS_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function isCorsOriginAllowed(origin: string): boolean {
  const normalized = origin.trim().replace(/\/$/, "");
  return LOCAL_ORIGINS.has(normalized) || configuredOrigins().has(normalized);
}

export function handleApiCors(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): boolean {
  if (!pathname.startsWith("/api/")) {
    return false;
  }

  const origin = request.headers.origin;
  const allowed = origin !== undefined && isCorsOriginAllowed(origin);

  response.setHeader("Vary", "Origin");

  if (allowed) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    response.setHeader("Access-Control-Max-Age", "86400");
  }

  if (request.method !== "OPTIONS") {
    return false;
  }

  response.statusCode = allowed ? 204 : 403;
  response.end();
  return true;
}
