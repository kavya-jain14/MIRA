import { pathToFileURL } from "node:url";

function apiOrigin(value) {
  if (!value?.trim()) {
    throw new Error("Set the repository variable MIRA_API_URL to the deployed Render origin.");
  }
  const url = new URL(value.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/" || /YOUR_|example/i.test(url.hostname)
  ) {
    throw new Error("MIRA_API_URL must be the actual API origin, without a path or credentials.");
  }
  return url.origin;
}

function inspectTick(payload) {
  if (
    payload?.status !== "ok" ||
    ![payload.due, payload.completed, payload.failed].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) || payload.completed + payload.failed !== payload.due
  ) {
    throw new Error("The API did not return a valid scheduler result.");
  }
  if (payload.failed > 0) {
    throw new Error(`${payload.failed} of ${payload.due} due agent(s) failed. Check the API logs and run timeline.`);
  }
  return payload;
}

export async function tick(value, {
  fetchImpl = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 120_000,
} = {}) {
  const origin = apiOrigin(value);
  // Two bounded attempts plus one delay fit inside the five-minute Actions job.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${origin}/api/internal/scheduler/tick`, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt === 2) throw new Error("The scheduler could not reach the API after two attempts.");
      await wait(5_000);
      continue;
    }

    if (!response.ok) {
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      await response.body?.cancel();
      if (attempt === 1 && retryable) {
        await wait(5_000);
        continue;
      }
      throw new Error(`Scheduler request failed with HTTP ${response.status}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("The scheduler API returned non-JSON content. Check MIRA_API_URL.");
    }
    return inspectTick(payload);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  tick(process.env.MIRA_API_URL).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`Scheduler tick failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
