# Kahla Labs wholesaling launch plan

Research and decisions: October 29, 2026. Scope: operate Sangam as Kahla Labs LLC's own Inland Empire wholesaling desk. Customer subscriptions and selling vendor data are separate projects. Mail, calls, buyer delivery, offers, signatures and closing remain human actions.

## Decision

**Current decision: no data subscription.** The operator rejected PropStream's expense after deferring PropertyRadar. Use PropWire Basic's intended native download route for the first small sample, with county tax records as separately dated research evidence. The earlier PropStream trial signup was left unfinished. No paid source, add-on or wallet funding is authorized by this plan.

PropWire advertises free property downloads without a credit card and ten free skip traces per month on Basic. Browser inspection confirmed Riverside County search works before login, owner filters include absentee status and years owned, and the free registration screen explicitly offers property downloads. After the operator approved registration and completed password creation, Browser verified Basic Active, no saved payment methods, a $0 wallet and 10 of 10 included monthly traces remaining. The native workflow generated a 23-property CSV in 92503 with no paid purchase. After browser download permission was declined, the operator downloaded it manually. Private validation confirmed **23 rows, 74 columns**, owner/mailing fields on all rows and no duplicate county/APN pairs. The overall monthly download allowance remains unknown. The **23 actual candidates** replace the planned 25–50 sample; do not broaden the farm merely to hit a round count or treat them as ready mail recipients. [Official free-plan description](https://propwire.com/investors), [verified header mapping and first-batch guide](FREE-LEAD-FIRST-BATCH.md).

Sangam's existing importer accepts a source name and mapped CSV from other providers; a new paid integration was unnecessary for this file. The exact mapped export and genuine source review were used for the completed first import. Native exports remain manual acquisition; scheduled scoring and matching process uploaded facts. Source review is distinct from professional attestation and authorization of a specific outreach batch.

PropStream's legitimate free option is a one-time seven-day trial with 50 property imports/exports; it is not an ongoing free feed. That optional trial is deferred. No attempt is made to bypass subscriptions, account restrictions or export limits. [PropStream FAQ](https://www.propstream.com/faq).

## What is already live, and what is not

[Sangam](https://sangam.kahlalabs.com/operations) supports reviewed imports, explained seller scoring, buyer decision trees, manual batch preparation, follow-up tasks, profit scenarios and transaction records. Source refreshes reassess already uploaded facts. They do not collect new PropStream records. The Census lookup enriches a supplied address and does not discover sellers.

On October 29, the live preview reported **23 new records, 0 updates and 0 scoring 8+**. The real-data import completed and a refresh verified **23 persisted seller research records**. Today showed **0 mail-ready and 0 call-ready**. Every record scores 7 from vacancy, estimated equity and completed ownership duration. `Owner Occupied` is blank in every native row, so absentee remains unknown despite the search filter. No phones or emails were supplied. Eight rows have co-owners, all preserved; four have bank-related owner-type tags requiring review. Underlying record observation/update dates and current listing status remain unverified.

Only the factual `data_provenance` review was recorded, with Codex explicitly identified as reviewer acting under operator instructions and the source/terms/use limitations preserved. No other readiness gate was approved; **counsel evidence is the next blocked gate**. There are **0 touches, 0 offers and 0 contracts**, no collected fees, and the 90-day clock has not started. Fictional tests, import counts and software preparation do not change those business metrics. Production release evidence is separate from the local connector preparation described below.

## Source comparison and selection

| Source | Verified access and cost | Decision for this operation |
|---|---|---|
| PropWire Basic | Free native property downloads and ten included monthly skip traces advertised; Basic account and 10/10 included traces verified. Actual 23-row/74-column export mapped and imported; all score 7, no phones/emails, absentee unknown. Overall download cap and underlying record freshness remain unverified. [Free plan](https://propwire.com/investors), [terms dated October 28](https://propwire.com/terms-of-use) | First sample completed without payment. Research the missing facts before contact; keep using intended native exports and verify remaining credits. No scraped or resale feed. |
| PropStream | Essentials advertises $99/month and CSV export; native list monitoring is not an established external Sangam API. [Pricing](https://www.propstream.com/pricing), [FAQ](https://www.propstream.com/faq) | Deferred after the operator rejected the cost. The 50-record trial is optional, not the recurring source plan. |
| PropertyRadar | Solo advertises $119/month, 10,000 monthly exports and API access; $99/month is the annually prepaid equivalent. Current API help excludes trial access. [Pricing](https://www.propertyradar.com/pricing), [API access](https://help.propertyradar.com/en/articles/15604571-using-the-propertyradar-api) | Deferred paid API alternative; no account or subscription activated. |
| San Bernardino county | Free current tax-default CSV; newer defaults refresh Sundays. The October 25 export was accessible, while the documented JSON data endpoint failed. It lacks owner/address data. [Dataset](https://opendata.sbcountyatc.gov/dataset/d9541b0c4b2711f0a6031973736cf94a), [county instructions](https://assets.ctfassets.net/wrl7z79vuuk1/5LX051SeCdNFTgP9nQXW7U/5ebf0d706aa5502a964ed4974bff190c/Instructions_for_SBC_Default_Lists.pdf) | First free supplement: reviewed uploaded file, research only. Establish reuse/automation scope and exact parcel-to-owner join before scheduled collection or promotion. |
| Riverside free inventory | Official July 1, 2026 power-to-sell inventory is downloadable as XLSX/PDF; its October folder is not its observation date. It has parcel/location/tax facts but no owner mailing list. [Inventory](https://countytreasurer.org/inventory-all-tax-defaulted-property) | Free research supplement. Verify present tax/ownership status before operational use; do not mistake assessed values for equity. |
| Riverside paid bulk files | Current catalog/form lists $66 per standard file; unpaid-tax and current-roll files imply $132 per delivery, subject to the actual order. [Catalog](https://www.rivcoacr.org/bulk-data-sales), [current order form](https://www.rivcoacr.org/media/PropertyDataCenter/PropertyDataCenter_BulkDataOrderForm.pdf) | Deferred under the zero-subscription/data-spend direction; no order placed. |
| RentCast | Developer API advertises 50 free monthly requests, then $0.20/request. It is property/valuation/listing enrichment, not a verified replacement for tax/foreclosure discovery. [API plans](https://www.rentcast.io/api), [property records](https://developers.rentcast.io/reference/property-records) | Defer until an actual underwriting data gap warrants it. Free quota does not mean unlimited collection. |
| ATTOM | Basic API starts at $500/month; advanced coverage depends on package. [API pricing](https://www.attomdata.com/solutions/delivery/property-data-api/pricing/) | Defer; disproportionate to the initial operating budget. |

### Conflicts and limitations that affect the choice

- PropWire explicitly promotes CRM downloads, while its broader terms restrict independent data files, automated copying and redistribution. Keep this private operator workflow within its documented native export use; do not claim a public API or customer-data resale license. Retain the accepted terms and account entitlement. This does not create a special written-approval requirement for every ordinary internal import. [Download description](https://propwire.com/), [terms](https://propwire.com/terms-of-use).

- PropertyRadar's current plan-specific help supersedes old top-tier-only assumptions. Its API is intended for internal business integrations; a future application distributing provider data to customers requires the appropriate partner/license route. Record the actual account agreement without inventing a special approval requirement for ordinary documented internal use. [API introduction](https://developers.propertyradar.com/), [user agreement](https://www.propertyradar.com/user-agreement).
- PropStream markets exports to other tools, while its linked general terms contain broader use/copying restrictions. Preserve the account-specific export entitlement or genuine provider clarification; neither a marketing page nor this report is a source-license attestation. [Terms](https://resource.propstream.com/terms.jsp).
- San Bernardino's dataset says no license was provided. The open-data API page invites integration, while the main site's terms restrict automated navigation. That is an unresolved scope question, not proof that all reuse is prohibited. The county's answer should cover the linked CSV, recurring internal retrieval, retention and attribution. [API docs](https://opendata.sbcountyatc.gov/data-api), [terms](https://www.sbcountyatc.gov/terms-of-use).
- Riverside's distribution agreement addresses internal cross-referencing, redistribution and third-party access. Review the actual hosted processing and buyer-packet use before accepting it. [Agreement](https://www.rivcoacr.org/media/PropertyDataCenter/112_ACRDataDistributionAgreement.pdf).
- No complete, verified free current vacancy, code-violation, probate and owner-contact feed was established. Permit activity and county disaster declarations remain context, not evidence of an owner's willingness to sell.

## The opportunity decision tree

1. **May we use this record?** Current source permission, real observation date, correct workspace and no applicable suppression. Missing or stale facts stay in review.
2. **Does the property fit the farm?** Riverside/San Bernardino, the original 17 ZIPs and supported property type. Preserve county plus parcel identity and owner changes.
3. **Is there evidenced motivation to investigate?** Retain the original weights and threshold of 8 initially. Show each contributing fact and missing information. A generic tax flag is not evidence of two delinquent years; a tax bill is not a separate seller; an old NOD is not proof of an active foreclosure.
4. **Can the selected manual channel be used?** Actual current contact-screening evidence, reviewed script/piece, mailing destination or recipient timezone, suppression check and exact batch approval. The existing conservative phone-keyed mail policy remains unchanged; this document does not present that policy as a universal legal requirement.
5. **Is there an economic opportunity?** Human seller conversation establishes condition, timing and price. Obtain sold-comparable references, repair estimates and actual buyer economics. Record base and downside scenarios; do not turn an automated valuation into a verified appraisal.
6. **Which buyers fit an actual contract?** Current source/contact permission, ZIP/type, total acquisition price, explicit rehab limit and active assignable contract first; observed buying activity ranks the survivors. Missing buyer limits remain unknown.
7. **Can it close?** Humans verify title, disclosures, deadlines, funds/deposit and executed agreements. Record fees only after actual closing evidence.

Seller motivation, buyer fit and projected net profit are separate outputs. No income, demographic or protected-trait inference is needed. No decision tree makes an offer, guarantees a fee or establishes a person's consent.

## Execution plan and acceptance evidence

Timing below begins when the required inputs exist. Day 0 of the business pilot is the first actual recorded outreach receipt, not today's software or research work.

| Sequence | Owner | Work | Evidence of completion |
|---|---|---|---|
| 1. Recoverability | Builder + operator | Create a consistent private production backup, restore it in isolation and compare data/security configuration. Keep a separate protected copy. | Successful verification report tied to the actual backup and snapshot; documented recovery owner/location. Local fictional checks alone do not close this item. |
| 2. Source and existing approvals | Operator, builder assists entry | The first export's factual source review is recorded. Supply references for already-completed counsel/channel/title reviews; counsel is the next blocked gate. | Authentic records saved in Readiness with actual reviewer/date/scope. Source review does not close professional gates. |
| 3. First intake and fact review | Builder + operator | Completed: map, preview and import the actual 23-row PropWire Basic sample. Next verify current ownership/listing status, bank-related tags and missing occupancy/source dates. Scale only after data quality and entitlement are verified. | 23 new records persisted, 0 updates, all score 7, 0 mail/call-ready. Preserve all co-owners and unknowns; additional score points need genuine evidence. |
| 4. Buyer demand | Operator | Research 10–20 genuine cash buyers using existing cash-purchase data and direct relationships; confirm buy boxes and permitted contact route. | Current buyer profiles, actual acquisition evidence where available, explicit price/rehab limits. No additional buyer subscription required by this plan. |
| 5. First outreach | Operator | Prepare a small eligible mail batch and manual call sheet from the reviewed candidates; the eligible count may be lower or zero. Review print proof/script and exact cost; place the order/dial manually. | Actual order/call receipts, costs and responses. Downloading is not sending. This is a workflow-quality test, not a statistically reliable A/B test. |
| 6. Daily operation | Operator | Work seller responses, follow-ups and contract deadlines; qualify; underwrite supported opportunities; make and record actual offers. | Conversations, appointments, delivered offers and signed contracts, with dates/references. |
| 7. First assignment | Operator + attorney/title/escrow as applicable | Match the signed contract, review buyer packet, deliver manually, negotiate, execute assignment and close. | Real packet delivery, assignment/closing references, collected fee and all costs. |
| 8. Fresh collection — deferred | Builder + operator | Continue scheduled processing of new manually uploaded authorized exports. Revisit a licensed API only on a later operator decision; county automation needs its use-scope and owner-join work first. | No current claim of fresh automatic collection. Future activation needs account access, actual schema, source terms, cost controls and a tested cancellation path. |

### Exact input packet

- **Seller file:** the first authorized UTF-8 CSV and unmodified original are retained privately and its 23 records are imported. Repeat that process for later exports. The actual PropWire mapping is in [the first-batch guide](FREE-LEAD-FIRST-BATCH.md); supported targets are in [Getting started](GETTING_STARTED.md). Never put seller files in this public Git repository or in a public Notion page.
- **Source record:** provider/account entity, actual export date, permitted internal purpose, retrievable agreement/reference and expiration if applicable. A source review is different from the legal review of wholesaling contracts.
- **Existing clearance:** document/version, actual reviewer/date and scope for purchase/assignment/disclosure templates, manual channels and escrow/title readiness. The user's statement that clearance exists is retained; the builder cannot supply missing professional facts.
- **Contact evidence:** selected owner phone, actual DNC/litigator result/date/reference, verified mailing destination and recipient timezone evidence for calls. Preserve opt-outs immediately.
- **Buyer intake:** name/entity, source/contact permission/reference/date, target ZIPs, types, min/max total price, maximum rehab, recent purchase evidence and preferred permitted route. Add through Contracts & buyers; do not imply a buyer CSV importer exists.

## Daily and weekly operating rhythm

Daily: inspect source/job holds and new candidates; review today's eligible manual work; handle replies and due follow-ups; update underwriting and deadlines; reconcile actual receipts/costs. Prioritize signed-contract deadlines over collecting more names.

Weekly: review unique leads actually reached, contact/conversation/offer/contract conversion, rejected/unknown/stale source fractions, buyer response, mail returns and actual spend. Compare cohorts by source and signal; do not retune on list volume alone. A rule revision must preserve the underlying evidence and be previewed before publication.

The targets remain **2,000 unique leads touched, 20 delivered offers and one signed purchase contract within 90 days of actual launch**. Closed assignments and net cash are tracked separately. A signature alone is not a profit milestone or an automatic reason to double spending.

The original 500 mail pieces/month yields at most 1,500 pieces in 90 days before repeats. An illustrative workload is 300 new mail recipients plus 200 follow-up pieces monthly, and 20 new eligible manual contacts per weekday. Over roughly 65 weekdays that is up to 2,200 distinct people/properties only if overlap is controlled and the eligible inventory exists. Track actual uniqueness; this is a capacity plan, not a promised conversion rate. If the operator cannot sustain it, revise the target or resource plan explicitly.

## Budget and stop rules

Keep $600–750/month as the original operating planning range, not a verified quote. Replace estimates with current order/account prices before commitments. Do not buy Deal Run, Investor Outreach, ATTOM or a dialer by default; first use existing buyer data and manual channels.

The current data-subscription budget is **$0**: PropWire Basic plus free county research, with no paid skip traces or wallet funding. Postage, contact screening and other operating costs are separate and are not represented as free. PropStream and PropertyRadar are deferred, so their fees are **not** adopted expenses. For a future comparison, alongside a $99 PropStream plan the two base subscriptions would total $218/month before tax/overages. Do not select annual prepayment merely to advertise a lower monthly equivalent. Source API previews are not reservations of free credits, so a later purchase needs a supported spending policy.

Mail format/postage, contact append, phone service, hosting/auth/database, escrow/contract costs, tax and the operator's time remain real costs. A $15,000 target assignment fee is an assumption about gross revenue, not a forecast of net income or a guaranteed runway. Record actual net cash after all attributable expenses.

Stop new collection on expired/revoked source permission, repeated schema errors, missing observation dates or exhausted limits. Stop new outreach on suppression/evidence failures. Investigate healthy conversations but no accepted offers as a pricing/fit issue; do not automatically increase volume. Escalate deadline/title issues on signed contracts immediately.

## Recovery and regulatory evidence

Browser inspection on October 29 confirmed the dedicated Sangam Supabase organization is on **Free**, whose Backups screen says project backups are not included. The independent recovery tooling/runbook is intended to close that gap using an actual protected logical backup and isolated restore. A paid plan is optional, not purchased here. Supabase documents daily backups on paid plans and recommends private exports/off-site backups for Free. [Backup documentation](https://supabase.com/docs/guides/platform/backups), [recovery runbook](RECOVERY-RUNBOOK.md).

The official AB 1850 status page was read in Browser after the text fetch failed. On October 29 it displayed its latest action as **May 14, 2026: held under submission**, and a committee-process status. This report does not adopt the original assertion that it definitively died or predict reintroduction. Bill status does not determine whether a particular transaction is lawful. Keep the already-obtained professional review and its scope as the operating evidence. [Official status](https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB1850).

## Work prepared in this research cycle

- Cited source comparison and zero-subscription first-batch guide, owner/builder responsibilities and budget/volume corrections.
- Verified and mapped the operator-downloaded native PropWire export, recorded its factual source review and verified 23 persisted real research leads in live Acquisition. All remain below the score threshold and ineligible for contact.
- Offline San Bernardino tax-bill research preparation: no network collection, seller creation or tax-score inference. See [county import](COUNTY-RESEARCH-IMPORT.md).
- PropertyRadar count/cost preview preparation with purchase fixed off: no property acquisition, contacts or scheduled feed. See [connector boundary](PROPERTYRADAR-CONNECTOR.md).
- Isolated backup verification tooling and a production recovery runbook; real production backup evidence remains required.

The county, preview and recovery supporting tools are local preparation until reviewed, tested and released. The completed seller import used the existing live app and did not change provider/outreach settings. The [changes ledger](SPEC-CHANGES.md) distinguishes these decisions from earlier implemented behavior. No services were purchased, people contacted, professional gates approved or business milestones recorded.


## Later operating update — October 29, 2026

Following the initial import above, eight records received matching per-property absentee/vacant/off-market evidence and were saved in live Sangam at **score 9**; the other 15 remain at score 7. The rubric and threshold are unchanged. Current title, authority, source freshness and contact identity remain separate checks.

After required phone verification and the operator's explicit trace-terms approval, **eight free traces completed for $0**, leaving **two included credits**. They returned **22 distinct phone candidates**, five explicitly vendor-DNC-marked. One lead has only DNC-marked candidates and no selected calling number; seven unflagged first candidates are held for screening. Unflagged means unknown, not clear. Litigator screening and recipient timezone evidence are missing. Emails remain private and unused.

The private first-batch packet and unapproved mail/call drafts are prepared, **not released**. Counsel and the remaining operational evidence, genuine contact screening, business reply details and exact template/batch reviews still block outreach. No professional gate, touch, offer, contract, fee or actual launch was created. Data-service spend remains $0; postage, screening and operating costs remain outside that claim. See the [updated first-batch guide](FREE-LEAD-FIRST-BATCH.md#later-verification-and-free-traces--october-29-2026) and [change ledger](SPEC-CHANGES.md#first-verified-candidates-and-free-contact-enrichment--october-29-2026).
