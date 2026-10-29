# Sangam recovery runbook

Updated 2026-10-29. This is an operator procedure, not evidence that production has been backed up or restored. No command in this work connected to production or changed a readiness approval.

## Current finding

The signed-in Supabase dashboard for Sangam (`hlzszgqjfomfbfiwbyky`, Kahla Labs LLC) showed **Free Plan does not include project backups** on 2026-10-29. The current [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) recommends regular exports and off-site copies for free projects; its automatic daily backups are a paid-plan feature. No upgrade was purchased. A production restore remains unverified.

The existing `npm run test:db` restores an entirely fictional local database. The additional recovery tool below accepts an operator-provided application backup and compares its isolated restored contents with a fingerprint taken from the same source snapshot. It cannot establish where a supplied file came from, and it does not automatically grant a business or technical gate.

## What is covered

The backup must include **both `public` and `sangam_private`** schemas, with data, indexes, constraints, policies, grants and routines. The verifier checks all 15 application tables, including the legacy tables, workspace memberships, whole Acquisition state, audit history, sources, immutable rules, jobs, research records and decisions. It compares counts and SHA-256 content fingerprints, column/constraint/index definitions, RLS flags and policies, application-role privileges, application-function definitions/execute rights, and both audit identity sequences. Database/schema/table/function owners, relevant role attributes (including superuser and RLS bypass), and inherited role memberships must also match.

This is an application-database recovery drill. It does not recover Clerk accounts, passwords, Vercel configuration, DNS, Supabase platform internals, role passwords, Storage file objects, or objects outside those two schemas. Inventory any future storage attachments and new tables explicitly. Preserve approved environment configuration and secret-recovery procedures in the team's password manager. A service-role API key is not a PostgreSQL backup credential.

## Prepare privately

1. Verify the intended project in the Supabase dashboard before choosing its database connection. Use the dashboard's direct/session connection settings and an authorized database administrator credential. Do not put passwords in chat, a shell command, Git, the report, or a public connection string. A libpq service profile such as `sangam_backup` and a protected password file can hold the connection outside the repository. Follow the [PostgreSQL connection service documentation](https://www.postgresql.org/docs/17/libpq-pgservice.html).
2. Use PostgreSQL client tools compatible with the source server. The local rehearsal was run with PostgreSQL 17.10; re-check the real server version. The verifier needs `pg_config`, `initdb`, `pg_ctl`, `createdb`, `psql`, and `pg_restore`. Set `PG_BIN` to the trusted tools directory when necessary. Node 22 is the application baseline.
3. Create a private working directory **outside the public repository**, mode `700`. Backup and fingerprint files must have mode `600`. Use encrypted local storage and an encrypted off-site destination controlled by Kahla Labs. Never upload real backups to GitHub, Notion, or a chat.
4. Arrange a short no-write maintenance window: operators stop editing, administration changes stop, and source/cron workers are paused and finished. PostgreSQL sequences are not transactionally frozen by an exported snapshot. This no-write window is needed to compare their positions exactly; do not infer it merely because the UI is idle.

## Capture a consistent source snapshot

These commands are instructions for the authorized administrator. Replace `/private/backup` with the owner-only directory and use the verified service profile. They have not been run against Sangam production.

From the repository, print the read-only fingerprint query to a private file:

```sh
node scripts/recovery-manifest.mjs > /private/backup/manifest.sql
```

Open one database session and leave it open until the dump finishes:

```sh
psql --dbname='service=sangam_backup' -X -qAt --set=ON_ERROR_STOP=1
```

In that session:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot();
```

Retain the actual returned snapshot identifier. In the same session, save the fingerprint (these are psql commands, not SQL):

```text
\o /private/backup/source-manifest.json
\i /private/backup/manifest.sql
\o
```

In a separate terminal, use that **actual** snapshot identifier while the first session remains open:

```sh
pg_dump --dbname='service=sangam_backup' \
  --format=custom --no-owner \
  --schema=public --schema=sangam_private \
  --snapshot='ACTUAL_SNAPSHOT_ID' \
  --file=/private/backup/sangam.dump
```

Check the command's exit status and any private warnings. Only after successful completion, return to the original session and issue `COMMIT;`, then `\q`. Keep the maintenance window short. If the transaction ends or either command fails, discard that incomplete pair and repeat; do not mix a dump with a fingerprint from another moment. Protect both files with `chmod 600`.

[PostgreSQL documents consistent dumps and the `--snapshot` option](https://www.postgresql.org/docs/17/app-pgdump.html). The exported snapshot must remain available during the dump. The fingerprint query contains no writes, and the snapshot transaction is explicitly read-only.

## Verify in an isolated local database

```sh
node scripts/recovery-verify.mjs \
  --trusted-archive /private/backup/sangam.dump \
  --manifest /private/backup/source-manifest.json \
  --report /private/backup/recovery-report.json
```

The tool accepts only owner-only local custom-format archives, at most 512 MiB, and a fingerprint at most 2 MiB. It creates a fresh PostgreSQL cluster with a private Unix socket and **no TCP listener**, ignores inherited PostgreSQL connection variables and application credentials, restores with preserved ACLs under its local bootstrap owner, checks the source and restored fingerprints, and removes its temporary data. It accepts no destination URL, `--clean`, production connection string or credentials. It refuses to overwrite an existing report. `PG_BIN` only selects trusted installed PostgreSQL tools.

**Owner/role differences fail closed.** The local bootstrap `postgres` role is a superuser; a managed Supabase `postgres` role may not be. `SECURITY DEFINER` routines execute as their owner, so changing that owner or its privileges cannot be treated as equivalent recovery. This tool does not recreate platform roles, restore role passwords, demote/escalate roles, or ignore those differences. If the source's ownership, role attributes or inherited memberships differ, the local verifier cannot pass that backup; proceed to the reviewed isolated Supabase restore below. The fictional local test is not evidence that a managed production backup is compatible.

Use only an authentic backup from trusted database administrators. [PostgreSQL warns that restores can execute code from a source database](https://www.postgresql.org/docs/17/app-pgrestore.html); a local socket is not a sandbox for malicious SQL. Do not test unknown third-party dumps on this workstation.

A passing report means **local restored application data and captured security metadata matched the supplied source fingerprint**. The report always records `productionRestoreVerified: false` and `sourceAuthenticityVerified: false`. An operator must separately establish source project, date, export custody and snapshot. A sanitized or fictional backup can prove the procedure works, but cannot prove production data recovery. Tool errors suppress database output and raw JSON/filesystem diagnostics because failed restores or input parsing can contain seller data; review failures only in a private administrator environment.

If the backup contains additional Supabase-managed objects or role grants that the local rehearsal cannot reconstruct, stop and inspect the failure privately. Do not remove ACLs, skip failed objects, or weaken checks to manufacture a pass. Use a reviewed isolated Supabase restoration instead.

## Close the real operating blocker

- Produce a genuine backup/fingerprint pair from the intended production project and run the local verifier.
- Retain its archive hash, snapshot time, production project reference, operator, report, and encrypted off-site location in the private recovery record. Test retrieving the off-site copy and verify its hash; a local copy alone is not off-site recovery.
- Restore into a separate approved Supabase target, preserving the security boundary. Verify workspace isolation, membership revocation, current source holds, suppression, audit history, disabled outbound providers, Clerk sign-in and the current application release against that target. Keep schedules paused during this exercise.
- Record actual elapsed recovery time and data-loss window, then attach the genuine evidence reference to technical readiness. Do not switch production to the restored target unless a recovery/cutover is explicitly planned and verified.
- Resume only the intended data-processing jobs after checking stale leases and source status. Restore must not replay mail orders, calls, buyer deliveries, or business receipts. Reconcile actual post-backup outcomes from retained records.

Suggested initial operating target: one encrypted daily application backup and an additional snapshot before schema changes, with a monthly restore drill. A 24-hour recovery-point target and four-hour recovery-time target are proposals, not measured guarantees. Update them after the first real drill and account for actual storage/tooling cost.

## Rehearsal verification

```sh
node scripts/recovery-self-test.mjs
```

This test creates only temporary fictional databases, reuses the existing membership/automation fixtures, restores all 15 tables, and rejects a changed fingerprint, missing table, disabled RLS, direct-write privileges, changed function owner, different owner superuser privileges, authenticated-role RLS bypass and plain SQL. It verifies that malformed JSON and filesystem failures cannot echo private input and that inherited production-looking connection settings cannot redirect the local restore. No real seller data, source permissions or professional attestations are involved.
