# MIRA deployment checklist

MIRA uses two deployment targets:

- **Render:** long-running Node API, embedded autonomous scheduler, and SQLite
  on a persistent disk.
- **Vercel:** static React control room, built with the Render API URL.

The backend must use an always-on paid Render web service. Render Free web
services sleep after idle traffic and cannot attach a persistent disk, which
would stop the scheduler and erase SQLite state.

## 1. Deploy the Render backend

1. In Render, create a Blueprint from this repository. The root
   [`render.yaml`](../render.yaml) defines the Docker service, Singapore region,
   health check, embedded scheduler, and a 1 GB disk mounted at `/data`.
2. Enter `FAULTLINE_CORS_ORIGINS` as the exact Vercel production origin. If the
   Vercel project has not been created yet, use its planned origin and correct
   the variable before public verification.
3. Confirm the resulting service uses:

   ```text
   FAULTLINE_DB_PATH=/data/faultline.sqlite
   FAULTLINE_EMBEDDED_SCHEDULER=true
   FAULTLINE_INITIAL_DELAY_MS=8000
   FAULTLINE_INTERVAL_MS=1800000
   FAULTLINE_SCHEDULE_JITTER_MS=120000
   FAULTLINE_SOURCE_TIMEOUT_MS=12000
   FAULTLINE_SOURCE_RETRIES=1
   ```

4. Wait for `/health` to return `200` before initializing any agent.

## 2. Deploy the Vercel frontend

1. Import the same repository into Vercel with the repository root as the Root
   Directory. The root [`vercel.json`](../vercel.json) builds the npm-workspace
   monorepo and publishes `apps/web/dist`.
2. Add this Production environment variable:

   ```text
   VITE_API_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com
   ```

3. Deploy and copy the canonical Vercel production origin.
4. If it differs from `FAULTLINE_CORS_ORIGINS` on Render, update the Render
   variable and redeploy the backend.

Do not add the API or scheduler as Vercel Functions. They require a persistent,
continuously running process and durable filesystem state.

## 3. Release proof

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
- restarting Render preserves the agent, posts, decisions, and schedule;
- source, worker, API, and database health remain truthful;
- the final Render and Vercel URLs are added to the README and submission.

## Existing Railway data

Do not initialize a replacement agent until the old Railway volume has been
checked. If `/data/faultline.sqlite` is still accessible, copy a consistent
SQLite backup to the Render disk before the new service begins production work.
If the Railway service and volume are gone, the public API cannot reconstruct
the append-only database from the former feed.
