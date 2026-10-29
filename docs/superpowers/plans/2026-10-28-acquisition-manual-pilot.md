# Sangam Acquisition: manual pilot implementation

Authorized 2026-10-28. Base: f834d1ac1d329c665006e5c5a5a08d76254e0a6f. Work branch: codex/acquisition-manual-pilot.

## Release contract

Private, authenticated workspace product. Import authorized seller CSV, preserve provenance and unknown facts, score, record evidence, prepare/review/export mail and manual call batches, record actual outcomes, qualify/underwrite/contract, match permitted buyers, export reviewed assignment packets, and measure the actual 90-day pilot. No sender, discovery, skip-tracing, AI, or paid API is invoked by this release. Existing unowned data is quarantined. No live deployment, legal attestation, or business milestone is fabricated.

## Boundaries shared by implementers

- Domain owns `src/acquisition/domain.ts`, `types.ts`, `csv.ts` and `tests/acquisition.test.ts`. Export `initialState(): AcquisitionState`, `execute(state, command, context): {state: AcquisitionState; result?: unknown}`, `summarize(state, now): unknown`. Context is `{actorId: string; role: 'operator'|'reviewer'|'admin'; now: string}`. Use validated JSON commands and return atomic immutable transitions. Export command schema/types. Domain state is JSON serializable, versioned `schemaVersion: 1`. No environment, networking, database, UI or filesystem dependencies in domain (Node crypto is fine).
- Database/security owns `src/lib/access.ts`, `src/lib/acquisition-store.ts`, the new Supabase migration, SQL isolation tests, legacy routes/jobs/provider boundaries and middleware. Context resolver verifies Clerk identity against stored active workspace membership. Store exports `loadAcquisition(workspaceId, actorId)` -> `{state: AcquisitionState; version: number}`, and `saveAcquisition(workspaceId, actorId, expectedVersion, state, audit)` -> new version. JSON aggregate is an explicit pilot storage decision: one bounded workspace document, compare-and-swap update plus append-only audit in one SQL transaction. Only the server service role can mutate it, and each RPC independently checks active membership/role and version. Authenticated browser clients have no write permission. RLS isolates reads and legacy tables. No unscoped legacy service-role reads remain reachable.
- UI owns `components/acquisition-desk.tsx`, `app/(app)/acquisition/page.tsx`, navigation/styles. API: GET `/api/acquisition?workspaceId=<uuid>` returns `{state, version, summary, workspace, role}`. POST `/api/acquisition` accepts `{workspaceId, version, command}` and returns `{state, version, summary, result}`. GET `/api/workspaces` -> `{workspaces:[{id,name,role}]}`. Errors `{error: string}` with 400/401/403/409/413/503. Export is an audited POST command and `result` includes downloadable content; no unaudited direct downloads. Forms need previews/errors/loading, actual evidence fields, reviewed content, explicit actual receipt forms; never generate fake approvals.
- Root owns route integration, package/lockfile, CI, deploy/runbook, spec change ledger, final tests/review. No overlapping files without coordination.

## Work sequence and verification

1. Write and run failing domain/security behavior tests, including two-workspace access, denied membership, stale CAS, revoked evidence, expired approvals, suppression, changed templates and idempotent receipts.
2. Implement domain workflow, protected persistence and usable UI in parallel with the interfaces above.
3. Add HTTP validation, same-origin protection, request/state size bounds and safe errors. Keep private data out of caches and logs.
4. Run typecheck, domain tests, real disposable PostgreSQL migration/RLS/CAS tests, production build, dependency audit and fictional browser workflow where local identity setup permits.
5. Fix independent review findings and rerun affected checks. Add CI and release checklist with explicit credentials/membership/migration/operator evidence steps. Publish tested PR and attach it to this chat. Do not merge or deploy silently.

## Known delivery decisions

- Aggregate storage keeps every approval/receipt transition atomic without a partial rewrite of the Python pilot. Bounded pilot size; normalized reporting tables/background processing are future scale work, not claimed complete.
- Separate seller motivation score, economics and buyer fit. Original seller weights/farm/targets retained.
- Actual source permission, reviewer evidence, per-recipient scrub, reviewed templates and batch approvals must be supplied by an authorized human. Existing local owner attestation is not silently converted to hosted legal clearance.
- Mail/call export is preparation, never a touch. The first actual, evidenced receipt starts the clock. Demo data is excluded.
- Unknown SaaS hosting, storage and support costs are additional to the original roughly $600–750 monthly operating budget. No billing or subscriptions claimed live.

## Verification ledger

Verified locally on 2026-10-28 (America/Los_Angeles):

- 39 unit/domain/HTTP/boundary/capacity tests pass, no skips. These include 30 domain regressions and 14 legacy provider/job entry points within the boundary test.
- PostgreSQL 17 migration/integration suite passes: anonymous/member/workspace isolation, role and direct-write denial, revoked access, concurrent CAS, audit failure rollback. Disposable dump/restore preserved state, audit count and RLS.
- TypeScript check and optimized Next.js 16.4.3 Webpack production build pass without real credentials.
- Actual built HTTP smoke passes: private routes fail closed with absent auth configuration; six retired endpoints return 410.
- Browser fixture passes 17 checks using the real UI/domain: authorized-versus-practice import, contact evidence, reviewed mail/packet exports, actual fictional receipts, underwriting, contract through closing, expenses/rescore, stale conflict recovery and mobile layout. No runtime errors. Browser API is fictional/in-memory; production Clerk sign-in remains a deployment verification step.
- 2,000-lead / 3,000-touch fixture computes actual summary in approximately 0.5 seconds locally and fits the compressed response bound. Not a hosted load/SLA claim.
- npm audit reports zero vulnerabilities for the final lockfile. Dependency versions were updated and pinned; unused provider SDKs removed.
- Independent security review identified and resolved late buyer opt-out, mutable contact history and practice-mode bypass bugs. Regression coverage added. No unresolved code release blocker reported.

Environment notes: default local process restrictions initially prevented PostgreSQL shared-memory initialization and Turbopack's CSS-worker port. PostgreSQL passed with permitted local process access. The supported Webpack production build passed; no checks were suppressed. The first GitHub run passed unit/database/build/HTTP checks but its Ubuntu 26.04 runner could not install the pinned Playwright browser dependencies. CI now pins Ubuntu 24.04 and repeats every check, including the browser workflow.

Not performed: live database migration, production deployment, production Clerk identity verification, real lead import, real approval/attestation, vendor order, call, buyer delivery, contract execution or paid subscription activation. Required deployment steps remain in docs/DEPLOY.md. Existing local pilot automations were not repointed to hosted storage.
