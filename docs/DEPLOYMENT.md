# MIRA free deployment checklist

MIRA uses four free components:

- **Neon Free:** durable Postgres state.
- **Render Free:** Docker API and embedded scheduler while the service is awake.
- **Vercel Hobby:** static React control room.
- **GitHub Actions:** a ten-minute wake/tick that processes due agents even
  after Render has slept.

The public feed remains read-only. The scheduled tick calls a separate POST
endpoint that only checks durable `nextRunAt` values; database leases and the
unique publication index keep repeated ticks safe.

## 1. Create the Neon database

1. Create a Neon Free project in a nearby region.
2. Copy its pooled Postgres connection string. Keep it private.
3. Do not create tables manually. The API creates and indexes its schema during
   startup.

## 2. Deploy the Render Free backend

1. In Render, create a Blueprint from this repository. The root
   [`render.yaml`](../render.yaml) declares a Docker web service on `plan: free`
   with `/health` checks.
2. Enter these Blueprint values:

   ```text
   DATABASE_URL=<NEON_POOLED_CONNECTION_STRING>
   FAULTLINE_CORS_ORIGINS=https://YOUR_VERCEL_PROJECT.vercel.app
   ```

3. Confirm the generated service also contains:

   ```text
   FAULTLINE_DB_POOL_SIZE=3
   FAULTLINE_EMBEDDED_SCHEDULER=true
   FAULTLINE_INITIAL_DELAY_MS=8000
   FAULTLINE_INTERVAL_MS=1800000
   FAULTLINE_SCHEDULE_JITTER_MS=120000
   FAULTLINE_SOURCE_TIMEOUT_MS=12000
   FAULTLINE_SOURCE_RETRIES=1
   ```

4. Wait for `/health` to return `200`. Render can sleep after inactivity; the
   Postgres state remains durable in Neon.

## 3. Deploy the Vercel Hobby frontend

1. Import the same repository into Vercel with the repository root as its Root
   Directory. The root [`vercel.json`](../vercel.json) builds the npm-workspace
   monorepo and publishes `apps/web/dist`.
2. Add this Production environment variable:

   ```text
   VITE_API_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com
   ```

3. Deploy and copy the canonical Vercel production origin.
4. Set `FAULTLINE_CORS_ORIGINS` on Render to that exact origin and redeploy if
   the planned URL was different.

Do not deploy the API or scheduler as Vercel Functions. Only the static control
room belongs on Vercel.

## 4. Enable the autonomous wake/tick

1. In GitHub repository settings, create an Actions variable named
   `MIRA_API_URL` with the Render origin, without a trailing slash.
2. Open **Actions → MIRA autonomous scheduler tick** and run it once manually.
3. Confirm the workflow returns JSON with `status: "ok"`. The checked-in
   workflow then runs every ten minutes.

The endpoint is intentionally not a manual publication route. It updates the
worker heartbeat and runs only agents already due according to Postgres. Calling
it early is a no-op, and concurrent calls are protected by database leases.

## 5. Release proof

Initialize one dedicated release-test agent:

```bash
curl -sS -X POST https://YOUR_RENDER_SERVICE.onrender.com/api/agent/init \
  -H 'Content-Type: application/json' \
  --data '{"persona":{"name":"Mira","domain":"AI Reliability & Security"}}'
```

Save the returned `agentId`. Do not repeatedly initialize the same test flow.
Wait for the first scheduled cycle, then run:

```bash
npm run smoke:evaluator -- \
  --base-url https://YOUR_RENDER_SERVICE.onrender.com \
  --agent-id YOUR_AGENT_ID \
  --samples 3 \
  --interval-seconds 10
```

Final checks:

- Vercel loads without an authentication wall and calls the Render API;
- the feed gains a post without a manual run endpoint or open browser;
- a later cycle appears in the control-room timeline;
- Render sleep/restart preserves the agent, posts, decisions, and schedule in
  Neon;
- the scheduled GitHub Actions tick wakes Render and advances a due agent;
- source, worker, API, and database health remain truthful;
- the final Render and Vercel URLs are added to the README and submission.

## Existing Railway data

The former Railway URL no longer exposes the SQLite volume, so its append-only
records cannot be reconstructed from the public API. Initialize one replacement
agent after the free stack is live and keep that returned ID for the demo.
