# Sourcing and matching release review

Review date: 2026-10-28. Scope: the automated PropStream export-processing release, including its decision engine, database, worker, API and manual Acquisition handoff. This review does not authorize real source evidence or outreach.

## Findings resolved during review

1. **P1 — Cross-workspace source updates.** `automation_save_source` originally accepted a caller-supplied existing source UUID with expected revision zero, looked up the old row only inside the caller workspace, then used an unconstrained `ON CONFLICT(id) DO UPDATE`. A reviewer in another workspace could overwrite that source and hold its jobs. Require a supplied UUID to identify a source in the caller workspace; test the foreign-ID/revision-zero request and unchanged victim data.
2. **P1 — Revocation must follow promoted records into manual work.** The new research checks know `Lead.automationSourceId`, but the original manual draft/approval/export route initially consulted only general Acquisition gates. A source revoked after promotion could still be used for a mail/call export or buyer packet. Recheck current source status, expiry and permission reference for the affected records, and verify the same source revisions under a database lock at the manual-state commit. Test source revocation between review and export.
3. **P1 — Accepted records beyond the first 250 were unreachable.** Sources allow 500-row exports and 5,000 retained workspace records, but the initial read RPC and promotion service exposed only the newest 250 with no cursor or offset. Add paginated reads and a workspace-scoped single-record lookup for promotion; test a record beyond the first page.
4. **P2 — Upload retries need a stable idempotency identity.** The initial UI generated a new random request key on each submission. A lost HTTP response followed by retry created another processing job and consumed the allowance again. Derive the ingestion identity from the source revision, file content and source date on the server, while retaining request consistency checks. Explicit refreshes may remain distinct operations.
5. **P1 — PostgreSQL timestamps must be normalized before engine validation.** Source expiry is a `timestamptz`; its JSON representation uses an offset such as `2026-11-28T18:00:00+00:00`. The decision engine accepts canonical UTC `Z` timestamps only. The initial `sourceGrant` passed the database representation through unchanged, so real sources with mandatory expiries failed evaluation. An isolated engine invocation reproduced `RuleValidationError: Grant expiry must be an ISO UTC timestamp.` Normalize at the trusted adapter/store boundary and test a database-shaped expiry.

The implementation owner accepted and fixed all five findings. Focused re-review found no outstanding release blocker in these changes. This is a code and local verification conclusion; hosted verification remains pending.

The source update now constrains both the initial lookup and the `ON CONFLICT` update to the caller workspace, and rejects a conflict that did not update a row. The second condition also closes a concurrent same-UUID creation race between workspaces. Manual batch/packet preparation, approval and export now resolve the lead's stable `automationSourceId`, check current evidence, and pass the expected source revision/reference into a lock-protected Acquisition commit. Research reads are paginated; promotion loads its record directly within the workspace. Upload keys derive from file content and source date on the server, scoped by source revision in storage. Source grants normalize database timestamps before engine validation.

## Follow-up verification

- [x] Foreign source UUID updates and concurrent creation collisions are rejected without crossing workspace ownership.
- [x] Manual source checks bind current evidence to the final database commit; paused/revoked, changed-reference and stale-version paths fail closed.
- [x] Database reads cover all 500 source records across pages, and the single-record loader remains workspace scoped. Promotion uses that loader instead of the first-page snapshot. The browser harness also covers 261-record pagination.
- [x] Server-derived upload identity is stable; database retries return the original queued/completed job and inconsistent key reuse is rejected.
- [x] A database-shaped offset expiry is normalized and evaluated through the actual decision engine; expired source evidence remains blocked.

## Verification evidence and limits

- The independent reviewer read the final fixes and their regression tests. The original timestamp failure was independently reproduced before correction.
- The implementation owner reported 89 unit checks and TypeScript validation passing, plus a successful production build and built-server HTTP smoke. The cron endpoint rejected an unauthenticated request with 401 when no secret was configured.
- The database implementation owner reported the original isolation suite and three automation scenarios passing against actual local PostgreSQL. Coverage includes concurrent same-UUID source creation across workspaces, durable leases/retries, source grant changes, manual commit guards, 500 full decision explanations, and a 4,999-to-5,000 workspace-capacity race in which exactly one of two source commits succeeds. Backup/restore verification passed. The 500-record explanation payload measured about 3.49 MB without duplicated snapshots.
- The UI implementation owner reported 13 isolated fictional workflow checks passing, including upload, explained results, explicit promotion, stale-source hold, pagination, mobile layout and operator controls. These are local fixture checks, not hosted API or database evidence. The root implementation owner is rerunning both browser harnesses after the final buyer-history display change.
- Hosted sourcing smoke passed on October 29 on release `44fe7adb65182f2392939519d73a851f5a1fb2b8`: authenticated practice workspace, fictional source with expiry, published seller/buyer rules, three-row upload, expected suitable/excluded/needs-information decisions (12/0/unknown), explicit promotion, persistent reload, duplicate-upload job reuse, and a three-row refresh. Pausing the source disabled further promotion and scheduled refresh. The practice Acquisition desk showed two fictional leads and zero real touches/offers/contracts/revenue; the launch clock remained unstarted. No real professional or source approval was recorded. Hosted buyer-contract execution and the authenticated cron invocation were not exercised in this smoke; those paths retain local/CI coverage.

## Other observations

- The engine performs structured comparisons only, preserves unknown facts, bounds input size/depth, and applies immutable source/suppression/buy-box checks through trusted adapters.
- The workflow does not fetch PropStream, connect an external lead provider, or send outreach. The old sender and enrichment paths remain disabled.
- Manual-source legacy buyer matching remains dependent on saved source evidence and current workspace provenance; automatic-source origins must never fall back to that legacy permission route after revocation.
- Live release should verify a fictional upload through its database save and promotion, not only a browser fixture. Business counters and actual launch must remain unchanged.

