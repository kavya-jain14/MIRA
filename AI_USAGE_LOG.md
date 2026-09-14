# AI Usage Log

This log records material AI assistance used during the Vicodathon build. It is maintained alongside the repository history so that prompts, implementation decisions, and human verification remain auditable.

## 2026-08-08 — Challenge analysis and product direction

- **Tool:** ChatGPT Work (Codex)
- **Human owners:** Kavya Jain and Fuzail Ahmad
- **Objective:** Convert the organizer brief into a product, architecture, delivery, and ownership plan.
- **Interaction summary:** Reviewed the autonomous creator requirements, required HTTP endpoints, 48-hour observation behavior, editorial rationale, submission rules, authenticity checks, and Live Steer Challenge.
- **Output used:** FAULTLINE product identity; Mira persona; editorial rejection rubric; persistent worker architecture; memory strategy; team split; repository and delivery plan.
- **Human verification:** Kavya confirmed the autonomous editor direction, team ownership, kickoff time, deadline, repository name, and start of implementation.
- **Related commit:** `5bf77e4`
- **Secrets or personal data:** None included.

## 2026-08-08 — Repository initialization

- **Tool:** ChatGPT Work GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Create an authenticity-safe first repository commit after the official kickoff.
- **Interaction summary:** Verified that the repository was public, empty, writable, and created after kickoff; added only the initial README.
- **Files influenced:** `README.md`, `AI_USAGE_LOG.md`
- **Human verification:** Repository target and public visibility confirmed before write.
- **Related commits:** `5bf77e4`, `296daf5`
- **Secrets or personal data:** None included.

## 2026-08-08 — KAVYA-01 persona and editorial foundation

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Implement the first owned vertical slice for persona consistency and editorial judgment.
- **Interaction summary:** Created strict evaluator/internal Zod contracts, immutable Mira persona configuration, hard editorial gates, a 100-point rubric, a 72-point publishing threshold, penalties, explicit rejection reasons, and unit tests.
- **Files influenced:** Root TypeScript workspace, `packages/contracts`, `packages/agent-core`, `docs/EDITORIAL_POLICY.md`, `AGENTS.md`, and CI.
- **Human verification performed:** Dependency installation, strict TypeScript compilation, 12 unit tests, and production build all passed locally.
- **Related issue/branch:** Issue #1; `kavya/persona-editorial-foundation`
- **Rejected or changed AI suggestions:** Kept a single deterministic editorial engine and explicitly excluded multi-agent orchestration; kept the feed contract free of internal scoring fields.
- **Secrets or personal data:** None included.

## 2026-08-08 — KAVYA-02 evaluator control room

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Complete the evaluator-facing frontend before backend implementation and freeze Fuzail's integration contract.
- **Interaction summary:** Implemented a responsive React control room for Mira with one-time initialization/connect flow, read-only polling, autonomy status, newest-first feed, visible rationales and sources, rejection ledger, run timeline, system-health drawer, and all empty/error/degraded states.
- **Files influenced:** `apps/web`, control-room contracts in `packages/contracts`, root workspace scripts, CI, README, and frontend/backend handoff documentation.
- **Human constraints applied:** Kept the visual system warm black/navy with restrained signal blue; avoided chatbot, neon-cyberpunk, stock AI imagery, and client-fabricated production posts; prioritized autonomy status and feed on mobile.
- **Human verification performed:** Strict TypeScript, 20 unit/component tests, production Vite build, and automated desktop/mobile browser captures with zero console errors or horizontal overflow.
- **Related issue/PR/commit:** Issue #3; PR #2; `8ef87a0`.
- **Rejected or changed AI suggestions:** Kept the dashboard observational and the autonomous worker independent; used external browser request interception only for visual QA fixtures, leaving the production client fixture-free.
- **Secrets or personal data:** None included.

## 2026-08-08 — Fresh-clone development startup fix

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner/reporter:** Kavya Jain
- **Objective:** Make the documented frontend startup command reliable on a clean macOS clone.
- **Observed failure:** Vite started before internal workspace packages emitted their `dist` entrypoints, so `@faultline/agent-core` and `@faultline/contracts` could not resolve.
- **Root cause:** Production verification ran `tsc -b`, but the root development script had no equivalent prerequisite; existing build artifacts masked the gap during initial local QA.
- **Change used:** Added a root `predev` lifecycle step that builds both referenced TypeScript packages before Vite starts.
- **Human verification requested:** Pull the patch and rerun `npm run dev` from the existing clone.
- **Automated verification performed:** Fresh-artifact startup test plus the full typecheck, test, build, and whitespace suite.
- **Related issue/PR:** Issue #4; PR #2.
- **Secrets or personal data:** None included.

## 2026-08-08 — KAVYA-04 premium editorial makeover

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Replace the generic dark AI-dashboard first impression with a premium editorial identity and make Mira's judgment visibly stronger than generation.
- **Interaction summary:** Kavya reviewed the running interface and requested a lighter, richer first impression, a distinctive non-generic palette, a stronger right-side decision surface, and clear direction for authentication and autonomous publishing.
- **Output used:** Reworked the landing and control room around warm ivory, espresso, oxblood, muted antique brass, and deep forest status accents; changed the operating-loop list into a 72-point editorial gate with evidence factors and explicit hard-reject reasons; documented evaluator-safe access and the independent worker sequence.
- **Files influenced:** `apps/web/src/components/initialize-panel.tsx`, `apps/web/src/styles.css`, frontend tests, `README.md`, and `docs/FRONTEND_BACKEND_HANDOFF.md`.
- **Human constraints applied:** Kept the serif editorial identity and restrained geometry; avoided purple/blue glow, glassmorphism, stock AI imagery, login friction on evaluator endpoints, and browser-driven autonomy.
- **Automated verification performed:** Strict TypeScript, all 20 unit/component tests, production Vite build, whitespace validation, and headless desktop/mobile/connected visual captures passed with zero console errors and zero horizontal overflow.
- **Related issue/PR:** Issue #5; PR #2.
- **Secrets or personal data:** None included.

## 2026-08-09 — KAVYA-05 responsive landing refinement

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Correct the visible scrollbar, device-height overflow, right-rail theme mismatch, generic AI-dashboard typography, and weak boxed Mira monogram observed during live screen review.
- **Interaction summary:** Kavya supplied device screenshots and requested that the strong left hero remain intact while the right decision system adopts the primary oxblood language, Mira's identity integrates naturally, and common laptop viewports fit as a single screen.
- **Output used:** Hid the browser scrollbar without disabling scroll; constrained the desktop landing to the small viewport; replaced the boxed decision matrix with a quieter editorial route; restyled the gate in oxblood; removed the `M` tile in favor of an editor-on-record signature and fixed-identity status; retained landing → autonomous control room as the complete product flow.
- **Files influenced:** `apps/web/src/components/initialize-panel.tsx`, `apps/web/src/styles.css`, frontend tests, and this log.
- **Human constraints applied:** Preserved the left headline and publication-led palette; avoided extra marketing pages, auth screens, visual clutter, and unreadably compressing the mobile layout.
- **Automated verification performed:** Strict TypeScript, all 20 unit/component tests, production build, and whitespace validation passed. Headless captures at 1440×800, 1366×768, and 1024×768 measured zero horizontal and vertical overflow; 390px mobile measured zero horizontal overflow and a hidden scrollbar; no console errors occurred.
- **Related issue/PR:** Issue #6; PR #2.
- **Secrets or personal data:** None included.

## 2026-08-09 — KAVYA-06 submission integration harness

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Audit all remaining work against the challenge and turn the frozen contracts into a repeatable backend/deployment release check.
- **Interaction summary:** Re-read the editorial policy, frontend/backend handoff, repository status, challenge submission rules, and completed issues; separated mandatory runtime work from optional judge-score additions and out-of-scope distractions.
- **Output used:** Added an explicit evaluator smoke CLI, contract and retention tests, a deadline-focused owner runbook, and corrected initialization semantics so test agents cannot overwrite or block the evaluator's later agent.
- **Files influenced:** `scripts/evaluator-smoke.mjs`, its tests, root scripts, `README.md`, `AGENTS.md`, `docs/FRONTEND_BACKEND_HANDOFF.md`, and `docs/SUBMISSION_RUNBOOK.md`.
- **Human constraints applied:** Kept frontend scope closed; preserved unauthenticated evaluator access; made initialization an explicit CLI action; excluded extra pages, real social publishing, analytics, and multi-agent architecture.
- **Verification performed:** Strict TypeScript, all 24 unit/component/script tests, production build, whitespace validation, and the real CLI against a local HTTP fixture passed. GitHub CI passed for commit `3b59639`.
- **Related issue/PR:** Issue #7; PR #2.
- **Secrets or personal data:** None included.

## 2026-08-09 — PR #9 autonomous runtime release hardening

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain; integration review of Fuzail Ahmad's PR #9
- **Objective:** Reproduce and resolve evaluator-blocking runtime defects before the Vicodathon deadline.
- **Interaction summary:** Reviewed PR #9 against the frozen contracts and challenge rules; reproduced missing autonomous scheduling, non-durable memory, duplicate publication, invalid post structure, static telemetry, incorrect rejection counts, committed runtime databases, and unexecuted backend smoke files.
- **Output used:** Added a durable scheduler with database leases, retry/timeouts/jitter, paced one-post cycles, SQLite-backed exact and similarity memory, the frozen 72/100 editorial policy, persona-aware structured writing, three-part public rationale, parsed live CERT-In/NVD/GitHub advisory sources, truthful run/decision/source telemetry, same-origin production serving, container deployment files, and executable backend tests.
- **Files influenced:** `apps/api`, root runtime scripts, `.gitignore`, `Dockerfile`, `railway.json`, README, handoff/runbook documents, and this log.
- **Human constraints applied:** Kept evaluator endpoints unauthenticated and read-only where required; removed the manual run endpoint; did not add multi-agent orchestration, social publishing, analytics, or additional frontend pages.
- **Verification performed:** Node 24 strict typecheck; 29/29 tests; three live primary sources returning 30 normalized candidates; automatic first publication without feed-triggered work; evaluator smoke with a non-empty feed; process restart; a second autonomous zero-publication cycle blocking 30 duplicates; byte-stable post retention; truthful healthy telemetry.
- **Related branch/PR:** `kavya/pr9-release-hardening`, hardening on top of PR #9.
- **Rejected or changed AI suggestions:** Replaced the consistently failing CISA feed (`403`) with GitHub's reviewed Security Advisories API instead of reporting false health; kept deterministic grounded writing as the safe fallback rather than requiring an unavailable runtime model key.
- **Secrets or personal data:** None included.

## 2026-08-09 — KAVYA-07 final product clarity and theme pass

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Make the deployed control room understandable to a first-time visitor while preserving the evaluator-facing autonomy evidence.
- **Interaction summary:** Kavya reviewed the production dashboard screenshots and requested clearer product onboarding, a visible light/dark option, stronger palette visibility, friendlier status language, better post readability, and a final responsive UX pass.
- **Output used:** Added a persistent three-step “How FAULTLINE works” explainer; a remembered light/dark theme switch on both entry and connected views; plain-language autonomy, scan, skipped-topic, and degraded-source labels; and structured post rendering for “What happened”, “Why it matters”, and “What builders should do”.
- **Files influenced:** `apps/web/src/App.tsx`, frontend components and styles, frontend tests, and this log.
- **Human constraints applied:** Preserved the warm ivory/oxblood/brass editorial identity in light mode; made dark mode espresso-led instead of generic AI blue/purple; kept raw architecture and health evidence accessible without making it the first explanation a visitor sees.
- **Automated verification performed:** Strict TypeScript, 30/30 tests, production build, and whitespace validation passed; coverage includes theme persistence, onboarding language, autonomous polling, structured post rendering, and degraded telemetry behavior.
- **Related branch/PR:** `agent/final-ui-ux`; final PR pending publication.
- **Rejected or changed AI suggestions:** Kept a single dashboard instead of adding marketing or authentication pages; kept published rationale visible instead of hiding proof behind a modal.
- **Secrets or personal data:** None included.

## 2026-08-10 — KAVYA-08 editorial human pass

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Remove demo-day AI-dashboard tells, repair raw source prose, and make Mira's editorial judgment the clearest proof of autonomy.
- **Prompt or interaction summary:** Kavya supplied a prioritized critique covering literal Markdown and mid-word truncation, repeated pipeline explainers, defensive copy, an unexplained score badge, stock icon tiles, a placeholder monogram, inconsistent degraded states, missing human fingerprints, and a buried rejection ledger. She also supplied a geometric MIRA mark direction.
- **Output used:** Added source-markup normalization and word-boundary excerpts at generation and presentation time; corrected the control-room ledger to contain only rejected decisions; replaced the placeholder portrait with a custom code-native Mira mark; consolidated the product explanation into one editorial method; made withheld decisions permanently visible beside the feed; reduced boxed surfaces, icon tiles, and repeated numbering; quieted the 72/100 threshold with its criteria explained inline; added concise operational states and an intentional all-sources-offline treatment.
- **Files influenced:** `apps/api/src/editorial/generator.ts`, `apps/api/src/app.ts`, backend tests, `apps/web/src/App.tsx`, control-room and initialization components, frontend tests, `apps/web/src/styles.css`, and this log.
- **Human constraints applied:** Preserved the warm ivory, oxblood, brass, forest, serif, and italic editorial identity; kept the evaluator API unauthenticated; preserved append-only published records; did not add marketing pages, authentication, social posting, stock imagery, or extra autonomous agents.
- **Automated verification performed:** Strict TypeScript, 34/34 unit/component/backend tests, production Vite build, and whitespace validation passed. Post-deploy visual QA at 1363×936 confirmed light/dark rendering, zero horizontal overflow, no raw Markdown or hard-cut word in P01, visible rejection evidence, and working live evaluator/feed responses.
- **Related branch/PR:** `agent/editorial-human-pass`; PR #13, merged as `d716c03`.
- **Rejected or changed AI suggestions:** Did not rewrite an already-published database row because that would violate append-only memory; instead cleaned existing records at display time and prevented future raw source syntax in the generator. Recreated the supplied visual direction as an original SVG rather than adding a raster logo dependency.
- **Secrets or personal data:** None included.

## 2026-08-10 — KAVYA-09 MIRA brand and usage clarity

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Make MIRA the unmistakable product identity, explain the name and first-time usage, and repair unreadable inherited colors in runtime health.
- **Prompt or interaction summary:** Kavya identified that the global header and browser title still said FAULTLINE, MIRA had no visible expansion, usage was not explicit enough, and the runtime drawer rendered its main title and service labels in the light-theme body color against a dark surface.
- **Output used:** Replaced the header mark and word with the custom MIRA identity; renamed browser metadata and reader-facing API errors; defined MIRA as “Machine Intelligence for Reliability & Assurance” on both entry and connected surfaces; added direct initialize/read/audit usage copy; and explicitly scoped the runtime drawer's text color to its dark palette.
- **Files influenced:** Header, initialization and editorial-method components, web metadata, theme styles, frontend tests, README, and this log.
- **Human constraints applied:** Kept the evaluator endpoints and internal FAULTLINE environment-variable names stable; preserved the existing autonomous workflow and editorial layout; did not add new pages or repeat the internal pipeline.
- **Automated verification performed:** Strict TypeScript, all 34 unit/component/backend tests, the production web build, and whitespace validation passed. Post-deploy visual checks cover header identity, browser title, light/dark entry surfaces, runtime drawer contrast, and horizontal overflow.
- **Related branch/PR:** `agent/mira-brand-clarity`.
- **Secrets or personal data:** None included.

## 2026-08-10 — KAVYA-10 browser-tab MIRA mark

- **Tool:** ChatGPT Work (Codex) with GitHub integration
- **Human owner:** Kavya Jain
- **Objective:** Replace the browser's generic globe icon with the product's MIRA identity.
- **Prompt or interaction summary:** Kavya clarified that the requested logo placement was the browser-tab favicon rather than only the in-page header.
- **Output used:** Added a small-size custom MIRA SVG favicon with an ivory tile, espresso monogram, brass fault line, and oxblood accent; linked it explicitly from the web document head.
- **Files influenced:** `apps/web/public/mira-mark.svg`, `apps/web/index.html`, and this log.
- **Verification:** Production build must retain the SVG and the deployed document must advertise and serve it with an SVG content type.
- **Related branch/PR:** `agent/mira-favicon`.
- **Secrets or personal data:** None included.

## 2026-08-10 — KAVYA-11 autonomous backlog and decision-ledger repair

- **Tool:** ChatGPT Work (Codex)
- **Human owner:** Kavya Jain
- **Objective:** Repair the production behavior where only one note appeared over time and the decision ledger was flooded by repeated duplicate observations.
- **Prompt or interaction summary:** Kavya noticed that the decision ledger did not behave like a useful editorial record and that the same single published note remained visible across autonomous cycles, which could weaken the autonomy demonstration.
- **Output used:** Changed durable-memory handling so only already-published fingerprints are permanently blocked; kept qualified but deferred candidates eligible for later scheduled cycles; stopped repeated observations from creating duplicate ledger rows; collapsed historical records to one current decision per source while preferring its original editorial rationale over later duplicate observations; removed deferred topics after they are eventually published; indexed the ledger query; and normalized legacy Markdown at the public feed boundary without mutating append-only records.
- **Files influenced:** Autonomous pipeline, worker decision persistence, SQLite decision queries/indexes, public feed serialization, backend/editorial regression tests, and this log.
- **Human constraints applied:** Preserved the one-post-per-cycle pace, append-only published storage, read-only feed semantics, 72/100 editorial gate, durable deduplication, public evaluator endpoints, and single-agent architecture.
- **Automated verification performed:** Strict TypeScript, all 37 contract/component/backend tests, production build, and whitespace validation passed. Regression coverage proves that a second qualified topic publishes in a later cycle, published topics remain blocked, repeated decisions collapse to a unique ledger, and legacy feed text is clean at the API boundary.
- **Related branch/PR:** `agent/autonomy-ledger-repair`, PR #17; final legacy-ledger rationale refinement on `agent/ledger-reason-repair`.
- **Secrets or personal data:** None included.

## 2026-09-14 — KAVYA-12 Render and Vercel deployment migration

- **Tool:** ChatGPT Work (Codex)
- **Human owner:** Kavya Jain
- **Objective:** Replace the failed Railway release with a durable Render backend and Vercel frontend.
- **Prompt or interaction summary:** Kavya reported that Railway returned a deployment error and directed the project to use Render and Vercel instead.
- **Output used:** Added a Render Blueprint for the Docker API, embedded scheduler, Singapore region, health checks, and persistent SQLite disk; added a Vercel monorepo build configuration for the React control room; implemented exact-origin CORS and preflight handling for the split deployment; removed Railway-specific configuration; and updated release documentation.
- **Files influenced:** `render.yaml`, `vercel.json`, backend CORS/API/tests, frontend environment example, deployment documentation, README, and this log.
- **Human constraints applied:** Preserved the read-only feed, one-time initialization contract, append-only posts, durable scheduling, single-agent architecture, and public evaluator access.
- **Automated verification performed:** Strict TypeScript, complete tests, production build, whitespace validation, and live split-origin checks are required before release.
- **Related branch/PR:** `kavya/render-vercel-migration`.
- **Rejected or changed AI suggestions:** Did not use a free Render web service because idle spin-down would stop the scheduler and its ephemeral filesystem would erase SQLite state.
- **Secrets or personal data:** None included.

## Entry template

Copy this section for each material AI-assisted change:

```md
## YYYY-MM-DD — Short task name

- **Tool/model:**
- **Human owner:**
- **Objective:**
- **Prompt or interaction summary:**
- **Output used:**
- **Files influenced:**
- **Human verification performed:**
- **Related commit/PR:**
- **Rejected or changed AI suggestions:**
- **Secrets or personal data:** None included.
```
