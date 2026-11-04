# Reef implementation status

This is the first private pilot of the Founder Launch Agent. The parent SYSTEM_DESIGN.md describes the broader target; this file records what actually exists.

## Implemented

- Responsive, web-first workspace with an actual vendored ASCII Sharks canvas, pause control, and reduced-motion support.
- Overview, product brief, campaign review, channel directory, activity, connection setup, and honest empty metrics.
- Explicitly labeled sample campaign; cannot be published.
- Server-side Muse Responses API integration with product description, fetched website context, and PDF/image/text source input.
- Private R2 source uploads (5 MB per file, three per campaign), ownership checks, and D1 campaign persistence.
- Schema-validated model output; no mock substitution when the model fails.
- Human review and editing, per-post version-bound approvals, Markdown export.
- Owner-scoped Buffer account discovery and a real createPost mutation into the provider's publishing queue.
- Compare-and-swap campaign revisions; submission claimed before calling Buffer; no automatic retry after uncertain outcomes.
- Manual destination support; no generated Hacker News submission text.
- Sign in with ChatGPT via the Sites platform, with local auth simulation only in development.

## Credentials and operation

Configure MODEL_API_KEY on the server to enable generation. MUSE_MODEL defaults to muse-spark-1.3. No credentials are included in the repository or browser bundle.

For this owner-private pilot, configure BUFFER_API_KEY and BUFFER_OWNER_ID. The owner ID appears in Connections & settings after sign-in. A Buffer key is usable only by that ID. Self-service OAuth is not implemented.

Local environment values belong in ignored .dev.vars; hosted values belong in Sites runtime settings. The .env.example documents names only.

The API is authenticated. Website extraction accepts public HTTPS HTML pages; inaccessible pages require pasted descriptions. URL DNS and redirect checks reduce SSRF exposure; a hardened egress proxy is still recommended before opening this to untrusted public tenants.

Live generation and publishing need real account credentials and have not been verified until explicitly noted in verification results. Do not confuse a successful build or a mocked test with live provider success.

## Deliberate scope changes from the design

- Sites hosts the application on Cloudflare Workers, D1, and R2 rather than Postgres.
- The Buffer queue owns scheduling in this version. The app sends approved posts to addToQueue; no separate scheduler or background queue is claimed.
- Provider acceptance is displayed as “In Buffer,” not “Published.” Check Buffer for actual publication, cancellation, and engagement. No automated reconciliation is implemented.
- Generation is request-based (90-second provider timeout), not a durable resumable job. Retrying after a lost response may create another campaign but cannot publish a post.
- The UI edits drafts and offers per-post approval. Batch approval, re-generation from brief edits, and bounded autopilot are not yet implemented. Brief edits remove pending approvals and explicitly require draft review.
- Raw video ingestion/transcription, first-party conversion tracking, paid ads, automated replies, and pitch deck output are deferred. A transcript or existing PDF deck is supported input.
- MCP and the Muse Connector Platform are not part of this first build.
- Sample exploration is browser-session UI state unless explicitly saved through the authenticated sample API.

## Development

Install using the Sites dependency helper described in the starter README. Then:

- npm run dev: local development UI.
- npm run db:generate: generate schema migrations after changes.
- node --experimental-strip-types --test tests/domain.test.ts: permission and ingestion boundary tests.
- npx tsc --noEmit: type verification.
- npm run build: build Worker and browser assets.

Apply the generated migration to local D1 using the command in README.md before testing authenticated persistence. Hosting applies migrations during deployment.

## Third-party source

lib/ascii-sharks is vendored from https://github.com/stackedlol/ascii-sharks, with its MIT license retained. The source is a TypeScript library, not a SKILL.md package. Attribution appears in the workspace footer.

## Verification — November 4, 2026

- Production Worker/browser build: passed (rebuild after final changes recorded in task output).
- TypeScript check: passed.
- Domain/URL boundary tests: 9 passed.
- In-process API integration test: passed against actual route handlers and SQLite, with mocked external providers. Covers authentication, missing credentials, generation, persistence, edits, stale approvals, concurrent duplicate submission, uncertain outcomes, cross-origin rejection, uploads, and tenant isolation.
- SQL migration syntax and conditional-update behavior: verified with SQLite.
- Browser visual QA: not completed; the browser runtime failed to start.
- Local HTTP/D1 integration preview: blocked by environment EPERM on opening a loopback listener. In-process integration tests do not substitute for Cloudflare runtime tests.
- Private deployment: not completed; source synchronization could not resolve git.chatgpt-team.site. A private, unpublished Site was registered; its ID remains in .openai/hosting.json for retry. Do not create a second Site.
- Live Muse calls and live Buffer publishing: not run; credentials have not been supplied. No public posts were sent.

Run `npm test` for the domain and in-process route integration tests. Run `npm run typecheck` for the TypeScript check.
