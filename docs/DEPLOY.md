# Deploy and verify Sangam sourcing and manual Acquisition

This release is a private pilot, with uploaded-export processing and refresh enabled but automatic provider fetching and outreach disabled in code. It does not authorize a data purchase, contact, professional attestation, contract or production migration. Use a separate test project first. Source and workflow review date: 2026-10-28.

## Configuration and identity

1. Use Node 22 and `npm ci`. The committed lockfile is the release dependency baseline.
2. Configure a Clerk application for the intended deployment. Set the publishable and secret keys, redirect paths and **server-only** `CLERK_AUTHORIZED_PARTIES` from `.env.example`. Missing keys or a missing/invalid origin allowlist fail closed with a private 503 response. Signups have no workspace membership by default. Disable open registration in Clerk if this is an invite-only deployment.
3. Configure a dedicated Supabase project URL and **server-only** service role key. Never use a `NEXT_PUBLIC_` prefix for the service key. No browser Supabase client or direct authenticated writes are part of this release.
4. Use separate credentials/databases for preview and production. No Twilio, Resend, PropertyRadar, skip-tracing, RentCast or Anthropic credentials are needed. Remove old provider credentials and retired discovery/webhook configuration from the hosting project; the corresponding code paths also refuse operation.

Clerk verifies identity on the server; stored database membership grants workspace access. The server never accepts a role or user identity from submitted JSON. Direct Supabase JWT integration is not required for the server-mediated UI; RLS still protects tables from authenticated/anonymous clients. Do not add browser database writes without a separate security review.

### Exact Clerk origins and private hosting

For the intended production host, configure `CLERK_AUTHORIZED_PARTIES=https://sangam.kahlalabs.com`. This is an explicit operator setting, not a default or a claim that DNS, Clerk production or hosted sign-in has been verified. The comma-separated list accepts at most 16 canonical HTTPS origins, with no trailing slash, path, query, fragment, credentials or wildcard. Each listed origin is independently trusted, so include only hosts you control. Host, Origin and forwarded request headers cannot add to this trust list. Clerk checks the signed session's authorized-party claim against it.

For local `npm run dev`, use `http://localhost:3000` (or an explicitly listed HTTP loopback origin/port). HTTP origins are rejected outside `NODE_ENV=development`. Production-built local testing therefore needs the fail-closed smoke test or an explicitly configured HTTPS host. Preview deployments must have their own exact HTTPS origin list and separate development keys/data; do not put localhost or a wildcard `*.vercel.app` in production. Changing any deployment environment configuration requires redeployment and a fresh sign-in check.

Clerk supports development keys on a `*.vercel.app` preview; production requires an owned domain, production instance, verified DNS/certificates and production keys. Development users do not transfer to the production instance: provision workspace membership for the verified production user ID. The verified live release uses Vercel Standard Protection (`prod_deployment_urls_and_all_previews`): production domains use Clerk directly, while previews and generated deployment URLs retain Vercel protection. All Deployments protection was used during initial setup. Do not create shareable bypass links or infer that Vercel access grants Sangam workspace access.

Sources checked 2026-10-28: [Clerk authorized parties](https://clerk.com/docs/reference/nextjs/clerk-middleware), [Clerk environments](https://clerk.com/docs/guides/development/managing-environments), [Clerk on Vercel](https://clerk.com/docs/guides/development/deployment/vercel), [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection), [Vercel project update API](https://vercel.com/docs/rest-api/projects/update-an-existing-project).

## Migrate a test project

Back up the target database first. Inspect its migration history and schema before applying anything. For a new database apply, in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/20261029031348_acquisition_workspace_boundary.sql`
3. `supabase/migrations/20261029063411_automation_sources_jobs.sql`

For an existing Sangam database, verify that migration 001 already matches the schema, then apply only the new migration with your normal reviewed Supabase migration workflow. Do not replay the initial CREATE TABLE statements over existing tables or mark a migration applied without verifying the schema. The new migration is transactional. It creates workspace membership, operational state and audit storage, enables RLS, restricts grants, and quarantines legacy records with no workspace assignment. It does not infer ownership or copy local pilot approvals.

As a database administrator, create the first workspace and explicitly add the **verified Clerk user ID** from the intended Clerk application:

```sql
insert into public.workspaces (name)
values ('Kahla Labs LLC')
returning id;

-- Replace both placeholders with verified values from the preceding step and Clerk.
insert into public.workspace_members (workspace_id, user_id, role)
values ('<workspace_uuid>', '<verified_Clerk_user_id>', 'admin');
```

Use `operator` for daily data entry and `reviewer` for evidence, template and batch approval. `admin` can do both. Membership provisioning is an administrative database operation; users cannot invite themselves or edit their role through the application. Revoke a membership by setting `active = false`; subsequent loads and saves are denied. Role changes and revocations are checked again at save time.

Legacy data is intentionally not automatically copied into Acquisition. Review ownership, source rights, buyer permissions and synthetic status, then import/add the approved records through the new workflow. No taxpayer, seller or buyer data belongs in GitHub.

## Verify before production

```sh
npm run typecheck
npm run test:unit
npm run test:db
npm run build
npm run test:production
npx playwright install chromium
npm run test:browser
npm audit
```

Builds use Next.js's supported Webpack backend because Turbopack's local CSS worker could not open its required port in this workstation environment. Production compilation and the actual built HTTP endpoints were verified with Webpack.

The database test helper creates a socket-only temporary PostgreSQL cluster, applies all migrations and removes it afterwards. Install PostgreSQL 17 tools (`initdb`, `pg_ctl`, `pg_config`, `pg_dump`, `psql`); set `PG_BIN` if they are not on your path. Tests cover tenant isolation, anonymous/direct-write denial, revoked membership, role checks, concurrent compare-and-swap, transaction rollback and local backup/restore parity. They never use `SUPABASE_URL` or its service key.

CI can supply `PG_TEST_URL` pointing to a fresh, disposable database whose name starts with `sangam_test`. That path applies migrations and runs database assertions, but the local helper's independent dump/restore check is separate. Never point it at a customer database. The browser fixture test uses the real UI and domain against fictional in-memory data; it does not establish production Clerk sign-in or provider delivery.

In the configured test deployment, verify with two real test identities: workspace A cannot see B; an unprovisioned account sees no leads; an operator cannot approve evidence/templates/batches; revocation denies the next request; a stale form cannot overwrite a newer change. Verify login, logout and refresh on desktop/mobile. Record the deployed commit and results in the workspace's technical evidence only after completing those checks.

Authentication boundary tests use locally signed fictional sessions with the real Clerk verifier and a local public-key fixture. They check accepted configured origins, rejected neighboring/spoofed origins, exact ports, preview origins and missing/invalid configuration. They do not establish live Clerk production sign-in. On the actual hosted release, confirm that an unauthenticated production visitor is redirected to Clerk sign-in while generated deployment URLs retain Vercel protection; complete Clerk sign-in on `https://sangam.kahlalabs.com` and verify membership-based access before importing real data.

## Production release

Deploy the reviewed commit to the existing Sangam hosting project only after choosing the production target, validating backup restoration and completing the test deployment checks. Do not treat this document or a pull request as proof of deployment.

- Apply the reviewed migration with a recoverable backup and provision verified memberships.
- Set the configuration in `.env.example`, including a randomly generated, sensitive, production-only `CRON_SECRET` of at least 32 characters. The hourly `/api/cron/sourcing` schedule processes up to five bounded jobs and queues due refreshes. Every source schedule starts disabled and requires reviewer approval. No scheduler secret belongs in the browser or repository.
- Restrict production access to the pilot operators. Confirm the host's log, backup, data retention and access policies for seller information.
- Supply genuine evidence in Readiness, import a small authorized export, inspect every row and release only the first reviewed manual batch.
- Mail order placement, payment, calls and buyer deliveries happen outside Sangam. Verify the exported file's validity window and record actual receipts afterwards.
- Retired APIs return 410; missing auth configuration returns 503; unprovisioned workspace access is denied. These are expected protective behavior.

## Capacity and recovery

Pilot limits: 5,000 leads per workspace, 500 recipients per batch, ten buyer recipients per packet, 1.8 MB CSV input, 2 MB HTTP request and 32 MiB operational state. Large private responses negotiate gzip; responses are bounded below 4 MB on the wire before a mutation commits. Use a modern browser and split large imports. This is an explicit pilot aggregate design, not a claim of unbounded SaaS scale. Growing audit/history requires a planned normalized migration/archive, never ad-hoc deletion of suppressions or approval evidence.

A failed save is unconfirmed until refresh. Reopen the workspace before retrying. Version conflicts return 409. Receipt idempotency and uniqueness prevent duplicate touches; inspect the saved receipt if a download or connection was interrupted.

For rollback, first stop user writes or serve a maintenance response. Preserve the membership/RLS/provider blocks. **Do not redeploy the original unscoped live-sending code against the migrated database or remove security controls to make it work.** Prefer a forward fix. If database recovery is necessary, restore the verified backup into an isolated project, compare state/audit counts and hashes, verify RLS and memberships, then explicitly switch the deployment. Re-enter any actual post-backup outcomes from retained receipts, preserving their event dates and suppression requests. A backup that has not been restored and checked is not release evidence.

## Remaining commercial decisions

Paid public subscriptions require separate billing/entitlement enforcement, customer terms/privacy review, support and data-retention policies. The old README's MRR and vendor prices were assumptions, not verified accounts or current quotes. Product hosting/auth/database costs are additional to the original $600–750/month pilot operating estimate; verify selected plan costs and commercial-use terms before purchase.

Technical references: [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16), [Clerk Core 3](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). These references support implementation choices, not professional approval of the wholesaling activity.


## Export processing operations

The current source is an authorized uploaded PropStream CSV. Extraction from PropStream stays manual; no provider API or scraper is connected. The worker processes at most500 rows per source run and stores at most500 current records per source /5,000 per workspace. Limits include20 sources and100 immutable rule versions per workspace. The monthly source allowance (at most10,000 processing rows) includes refreshes, not just newly collected records. The cap is a workload limit, not a provider invoice or actual expense.

The scheduler wakes hourly at minute17 UTC, claims durable jobs under a120-second lease, and runs enabled sources at their selected24–720-hour interval. Queued uploads also process immediately when possible. Duplicate file+source-date uploads in the same source revision reuse the job. Failed transient work retries at most3times; invalid files, expired rights, missing rules and exhausted limits produce a visible hold. Held imports require correction and a new source revision/export; the original raw upload is discarded after terminal completion/hold, while normalized records, dates, checksums and decision traces remain.

The latest250 research records appear per page; Previous/Next accesses retained rows. Rule dry runs evaluate the selected page. Every new manual batch/packet preparation or export of a promoted record checks current source permission again at the atomic save boundary. Historical receipts remain recordable after a source is revoked. Rules cannot authorize contact.

A database rollback is not needed to disable processing: remove the cron schedule or unset CRON_SECRET, then pause affected sources. The prior manual app can ignore the additive automation tables; keep its existing tenant isolation and outreach blocks. Use a forward fix for any migration issue. Production backup/recovery remains a separate prerequisite for real business operations; local disposable backup/restore tests do not replace it.

References checked2026-10-28: [Vercel Cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). No new provider subscription or billing integration is part of this release.
