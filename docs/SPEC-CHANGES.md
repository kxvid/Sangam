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


## Automated export processing and decision-tree release —2026-10-28

User authorization: build sourcing and matching into the live app, keep mail/calling manual. Source choice: **PropStream exports only for now**. The following supersedes earlier descriptions of background processing as future work.

| Original or earlier implementation | Change | Why |
|---|---|---|
| Nightly provider pulls/API if available | Upload an authorized PropStream export; durable background jobs validate, dedupe, score and match it; scheduled refreshes use existing data | Matches the selected data route without assuming API access or scraping rights. The export step remains manual. |
| One bounded operational JSON document | Separate normalized source, rule-version, job, research-record, decision-history and automation-audit tables | Avoids turning the manual transaction document into an ingestion history store. |
| Fixed seller/buyer rubric only | Editable typed decision trees with immutable published versions, dry runs, conditions and stable hashes | Explains fit and supports controlled tuning while keeping original seller weights/8-point threshold as the default. |
| Missing signals treated only as absent score | Unknown conditions produce review; unknown ranking facts produce score ranges | Avoids manufacturing facts or silently passing missing buyer rehab/price criteria. |
| Tenant-controlled ranking | Independent source, freshness, suppression, county, practice and buyer/contract constraints | A custom rule cannot remove the platform requirements. |
| Automatic top10buyer alerts | Automatic buyer reevaluation after relevant saved changes and scheduled refresh; results remain in-app | Speeds selection while preserving manual packet approval and delivery. |
| Refresh could be mistaken for new collection | Original source dates and exact facts stay unchanged on refresh | Prevents stale data appearing newly sourced. |
| Best-effort nightly script | Durable idempotent jobs, leases, bounded retries and monthly processing caps | Recovers interrupted requests and avoids duplicate work or runaway processing. |
| Source permission checked at first import | Current source rights checked at collection, commit, promotion and manual batch/packet preparation/export | Revocation must stop new use even after a lead enters Acquisition. |
| Single research list | Pages of250 records plus independent record lookup | Makes every accepted500-row export reviewable without an unbounded browser response. |
| Production setup only | Verified-domain login, isolated practice workspace, protected previews and production-only scheduler secret | Separates real operation from testing and protects job endpoints. |

No automated messages/calls, actual business milestones, legal approvals, source licenses, paid data services, billing, or subscription entitlements are created by this release. Hosting/database processing may consume existing plan allowances; no new paid plan is purchased. Existing production backup/recovery and real evidence prerequisites remain.

## Operating features and free public data — 2026-10-29

User authorization: continue development autonomously, add free data sources and five useful features for operating the business. This expands the earlier PropStream-only source preference; mail and calling remain manual. The table records this build's scope. Deployment and live verification are separate release evidence, not implied by an entry here.

| Original or earlier implementation | Change | Why |
|---|---|---|
| Vendor list exports, with later API access contemplated | Public-source catalog and an explicit single-property Census address lookup; FEMA county context and Riverside city permits show clear holds | Adds a verified free lookup without claiming context data is a fresh motivated-seller list. Census receives only the address after confirmation. Current FEMA terms remain unverified and the Riverside feed returned 403. |
| One MAO calculation from entered underwriting | Saved base/downside/upside profit scenarios with rehab contingency, buyer ceiling, seller MAO, assignment spread, operating costs and projected net | Shows uncertainty and costs that a gross assignment fee hides. Missing inputs remain unknown; scenarios neither change actual offers nor count as income. |
| Separate seller and buyer follow-up lists | A prioritized daily work queue with contract deadlines, buyer replies, seller next steps and blocked prerequisites | Makes the next human action easier to find. Viewing or clearing preparation work does not send outreach or mark a deal complete. |
| Buyer matches, packet preparation and delivery receipts | Contract-specific buyer follow-up plans, conversation/offer history and offer withdrawal tracking | Distinguishes intended follow-up from actual buyer responses and executed assignments. Planned tasks do not create contact receipts, deposits or revenue. |
| Weekly/monthly KPI review plus gate checklist | Private-pilot readiness view with the current real funnel, contract risks, recorded net cash and existing 90-day launch metrics | Separates technical/operating readiness from business results, and estimates from received money. The launch clock still requires an evidenced real touch. |

The autonomous part is validation, scoring, explained matching, refreshing authorized records and preparing the next action. Human work still includes acquiring authorized PropStream exports, reviewing source rights and batches, mailing, calling, negotiation, signatures and closing. These features do not promise a profitable deal or provide unattended end-to-end selling.

### Source and budget assumptions changed

- The Census Geocoder is separate from the Census Data API. Current Data API guidance requires a key for **all** ACS queries, so the old keyless 500-query assumption is not used. No key was registered.
- No additional functioning free Inland Empire foreclosure, delinquency, probate or code-violation feed with verified reuse rights was established. The public-data catalog labels availability and limits explicitly. The existing authorized PropStream workflow remains the source of operational seller leads.
- Address lookups require a confirmed property request, current applicable source permission and a durable reservation: at most 20 attempts per workspace in a rolling 24 hours and one attempt per property per minute. Failed attempts count. Results do not silently replace addresses or change motivation, consent or contact clearance.
- No new paid service or subscription was purchased for these features. Free source access does not eliminate hosting, storage, authentication, mail, phone, data-licensing or human operating costs. The original budget remains a planning assumption; modeled profit is not collected cash and excludes tax and any unallocated overhead.

See [Free public-data sources](FREE-DATA-SOURCES.md) for verified endpoints, source dates, access failures and integration limits. Paid public SaaS billing, entitlements and self-service customer onboarding are not represented as complete by this build.

## Wholesaler launch research and supporting tools — October 29, 2026

User clarification: operate as the wholesaler; research the best path in Browser and create a cited gameplan. These changes are local supporting tools and recommendations. They do not activate new data collection or outbound channels in production.

After reviewing the $119/month PropertyRadar option, the user selected **PropStream exports for now**. That is the active source decision; PropertyRadar remains deferred and no additional data subscription was purchased.

The user then clarified that PropStream signup is still needed. Trial signup was prepared without submission. The initial trial sample is 10–25 records within the advertised 50-property allowance; a 100–250-record batch depends on verified account entitlement. No paid enrollment or account creation is claimed.

| Original or earlier assumption | Change / current decision | Why |
|---|---|---|
| SaaS monetization among go-live prerequisites | Prioritize Kahla Labs' own wholesaling operation; defer customer subscription/onboarding work | A closed assignment is the requested outcome. Product billing is not required to operate the private desk. |
| PropStream API if available | Retain authorized exports for the first batch; recommend PropertyRadar Solo as the next actual API source | Current paid Solo API access is documented at $119/month; a general PropStream developer feed was not established. No subscription was purchased. |
| No usable free IE distress feed established | A working official San Bernardino weekly tax-default CSV was found; add an offline research decoder | New primary evidence improves on the earlier search. Tax bills need exact parcel joins, status review and missing owner/address enrichment before becoming seller leads. |
| Generic daily scraping of public pages | Provider-specific licensed API/delivered-file paths; county recurring collection remains held pending scope/access checks | Preserves dates, field meanings and repeatability; avoids pretending a public search page is an unrestricted API. |
| Unattended data retrieval could be covered by a rough budget | A PropertyRadar preview-only client hardcodes Purchase=0, with no acquisition method | Cost/count previews do not reserve credits; the provider exposes no atomic maximum-charge parameter for a subsequent purchase. |
| Local synthetic restore test as available evidence | Separate tooling for verifying an operator-supplied consistent backup in an isolated local cluster | Browser confirmed the real Supabase Free plan has no hosted project backups. Actual production recovery evidence is still outstanding. |
| $52 county file price in an older indexed form | Use current Riverside published $66/file; two proposed files imply $132 per delivery before any additional quote | Prefer the current county form over obsolete pricing. No county order or agreement was submitted. |
| Original AB 1850 narrative | Record the official page's observed May 14 held-under-submission action; no prediction of reintroduction | Browser verification supports an exact dated status, not a broader legal conclusion. Existing professional review remains the operating evidence. |
| One contract automatically triggers doubling volume | Preserve the one-contract target; also inspect buyer fit, closing feasibility and actual net cash before scaling | A signed purchase contract is a learning milestone and obligation, not collected profit. |
| 500 monthly mail pieces could meet 2,000 unique leads | Add an explicit manual-contact capacity plan with deduplication and follow-up allocation | Repeated pieces do not create additional unique leads; targets remain measured from actual launch. |

The [launch plan](WHOLESALER-LAUNCH-PLAN.md) records sources, tradeoffs, inputs and acceptance evidence. The original weights/threshold, manual channels, suppression, real-evidence requirements and human deal execution remain unchanged. No real lead, professional approval, touch, offer, contract or collected fee was created by the research tools.
