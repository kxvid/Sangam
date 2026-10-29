# Sangam — Acquisition intelligence

A private workspace for Kahla Labs LLC's Inland Empire pilot: import authorized seller data, score leads, review evidence and exact outreach materials, export mail and manual calling batches, record real outcomes, and match contracted deals to permitted buyers.

**Mail and calls are manual.** Authorized uploaded exports are validated, deduplicated, scored and matched automatically. Scheduled refreshes re-evaluate stored records without changing their source dates. A separate explicit Census lookup sends only one selected property address and returns suggestions. No SMS, email, automated calls, bulk scraping, skip tracing, AI requests or new PropStream fetching runs in this release. Exporting a file does not mark a touch or start the pilot clock.

## Start here

- [Wholesaler launch plan](docs/WHOLESALER-LAUNCH-PLAN.md): researched source choices, first real batch, buyer demand, costs and remaining operator inputs.
- [Operator guide](docs/GETTING_STARTED.md): test the workflow, import real leads and prepare the first batch.
- [Operations guide](docs/OPERATIONS-GUIDE.md): work queue, profit scenarios, buyer follow-ups, readiness and free data.
- [Free-data source evidence](docs/FREE-DATA-SOURCES.md): verified availability, provenance, limits and held sources.
- [Deployment and recovery](docs/DEPLOY.md): credentials, workspace provisioning, migrations, release verification and rollback.
- [Changes from the original spec](docs/SPEC-CHANGES.md): every material change and its reason.
- [Implementation and verification ledger](docs/superpowers/plans/2026-10-28-acquisition-manual-pilot.md).

```sh
npm ci
cp .env.example .env.local
# Configure Clerk and a separate Supabase test project; follow docs/DEPLOY.md.
npm run dev
```

Open `/acquisition` for manual operations, `/automation` for Sources, Rules, Jobs and Matches, and `/operations` for the daily work queue, profit scenarios, buyer history, readiness and public data. A Clerk account alone does not grant data access: an administrator must explicitly add an active workspace membership. Historical routes redirect to the desk; historical send/discovery endpoints and CLI jobs are disabled.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
npm audit
```

Database tests use a disposable PostgreSQL instance; see the deployment guide for prerequisites. They never use the application's Supabase credentials. No real seller files, secrets or private approvals belong in this public repository.

## Data and authorization

Acquisition uses a bounded JSON workspace document with transactional optimistic concurrency, independent database membership checks and append-only audit entries. Sources, immutable rule revisions, durable jobs, research records and explained decisions use separate normalized tables. All mutations run through validated server commands. Each workspace is isolated; browser clients cannot directly mutate operational state. Existing unowned legacy rows are quarantined by the migration, not assigned to the first signup.

This is a private pilot product, not a completed public subscription service. Membership provisioning, reviewed operational evidence and production restore verification remain explicit operating prerequisites. Hosting, authentication, storage and support costs are additional to the original operating budget and must be verified for the selected plans.
