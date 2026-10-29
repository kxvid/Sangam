# Automated sourcing and decision matching implementation plan

> Execution: independent implementation tasks followed by integration and a whole-branch review.

**Goal:** Ship the existing decision-engine design inside live Sangam, automating processing and refresh of authorized PropStream exports while keeping outreach manual.

**Architecture:** Next.js authenticated pages and API, private Supabase records with transactional job leases, and a secret-protected Vercel scheduler. Sources, immutable published rule revisions, research records and explanations live separately from the bounded manual Acquisition state. Existing import and outreach gates remain authoritative.

**Tech stack:** Existing Node 22 / Next.js / Clerk / Supabase / TypeScript, without new paid providers.

**Spec:** Existing `sangam-saas-prototype/SAAS-DESIGN.md` and tested engine, narrowed by the user's explicit 2026-10-28 answer: “PropStream exports only for now.” The user requested live implementation and deployment; further design approval is not required.

## Global constraints

- Uploaded authorized CSV exports only. No scraping, provider requests, credentials or purchased data.
- Automatic sourcing means processing uploaded exports and scheduled re-evaluation; PropStream extraction remains manual.
- Mail, calls, SMS, email and buyer delivery remain manual; legacy outbound endpoints remain disabled.
- No real legal attestations, source rights, activity, launch, contract or payment evidence may be invented.
- Exact verified workspace membership governs reads and writes; source approvals and rule publication require reviewer/admin.
- Practice records remain visibly synthetic and do not contribute to business metrics.
- Source records retain dates, permission references and checksums. Missing, expired or revoked facts cannot authorize research promotion.
- Structured JSON rules only; unknown values remain unknown and cannot silently pass eligibility.
- Immutable platform checks (source permissions, suppression, source freshness, contract status and buyer buy box) cannot be edited away.
- Source caps: at most 500 rows per run and 10,000 processing rows per month, with small bounded jobs and three attempts maximum.

## Decisions and scope

- Reuse the reviewed pure decision engine instead of introducing an opaque model. Every result exposes conditions, score range and version/hash.
- Use normalized source/job/record/rule/decision tables instead of expanding the manual JSON aggregate with raw ingestion history.
- Use durable database leases and Vercel Cron for bounded jobs. A source authorization grants background processing; the worker never impersonates the human reviewer.
- Retain source data dates on refresh. A refresh does not claim that a new vendor export arrived.
- Keep approvals in the existing app. Adding a record to Acquisition requires the current data gate and current source rights; matching never sends a packet.
- Do not purchase a data plan, turn on a crawler, add billing, or claim a complete subscription product.

## Review focus

1. Source or member revocation during a job or promotion must stop the commit.
2. Concurrent scheduler invocations and duplicate uploads must not duplicate jobs or bypass caps.
3. Worker crashes must recover leases without creating new source facts or timestamps.
4. Tenant JSON rules cannot loosen platform eligibility or mix real/practice records.
5. Large uploads, malicious JSON, stale UI revisions and source changes must fail before partial writes.

## Tasks

- [ ] Engine: port validated rules/types, seller/buyer adapters and tests for unknowns, suppression, grants, geography, units and hard eligibility.
- [ ] Storage: migrations, private RPCs, immutable rules, normalized research records, durable jobs, scoped worker commits, atomic promotion and actual PostgreSQL tests.
- [ ] UI: Sources/Rules/Jobs/Matches, draft-review workflow, upload, refresh, explanations and explicit manual handoff.
- [ ] Service: strict commands, CSV normalization, published rule evaluation, background processing, protected cron, promotion and HTTP tests.
- [ ] Verification: complete unit/database/build checks; independent review; meaningful fictional browser workflow; no real business mutations.
- [ ] Release: reviewed migration, production-only scheduler secret, exact tested commit, live boundary/UI tests, docs and changes ledger.

## Progress ledger

- 2026-10-28: confirmed existing production release and dedicated database. Source connector remains connected to a different Supabase account; use the already authenticated correct project dashboard for the reviewed migration.
- 2026-10-28: user chose PropStream exports only. Network collection removed from this release; scheduled processing retains original source dates.
