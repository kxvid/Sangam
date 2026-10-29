# Changes from the original pilot specification

Decision date: 2026-10-28. Human authorization: integrate Acquisition into Sangam, fix go-live blockers, keep mail and calling manual. This ledger records product decisions; it does not approve professional advice, data rights or business milestones.

| Original specification | Implemented change | Why |
|---|---|---|
| Standalone Python/local desk and proposed normalized Postgres engine | Hosted Next.js Sangam module backed by a bounded, versioned workspace document in Postgres (5,000 leads / 32 MiB) | Delivers one authenticated workflow and atomic approvals/receipts. Normalization and background processing are future scale work; this release is sized for the pilot. |
| APN primary key; dedupe APN + owner | Workspace + county + APN identity, retaining current owner and source details | APNs can collide between counties; owner changes must not inherit the previous owner's contact clearance. |
| Broad automatic scoring/discovery/outreach pipeline | User-provided CSV with preview and explicit import; manual mail/call exports only | Matches the user's chosen route and avoids unreviewed data purchases or contacts. |
| Optional database isolation later in Sangam | Membership authorization, RLS, service-only atomic mutations, stale-version protection and audit now | A product must not expose one customer's leads to another or accept unreviewed browser writes. |
| General hosted sign-in without a specified domain boundary | Server-configured exact Clerk origin allowlist; missing/invalid configuration blocks access; production target `https://sangam.kahlalabs.com` | A valid session from an unapproved neighboring origin must not grant access. Request headers cannot expand the allowlist; production hosting remains private during verification. ClerkProvider is inside the document body to match the current Core 3 setup. |
| Sangam default live sender, cron discovery and paid AI/lookup jobs | Disabled at endpoints, jobs and provider wrappers; obsolete screens redirect to Acquisition | A forgotten route, environment flag or CLI command must not activate automatic outreach or costs. |
| General 'regulatory hurdles resolved' statement | Human-entered, dated evidence per gate and workspace; role-limited review | Preserves the human statement without inventing an attorney identity, source permission or hosted technical approval. |
| Data provenance primarily an operator checklist | Server-enforced source/date/permission evidence, import hash and preview binding | Prevents a direct API call or a different file from bypassing the reviewed import. |
| Template preapproval | Versioned reviewed templates plus exact recipient/content/evidence snapshots for each batch; approval expires after 24 hours | Approval must refer to the material actually exported; changes, suppression and expired evidence invalidate release. |
| DNC/litigator check before send | Per-phone dated evidence required for eligible exports, including the conservative pilot mail rule | Retains the existing pilot control. Whether mail can use a different policy is a separate reviewed policy change, not assumed here. |
| Outbound automation, VAPI qualification and cross-channel nurture | Human qualification, recorded outcomes and due follow-ups | Keeps calling manual and avoids recording/voice or texting integrations that were not authorized. |
| Automatic top-10 buyer alerts within 24h | Fit ranking, reviewed manual packets, delivery receipts and due tasks | An export is preparation, not delivery. Human receipts make the SLA auditable. |
| AI-generated buyer ranking/copy and 0–100 financial score in legacy Sangam | Deterministic buyer fit and original motivation score; operator-entered comps/underwriting | Keeps seller motivation separate from economics and avoids paid inference or invented comparable sales. |
| Test records in the same general workflow | Reserved fictional contacts and unusable practice export destinations | Practice mode must not become a bypass for releasing real leads without evidence. |
| Mutable contact history | Immutable reviewed destinations and evidence copies; late inbound opt-outs remain recordable | Phone/owner edits cannot erase call limits or revive a suppressed buyer. |
| Assumed launch and 90-day targets | Clock starts only from an evidenced real outreach receipt; synthetic work excluded | Test exercises must not manufacture business progress. Targets stay 2,000 unique leads, 20 offers and 1 signed contract. |
| Blanket 'fully compliant' mail, foreclosure timing and definitive legislative statements | Evidence-driven operating controls; legal conclusions remain for qualified review | Software controls are not a legal opinion. The original AB 1850 narrative is not adopted as verified law. |
| 500 mail pieces/month toward 2,000 leads/90 days | Volume gap called out, targets unchanged | Three months yields 1,500 pieces before repeats; additional unique manual calls/mail or a revised plan are needed. |
| Roughly $600–750 monthly operating budget | Kept as an unverified planning assumption; product hosting/auth/database/support are additional | No current subscription or vendor quote is implied. No services were purchased. |
| Next.js default build backend | Supported Webpack production build | Turbopack's CSS worker hit a workstation port restriction; Webpack compiled and passed the production route smoke checks. |
| Unlocked older dependencies and no release tests | Lockfile, patched dependencies, CI, domain/HTTP/database tests and release checklist | Reproducible installs and verified tenant/outreach boundaries are go-live prerequisites. |
| Existing Sangam subscription price/MRR text | No claim of live billing, paid plans or current MRR | Billing, customer terms, support and entitlement enforcement must be designed before a paid public launch. |

## Unchanged intent

Kahla Labs LLC operates the pilot in Riverside and San Bernardino Counties. The original 17 ZIP codes, seller scoring weights and score threshold of 8 remain. Humans negotiate, execute contracts and close. Actual contract and disclosure references are required before disposition; profits and assignment fees are recorded only from real evidence.

## Release evidence

See the implementation ledger and deployment guide for test results and outstanding deployment steps. A passed test suite does not mark a professional, commercial or operational gate complete.
