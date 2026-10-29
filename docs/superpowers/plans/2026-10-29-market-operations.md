# Market operations implementation plan

> **For agentic workers:** Use the existing parent/child implementation workflow to implement the independently testable tasks below. User authorization already covers autonomous implementation; this plan does not introduce another approval step. Checkboxes describe work still to implement, not completed functionality.

**Goal:** Make the private Sangam pilot easier to operate from authorized research through human deal execution, using free public data where its actual scope permits, with explicit economics and the next useful human action.

**Architecture:** Keep authoritative operating events in the existing workspace-scoped Acquisition JSON document and optimistic-concurrency command boundary. Add bounded optional planning/activity collections, pure projections, and focused components within Acquisition. This release adds an explicit bounded Census address lookup with its own provenance and audit reservation. Scheduled ingestion remains the existing authorized-export workflow; no working free distress-lead feed was verified.

**Tech stack:** Existing Node 22, Next.js, React, TypeScript, Zod, Clerk and Supabase. No new paid data service, LLM dependency, payment integration or automatic sender is needed.

**Spec:** Original Inland Empire SOP, `docs/GETTING_STARTED.md`, `docs/SPEC-CHANGES.md`, the sourcing plan dated 2026-10-28, and the user's 2026-10-29 authorization to add five useful operating features and free API sources. The newer request expands source scope beyond PropStream exports; the manual outreach boundary persists.

## Global constraints

- Mail, calls, buyer delivery, negotiations, signatures, deposits and closing remain human actions.
- A source fetch, saved plan, file export or completed internal task is never an actual touch, offer, signed contract, payment or launch.
- Existing source rights, suppression, recipient contact evidence, exact batch review and role checks remain authoritative.
- Public parcel/context observations do not establish owner identity, a selected contact, consent, equity, distress, a property's flood status, or a comparable sale unless the source actually supplies that fact at the required resolution.
- Do not use neighborhood demographics or demographic proxies to rank people, price offers, match buyers or determine eligibility.
- Missing monetary inputs remain `null`; an explicit entered zero remains zero. Negative modeled profit is visible, never clamped to zero.
- All persisted amounts retain the existing dollars convention; percentages are fractions. Validate finite amounts with at most two decimal places and round derived currency to cents.
- Practice data stays explicitly synthetic and excluded from real operating targets and actual-profit totals.
- Existing launch semantics and targets remain: first actual real touch, 90 days, 2,000 unique sellers touched, 20 delivered offers and one signed seller contract.
- Use scoped existing state/CAS APIs; never persist an arbitrary browser state document. No secrets or private source exports belong in the public repository.
- Public SaaS billing, payment collection and unattended outreach are outside this bounded release. Readiness must call the release a private pilot until those product capabilities actually exist.

## Review focus

1. An unknown repair/cost/price input must not create a profitable-looking zero-cost scenario.
2. An expired, cancelled, closed or suppressed relationship must not produce an actionable contact/assignment task.
3. Planning and buyer-interest records must not increment actual delivery, launch, contract or money metrics.
4. A duplicate request, late reply, stale browser or workspace switch must not overwrite newer evidence or leak another workspace's activity.
5. Context-only public sources and a passing technical check must not be shown as validated seller leads or business/legal approval.

## Current implementation and material extensions

The desk already computes MAO from ARV, repairs, costs, buyer margin and target fee; shows seller follow-ups and 24-hour buyer alerts; records buyer delivery/interest/decline; and calculates pilot costs. Extend those capabilities instead of creating a second version of each:

| Feature | Material addition | Human endpoint |
|---|---|---|
| Free public-data connectors | Audited, bounded official adapters; clear property-level versus context-only observations; source/date/permission display | Review and enrich an authorized candidate; use existing promotion and manual preparation |
| Offer and profit scenarios | Saved base/downside/upside assumptions, rehab contingency, buyer ceiling, seller MAO, assignment spread and net after operator costs | Review uncertainty before manually making or changing an offer |
| Prioritized daily queue | One ordered queue of deadlines, buyer replies, seller qualification and blocked prerequisites, with exact actions | Open the relevant existing form; no automatic contact or automatic completion |
| Buyer follow-up tracker | Planned next action, actual conversation, received offer and offer withdrawal per contract/buyer | Compare actual buyer offers, follow up manually, then record executed assignment separately |
| Go-to-market readiness | Current funnel and contract risk alongside existing launch-window KPIs, recorded net cash, and evidence-backed checklist | Resolve the next missing evidence or operational step |

## File boundaries

- Create `src/operations/{types,profit,buyers,queue,readiness,index}.ts`: browser-safe exported planning/activity/view types plus pure `calculateProfitScenario`, `buildBuyerPipeline`, `buildDailyQueue`, `buildMarketReadiness`. No network, database, random IDs or time reads inside projection functions; `now` is an argument.
- Modify `src/acquisition/types.ts`: optional `profitScenarios` and `buyerActivities` arrays plus strict command union members. Import operation record types with `import type` to avoid a runtime cycle.
- Modify `src/acquisition/domain.ts`: validate/execute the new commands, normalize old state safely and retain existing audit/CAS behavior. Existing underwriting, receipt, assignment and closing commands remain independent.
- Create `components/operations-desk.tsx` and `app/(app)/operations/page.tsx`: a dedicated Operations desk with Work queue, Profit scenarios, Buyer follow-ups and Readiness tabs. Reuse the same authenticated Acquisition API and shared form/panel components.
- Modify navigation and Acquisition deep links so queue actions open the selected seller, contract or readiness screen. Source holds come from the authenticated server payload, not browser guesses.
- Modify `app/api/acquisition/route.ts`: add a server-generated `asOf` timestamp to GET/POST responses; project from the same state/time returned by the response. Avoid a separate operations mutation API.
- Public-source implementation belongs to the separate source task and its verified catalog in `docs/FREE-DATA-SOURCES.md`: Census on-demand lookup with bounded audited budget; FEMA terms held; Riverside permits endpoint unavailable. No new source-worker schema migration.
- Create `tests/operations.test.ts` and `scripts/test-operations-browser.mjs`; extend `package.json` test scripts and the existing fictional browser harness.
- Update `docs/GETTING_STARTED.md`, `docs/SPEC-CHANGES.md`, `README.md` and release verification evidence only after implementation is verified.

## Task 1: Profit scenarios without changing the offer ledger

**Interfaces** (`src/operations/index.ts`):

```ts
type ScenarioName = 'base' | 'downside' | 'upside';
type ProfitInputs = {
  arv: number | null;
  repairs: number | null;
  rehabContingencyPercent: number | null;
  buyerClosingHoldingCosts: number | null;
  buyerProfitPercent: number | null;
  sellerPrice: number | null;
  buyerPrice: number | null;
  targetAssignmentFee: number | null;
  operatorClosingCosts: number | null;
  marketingBudget: number | null;
  otherDealCosts: number | null;
};
type ProfitScenario = {
  id: string; leadId: string; name: ScenarioName; inputs: ProfitInputs;
  assumptions: string; recordedAt: string; actorId: string;
};
type ProfitResult = {
  rehabContingency: number | null;
  buyerCeiling: number | null;
  maximumSellerOffer: number | null;
  assignmentSpread: number | null;
  projectedNet: number | null;
  buyerHeadroom: number | null;
  missing: (keyof ProfitInputs)[];
  warnings: string[];
};
function calculateProfitScenario(input: ProfitInputs): ProfitResult;
```

Formula dependencies are explicit:

- `rehabContingency = repairs * rehabContingencyPercent`.
- `buyerCeiling = arv * (1 - buyerProfitPercent) - repairs - rehabContingency - buyerClosingHoldingCosts`.
- `maximumSellerOffer = buyerCeiling - targetAssignmentFee`.
- `assignmentSpread = buyerPrice - sellerPrice`.
- `projectedNet = assignmentSpread - operatorClosingCosts - marketingBudget - otherDealCosts`.
- `buyerHeadroom = buyerCeiling - buyerPrice`.

An output is null if any of its own dependencies are unknown. A known spread can remain visible when ARV is unknown, but unknown ARV still appears in the missing-input list. No modeled value is labeled collected income, an appraisal, or a guaranteed attainable price. Display “Projected deal net before tax and unallocated business overhead.” Do not add actual expense records to scenario costs; actual-versus-planned belongs in readiness and is labeled separately.

Add command:

```ts
{ type: 'save_profit_scenario'; leadId: string; name: ScenarioName;
  inputs: ProfitInputs; assumptions: string }
```

Upsert one scenario per `(leadId,name)`, maximum three per lead and 15,000 total. IDs/time/actor are server-generated. The current underwriting values can populate an unsaved form, and an active actual contract can populate seller price, but all copied assumptions are visible and editable. Scenario saves never modify `lead.underwriting`, approved packets, actual offers or contract price. Keep existing comp-based underwriting as the prerequisite for recording actual offers; provide an explicit button to open that form.

Validate percentages `0..1`, nonnegative known inputs, bounded dollar amounts consistent with the existing amount schema, assumptions `1..2000` characters, existing lead. Saving a scenario on a historical lead is allowed as planning; current status warnings remain visible.

- [ ] Add tests for the example: ARV500000, repairs50000, contingency0.15, buyer costs25000, margin0.20, seller300000, buyer315000, target fee15000, operator costs1500, marketing500, other1000 -> buyer ceiling317500, seller MAO302500, spread15000, net12000, headroom2500.
- [ ] Test independent null propagation, explicit zero, negative spread/net/ceiling, cent rounding, input nonmutation, nonfinite/out-of-range rejection and base/downside/upside persistence.
- [ ] Implement pure projection, strict command, backward-compatible optional-array normalization, and the focused scenario panel with side-by-side saved comparisons.
- [ ] Verify a save/reload preserves inputs and does not alter offers, assignment fees, pilot launch or approval snapshots. Existing state documents without either new array load as empty collections without loss.

## Task 2: Buyer activity and next actions

Use existing receipts for delivery, interest, decline and opt-out. Do not duplicate those outcomes in a second ledger. Add a bounded append-only planning/conversation/offer event collection:

```ts
type BuyerActivityKind = 'follow_up_planned' | 'conversation' |
  'offer_received' | 'offer_withdrawn';
type BuyerActivity = {
  id: string; contractId: string; buyerId: string; kind: BuyerActivityKind;
  occurredAt: string | null; dueAt: string | null;
  amount: number | null; reference: string; notes: string;
  completesTaskId: string | null; withdrawsOfferId: string | null;
  idempotencyKey: string; synthetic: boolean; recordedAt: string; actorId: string;
};
type BuyerPipelineRow = {
  contractId: string; buyerId: string; buyerName: string;
  stage: 'prepared' | 'delivered' | 'interested' | 'offered' |
    'declined' | 'suppressed' | 'assigned' | 'closed' | 'contract_ended';
  lastActivityAt: string | null; nextDueAt: string | null;
  latestOffer: {activityId: string; amount: number; occurredAt: string} | null;
  plannedTaskId: string | null; blockers: string[];
};
function buildBuyerPipeline(state: AcquisitionState, now: string,
  synthetic?: boolean, sourceHolds?: Record<string, string>): BuyerPipelineRow[];
```

`record_buyer_activity` accepts `Omit<BuyerActivity,'id'|'synthetic'|'recordedAt'|'actorId'>`; schema is a strict discriminated union by kind:

- `follow_up_planned`: `dueAt` required, actual `occurredAt` null, no amount/withdrawal/completion. The plan may cite an existing packet or conversation in `reference`; real plans require current general gates and applicable NOD specialist evidence. Existing plans show current blockers after evidence is revoked or expires. A plan is never an outbound batch approval. A new plan supersedes the prior open plan for the same contract/buyer; history remains.
- `conversation`: actual nonfuture time/reference required, amount/withdrawal null. May explicitly complete that relationship's currently open task.
- `offer_received`: actual nonfuture time/reference and positive amount required. Label amount “Buyer's total purchase price including assignment”; this is distinct from the assignment fee. A newer offer supersedes the previous active one. May explicitly complete the current task.
- `offer_withdrawn`: actual nonfuture time/reference plus matching `withdrawsOfferId` required. Only withdraw the current offer; no new amount. Does not terminate a contract or revoke an executed assignment.

Require existing same-workspace contract and buyer, matching real/practice class, a buyer present in a reviewed packet for that contract or an existing assignment (the operator can prepare a packet for an unsolicited permitted buyer first). No requirement to manufacture a delivery receipt before recording an actual inbound reply. Activity timestamps cannot precede the contract. Historical actual replies can be logged after a contract ends, but a new planned follow-up on a cancelled/closed/expired contract or suppressed/inactive buyer fails. A generic conversation/offer does not restore withdrawn permission. Existing opt-out workflow remains prominent and disables follow-up immediately.

Idempotency applies across this collection: same key/same event returns existing state; same key/different content rejects. Maximum 20,000 activity events under the current 32MiB document ceiling. The parent CAS and membership checks govern every save. Do not add automatic matching recomputation for task-only changes; buyer profile/contract changes already trigger it.

- [ ] Test planned task versus actual event separation; no change to launch/delivery/fee metrics; duplicate idempotency; cross-relationship completion/withdrawal rejection; future actual event rejection; synthetic separation; same-time stable ordering.
- [ ] Test completed/replaced plans disappear from due work, latest offer withdrawal does not resurrect an older offer, inactive/opted-out buyers remain suppressed, and cancelled/closed contracts never recommend contact.
- [ ] Implement the command and pipeline projection. Stage precedence is terminal contract/close, assignment, suppression/decline, active offer, interest, delivery, prepared; an explicit later permitted interest receipt may supersede decline, never suppression.
- [ ] Add a Contracts & buyers table with current offer, last actual event, next due action, blocker, and forms for the four event types. Retain existing manual receipt, opt-out, assignment and closing forms.
- [ ] Verify reload persistence and two-tab CAS conflict behavior with fictional records only.

## Task 3: Ordered daily work queue

**Interface:**

```ts
type QueueTarget = { tab: 'leads' | 'batches' | 'deals' | 'readiness';
  leadId?: string; contractId?: string; buyerId?: string };
type DailyWorkItem = {
  id: string; priority: number; title: string; reason: string;
  dueAt: string | null; state: 'ready' | 'blocked' | 'upcoming';
  blockers: string[]; target: QueueTarget;
};
function buildDailyQueue(state: AcquisitionState, summary: Summary, now: string,
  synthetic?: boolean, sourceHolds?: Record<string, string>): DailyWorkItem[];
```

The queue is derived, never persisted or marked complete independently of the underlying record. Lower priority sorts first; then due time, stable entity ID. Default is real data; practice preview is explicitly selected and labeled. Show counts and the first 25 rows with accessible pagination/filtering, not an unbounded table.

| Priority | Condition and useful action | Resolution evidence |
|---|---|---|
| 0 | Active contract's closing date has elapsed: verify status/extension with title | Actual extension, termination or closing |
| 10 | Active contract closes within three Pacific calendar days: coordinate closing | Actual closing or evidenced contract change |
| 20 | Required manual buyer alerts due or late: review buyer fit/packet | Actual delivery receipts; never export count |
| 30 | Buyer follow-up due or active buyer offer still needs operator review | Recorded buyer activity/assignment; planning alone is not an accepted offer |
| 40 | Seller conversation/appointment exists and qualification is absent | Saved actual qualification |
| 50 | Qualified seller needs comp-based underwriting before an offer | Existing underwriting record |
| 60 | Existing seller cadence says due now | Actual touch receipt or a terminal/suppressed status |
| 70 | Untouched score8+ lead needs first reviewed manual batch | Actual touch receipt |
| 80 | Next missing/expired general gate | Real reviewer evidence via existing gate form |

Only recommend outreach preparation for active, nonsuppressed leads without active contracts. Use existing `eligibility` separately for mail/call, preserving its current-time and business-hour reasons; do not call a currently held record ready. If at least one channel is eligible, state ready and identify that route; if neither is, retain a blocked task showing the concrete prerequisite. Suppressed records have no contact task. Buyer fit shortages show “Find additional permitted buyers” rather than inventing ten qualified buyers. Contract close dates are date-only Pacific calendar dates; do not parse them as UTC midnight. Future seller/buyer follow-ups are upcoming, not overdue. Deduplicate seller preparation tasks by the earliest unfinished stage, while retaining distinct urgent contract and buyer tasks.

- [ ] Test deterministic ordering, genuine overdue versus future tasks, Pacific midnight/DST closing boundaries, suppressed/inactive relationships, ended contracts, zero-buyer shortages and no actual-touch creation from queue reads.
- [ ] Implement projections for the Operations Work queue tab. Clicking a task opens the exact existing seller/contract/gate context; no one-click sending, approval or business-outcome completion.
- [ ] Browser-test one blocked data item, one due seller follow-up and one contract/buyer deadline, including a workspace switch with an in-flight request.

## Task 4: Readiness and actual business results

**Interface:**

```ts
type ReadinessCheck = { id: string; label: string;
  status: 'ready' | 'blocked' | 'not_recorded'; detail: string;
  evidenceReference: string | null; target: QueueTarget | null };
type MarketReadiness = {
  asOf: string; launch: Summary;
  funnel: { realLeads: number; touchedLeads: number; conversationLeads: number;
    qualifiedLeads: number; offeredLeads: number; activeContracts: number;
    assignedContracts: number; closedContracts: number };
  actuals: { collectedFees: number; recordedSpend: number; netRecordedCash: number };
  openContractRisks: {contractId: string; reason: string}[];
  checklist: ReadinessCheck[];
};
function buildMarketReadiness(state: AcquisitionState, summary: Summary, now: string,
  sourceHolds?: Record<string, string>): MarketReadiness;
```

`launch` reuses `summarize` unchanged. The separate funnel is labeled **Current real workspace funnel**, with unique lead IDs for lead stages and unique contract IDs for contract stages, excluding practice/future events. It is an inventory, not a conversion-rate denominator. Do not subtract cancellations from the historical signed-contract target, but exclude them from active contracts and show their outcome clearly.

`actuals` is all-time as of `now`, explicitly labeled separately from the 90-day view: collected fees from actual real closings; spend from actual real receipts, closing expenses and expense entries exactly once; `netRecordedCash = collectedFees - recordedSpend`. Label this “Recorded net cash before tax; missing or duplicated expense entries affect the result.” Do not count contract price, a buyer offer, assignment price or deposit as assignment revenue. Actual costs do not have automatic completeness; missing invoices remain a human reconciliation step.

Checklist derives current gate status/date/expiry; one approved current mail/call template; real authorized leads; current contact evidence and eligible recipients; buyer profiles; actual packet/deal readiness; and the technical gate's recorded evidence reference. Clearly label technical gate data as **Recorded release evidence**, not a new live test. A task completion cannot approve a gate. Avoid inventing a “100% ready” score that combines software readiness with missing professional/source evidence. The UI should say **Private pilot** and show that customer onboarding is presently administrator-provisioned, billing is absent, and outreach is manual.

Source health remains on Sources/Jobs unless passed via a clearly scoped server projection; do not claim full job history from the existing recent-50-job snapshot. Additional infrastructure checklist items need independently verified evidence before they can become ready.

- [ ] Test no launch for plans/exports/practice, distinct leads despite repeated conversations, all-time versus launch-window separation, costs counted once, no deposit/offer revenue, terminated versus historical contracts, and expired gate display.
- [ ] Implement pure readiness projection and show on Operations Readiness with links to the existing gate forms. Show real zero activity plainly and leave ratios unknown when no denominator exists.
- [ ] Browser-test empty real workspace, populated fictional workflow, and that UI labels never imply a business milestone or release test passed merely because forms were saved.

## Task 5: Free public-data sourcing integration

Use `docs/FREE-DATA-SOURCES.md` for exact official endpoints, terms/source dates, permitted uses and recommended adapters. Implement only verified adapters; never generic user-supplied fetch URLs, arbitrary scraping, browser credential reuse or paywall bypass.

The verified implementation scope is an on-demand Census geocoder lookup for an existing authorized property. The server reserves a request in the workspace audit under CAS before the network call, with 20 lookups per rolling 24 hours and one per property per minute. It keeps provenance and never overwrites seller facts. The adapter has a constant allowlisted HTTPS host/path, parameter validation, request timeout and byte bound; redirects are rejected. FEMA disaster data remains held until current use terms can be reviewed, and Riverside permit collection remains disabled because official JSON endpoints returned 403. No new automated lead stream is claimed.

Keep contextual observations outside `Lead.signals` unless a verified exact-property record actually supports the rubric field. Census geocoding/location context does not add motivation points; FEMA county disaster history does not assert property damage or current flood zone; local parcel identity does not imply an owner is willing to sell. Do not apply area demographic data to individual seller/buyer scoring. A municipal enforcement record must retain its case status, observation date and exact parcel/address association before it can support `code_violations`; uncertain matches remain review-only. No source observation grants phone/email contact permission.

- [ ] Add fixture-based adapter tests for valid/missing/malformed responses, exact join versus uncertain match, historical observation dates, host/redirect rejection, timeout, response bounds, and contextual data never increasing the seller score.
- [ ] Add one bounded real official-endpoint smoke check per implemented adapter, retaining only safe public metadata as verification evidence; do not import live people into the pilot to test.
- [ ] Add source UI cards describing what each source supplies, what it cannot supply, access cost/limits, terms/source dates, refresh schedule, last result/hold and review path.
- [ ] Prove current source revocation/membership isolation/CAS/capacity/job-recovery tests remain passing after any source-schema migration. Never mark a source approved or enable a real automated source on behalf of a missing human rights attestation.

## Integration, verification and changes ledger

- [ ] Read current repository instructions before implementation; preserve parent-owned pending release work. Implement on the parent's new branch after the existing live sourcing release is finished.
- [ ] Run targeted new unit tests, then existing `npm run typecheck`, `npm test`, `npm run build` and browser tests once the integrated code is stable. Extend the database test with a legacy state roundtrip containing the new optional fields; operations should need no schema migration if the current generic state/CAS boundary remains unchanged.
- [ ] Independent review focuses on the five risks above and any new outbound/public-source boundary. Fix findings and rerun affected checks.
- [ ] Update the operator guide with one fictional walk-through: compare scenarios -> view due work -> record actual buyer conversation/offer -> schedule follow-up -> compare recorded results. Do not enter any real-world milestone during verification.
- [ ] Update the change list with five rows and reasons: public sources supplement manual PropStream exports; scenario estimates expose costs/uncertainty beyond MAO; ordered work makes deadlines actionable; buyer event history separates planning from outcomes; readiness distinguishes current funnel, actual cash and the launched pilot. Include verified API source cost assumptions and infrastructure cost limits.
- [ ] Deploy the reviewed exact commit through the existing authorized release path, verify protected live pages and isolated fictional workflow, and record release/test references. Keep all senders disabled; remove or archive only deliberately created temporary fixtures according to existing test-workspace practice.

## Delivery truth

The useful autonomous loop is authorized collection/refresh -> validation -> explained research decisions -> ranked preparation tasks -> profit/fit comparisons -> human execution -> actual evidence -> updated queue/KPIs. This release can reduce missed work and expose weak economics. It cannot promise a deal, profit, valid source rights, professional approval, buyer acceptance or completion of a human action.

## Implementation handoff (2026-10-29)

- Operations is a dedicated `/operations` page, with browser-safe `src/operations` projections. Shared existing eligibility rules were extracted unchanged into `src/acquisition/policy.ts` and re-exported by the server domain.
- The authenticated server supplies `sourceHolds` keyed by lead ID. Queue preparation and readiness counts respect current source restrictions; actual event history remains visible.
- Optional `profitScenarios` and `buyerActivities` persist through the existing JSON/CAS boundary without a schema migration. New commands validate plans separately from actual buyer events.
- Domain verification: the new `tests/operations.test.ts` plus existing Acquisition tests passed before final integration. Parent release checks, database/browser suites and production verification remain separate.
