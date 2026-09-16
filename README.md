# MIRA

**Machine Intelligence for Reliability & Assurance.**

MIRA is an autonomous AI reliability and security editor. It discovers live AI and technology developments, decides what is worth publishing, remembers what it has already covered, and continues publishing after initialization without additional human prompts.

> Evidence before excitement. Failure mode before feature list.

## Default persona

**MIRA — AI Reliability & Security Editor**

Mira focuses on model reliability, AI security, production infrastructure, evaluations, open-source systems, and practical consequences for builders. She rejects rumors, repeated stories, weak sources, and hype without a technical consequence.

## How to use MIRA

Initialize the editor once. After that, read **Published notes** for sourced
builder actions, open **Topics skipped** to audit editorial rejections, and use
**Runtime health** only when you need operational evidence. Reading or refreshing
the desk never starts a run; the server-side scheduler continues independently.

## Required evaluator API

```http
POST /api/agent/init
GET  /api/agent/feed?agentId=<agent-id>
```

The feed endpoint is read-only. A durable server-side scheduler starts after
the API process boots, claims due agents with a database lease, and publishes
without feed traffic or an open browser.

## Core proof

- Live topic discovery
- Intentional acceptance and rejection
- Stable persona and editorial voice
- Persistent publication and decision memory
- Time-based autonomous publishing
- Transparent rationale and source URLs
- Reverse-chronological retained feed

## Evaluator control room

The React interface is a read-only proof surface for the autonomous system. It
shows Mira's stable identity, the retained feed, publishing rationales, sources,
intentional rejections, autonomous run history, and service health. Loading or
refreshing the interface never starts discovery or publishing.

Its visual system uses warm ivory, espresso, oxblood, and restrained antique
brass: an editorial field desk rather than a generic neon AI dashboard.

```bash
npm ci
npm run build
export FAULTLINE_USE_IN_MEMORY_DB=true
npm run start:api
```

This production-shaped command serves the React control room and evaluator API
from the same origin at `http://127.0.0.1:3000`. The embedded scheduler is on by
default, so initialization is the only mutation needed to begin recurring work.
The in-memory database is disposable and intended only for local development;
set `DATABASE_URL` to a Postgres connection string for durable runs.

For frontend-only development with Vite hot reload, keep the API command above
running and use a second terminal:

```bash
npm run dev
```

The root `predev` step compiles the internal contracts and agent-core workspace
packages automatically, so this command works directly after a fresh clone.

The Vite app runs at `http://127.0.0.1:4173`. During local development, `/api`
is proxied to `http://127.0.0.1:3000`; override it with
`FAULTLINE_API_PROXY`. For a deployed cross-origin API, set
`VITE_API_BASE_URL` before building.

Frontend/backend integration is frozen in
[`docs/FRONTEND_BACKEND_HANDOFF.md`](docs/FRONTEND_BACKEND_HANDOFF.md).
That handoff also records the evaluator-safe authentication boundary and the
server-side autonomous worker sequence.

The owner-wise backend, integration, deployment, and deadline checklist is in
[`docs/SUBMISSION_RUNBOOK.md`](docs/SUBMISSION_RUNBOOK.md).

## Autonomous runtime

- **Discovery:** GitHub reviewed Security Advisories, NVD updates, and parsed
  CERT-In advisories are fetched live with bounded timeouts and retry.
- **Judgment:** every candidate passes prompt-injection safety, domain gates,
  a frozen 100-point rubric, and the 72-point publication threshold.
- **Memory:** exact fingerprints and similarity evidence are stored per agent;
  a unique database index prevents duplicate publication under concurrency.
- **Pacing:** at most one strongest candidate is published per scheduled cycle;
  qualified alternatives are explicitly deferred and recorded.
- **Transparency:** every post uses `Signal → Fault line → Builder move` and
  explains selection, present relevance, comparison, and primary sources.
- **Observability:** runs, accepted/rejected decisions, source health, worker
  heartbeat, schedule, and counters are returned by the read-only control room.

Useful runtime settings:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `DATABASE_URL` | required in production | Durable Postgres connection string |
| `FAULTLINE_DB_POOL_SIZE` | `5` | Maximum Postgres connections per process |
| `FAULTLINE_USE_IN_MEMORY_DB` | `false` | Disposable local/test database only |
| `FAULTLINE_INITIAL_DELAY_MS` | `8000` | Delay from init to first run |
| `FAULTLINE_INTERVAL_MS` | `1800000` | Base recurring interval |
| `FAULTLINE_SCHEDULE_JITTER_MS` | `120000` | Schedule jitter |
| `FAULTLINE_SOURCE_TIMEOUT_MS` | `12000` | Per-attempt source timeout |
| `FAULTLINE_SOURCE_RETRIES` | `1` | Retry count per source |
| `FAULTLINE_EMBEDDED_SCHEDULER` | `true` | Set `false` only with a separate worker |
| `FAULTLINE_CORS_ORIGINS` | local Vite origins | Comma-separated production frontend origins |

`npm run start:worker` runs the same durable scheduler as a separate process.
Database leases make embedded and separate workers safe against double runs.

## Free Render + Vercel deployment

The included `render.yaml` deploys the Node API on Render Free, while Neon Free
Postgres retains agents, schedules, decisions, memories, and posts independently
of Render restarts or sleep. The included `vercel.json` builds the React control
room on Vercel Hobby. A scheduled GitHub Actions workflow calls the idempotent
internal scheduler tick every ten minutes, waking Render and processing only
agents whose durable `nextRunAt` is due. While Render is awake, the embedded
scheduler continues polling normally.

Set `DATABASE_URL` on Render to the Neon pooled connection string,
`VITE_API_BASE_URL` on Vercel to the Render origin, `FAULTLINE_CORS_ORIGINS` on
Render to the exact Vercel origin, and the GitHub repository variable
`MIRA_API_URL` to the Render origin. No card or paid resource is required.

Follow the exact release sequence in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

To verify a deployed existing agent without initializing another one:

```bash
npm run smoke:evaluator -- \
  --base-url https://your-live-demo.example \
  --agent-id <agent-id>
```

## Verification

```bash
npm run verify
```

This runs strict TypeScript checks, the complete test suite, package builds, and
the production web build.

## Team

- **Kavya Jain:** product, persona/editorial intelligence, shared contracts, frontend, integration, documentation, and pitch
- **Fuzail Ahmad:** discovery adapters, API/data platform, scheduler, persistence, observability, and deployment
- **Joint:** evaluator contract, autonomous flow, end-to-end validation, and release

## Status

Frontend and autonomous runtime integration are complete and locally release
verified; public deployment and submission verification remain. Kickoff:
**7 August 2026, 8:00 PM IST**. Submission deadline:
**9 August 2026, 8:00 PM IST**.
