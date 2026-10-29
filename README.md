# Sangam — Acquisition

A private workspace for Kahla Labs LLC's Inland Empire pilot: import authorized seller data, score leads, review evidence and exact outreach materials, export mail and manual calling batches, record real outcomes, and match contracted deals to permitted buyers.

**Mail and calls are manual.** No SMS, email, automated calls, scraping, skip tracing, AI requests or provider discovery runs in this release. Exporting a file does not mark a touch or start the pilot clock.

## Start here

- [Operator guide](docs/GETTING_STARTED.md): test the workflow, import real leads and prepare the first batch.
- [Deployment and recovery](docs/DEPLOY.md): credentials, workspace provisioning, migrations, release verification and rollback.
- [Changes from the original spec](docs/SPEC-CHANGES.md): every material change and its reason.
- [Implementation and verification ledger](docs/superpowers/plans/2026-10-28-acquisition-manual-pilot.md).

```sh
npm ci
cp .env.example .env.local
# Configure Clerk and a separate Supabase test project; follow docs/DEPLOY.md.
npm run dev
```

Open `/acquisition`. A Clerk account alone does not grant data access: an administrator must explicitly add an active workspace membership. Historical routes redirect to the desk; historical send/discovery endpoints and CLI jobs are disabled.

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

Acquisition uses a bounded JSON workspace document with transactional optimistic concurrency, independent database membership checks and append-only audit entries. All mutations run through validated server commands. Each workspace is isolated; browser clients cannot directly mutate operational state. Existing unowned legacy rows are quarantined by the migration, not assigned to the first signup.

This is a private pilot product, not a completed public subscription service. Production deployment, membership provisioning, reviewed operational evidence and restore verification remain explicit release steps. Hosting, authentication, storage and support costs are additional to the original operating budget and must be verified for the selected plans.
