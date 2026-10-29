# Kahla Labs wholesaling launch plan

Research and decisions: October 29, 2026. Scope: operate Sangam as Kahla Labs LLC's own Inland Empire wholesaling desk. Customer subscriptions and selling vendor data are separate projects. Mail, calls, buyer delivery, offers, signatures and closing remain human actions.

## Decision

**Operator decision: use PropStream exports for now.** Use the existing authorized export route for the first real batch. PropertyRadar Solo remains a researched future option; its subscription and activation are deferred. Develop San Bernardino's free county tax-default CSV as a supplementary research source, with a verified owner/parcel join before it can become a seller candidate. Do not delay the first operating batch while building a general web scraper.

The operator explicitly selected PropStream exports after reviewing the $119/month PropertyRadar option, then clarified that a PropStream account still needs to be created. The seven-day trial sign-up is prepared but has not been submitted by the builder. Password creation, terms acceptance and any later paid enrollment remain operator steps. The research is **not** an accepted provider agreement, professional attestation, real import or authorization of a specific outreach batch.

PropStream's current [trial FAQ](https://www.propstream.com/faq) advertises 50 property imports/exports during the seven-day trial. Use 10–25 reviewed records for the initial trial exercise, within the actual account allowance. The 100–250-record batch below is conditional on sufficient verified entitlement after activation; do not assume a free trial can export it or silently purchase an upgrade.

## What is already live, and what is not

[Sangam](https://sangam.kahlalabs.com/operations) supports reviewed imports, explained seller scoring, buyer decision trees, manual batch preparation, follow-up tasks, profit scenarios and transaction records. Source refreshes reassess already uploaded facts. They do not collect new PropStream records. The Census lookup enriches a supplied address and does not discover sellers.

The last verified real workspace had no seller import, touches, offers, contracts or fees; its 90-day clock had not started. Fictional tests do not change that status. Production release evidence is separate from the local connector preparation described below.

## Source comparison and selection

| Source | Verified access and cost | Decision for this operation |
|---|---|---|
| PropStream | Essentials advertises $99/month and CSV export; native list monitoring is not an established external Sangam API. [Pricing](https://www.propstream.com/pricing), [FAQ](https://www.propstream.com/faq) | First batch from an authorized export. Retain the actual export/use entitlement; do not automate its signed-in pages. |
| PropertyRadar | Solo advertises $119/month, 10,000 monthly exports and API access; $99/month is the annually prepaid equivalent. Current API help excludes trial access. [Pricing](https://www.propertyradar.com/pricing), [API access](https://help.propertyradar.com/en/articles/15604571-using-the-propertyradar-api) | Best researched next collection source. Verify an actual sample and account terms before recurring retrieval. Use the internal end-user API, not a shared resale dataset. |
| San Bernardino county | Free current tax-default CSV; newer defaults refresh Sundays. The October 25 export was accessible, while the documented JSON data endpoint failed. It lacks owner/address data. [Dataset](https://opendata.sbcountyatc.gov/dataset/d9541b0c4b2711f0a6031973736cf94a), [county instructions](https://assets.ctfassets.net/wrl7z79vuuk1/5LX051SeCdNFTgP9nQXW7U/5ebf0d706aa5502a964ed4974bff190c/Instructions_for_SBC_Default_Lists.pdf) | First free supplement: reviewed uploaded file, research only. Establish reuse/automation scope and exact parcel-to-owner join before scheduled collection or promotion. |
| Riverside county | Current catalog/form lists $66 per standard file; unpaid-tax and current-roll files imply $132 per delivery, subject to the actual order. [Catalog](https://www.rivcoacr.org/bulk-data-sales), [current order form](https://www.rivcoacr.org/media/PropertyDataCenter/PropertyDataCenter_BulkDataOrderForm.pdf) | Alternative if direct county delivery proves more useful. One-time sample/order first; no recurring order placed. |
| RentCast | Developer API advertises 50 free monthly requests, then $0.20/request. It is property/valuation/listing enrichment, not a verified replacement for tax/foreclosure discovery. [API plans](https://www.rentcast.io/api), [property records](https://developers.rentcast.io/reference/property-records) | Defer until an actual underwriting data gap warrants it. Free quota does not mean unlimited collection. |
| ATTOM | Basic API starts at $500/month; advanced coverage depends on package. [API pricing](https://www.attomdata.com/solutions/delivery/property-data-api/pricing/) | Defer; disproportionate to the initial operating budget. |

### Conflicts and limitations that affect the choice

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
| 2. Source and existing approvals | Operator, builder assists entry | Supply an authorized export, real export date, source/account/use reference, and references for already-completed counsel/channel/title reviews. | Authentic records saved in Readiness; no invented review dates or approvals. |
| 3. First intake | Builder + operator | On the trial, start with 10–25 farm records within its allowance. Scale to 100–250 only when account entitlement permits. Check field mapping, leading zeros, duplicates, unknowns and source freshness. | Accepted/rejected counts, reviewed examples and held reasons; no automatic promotion or contact. |
| 4. Buyer demand | Operator | Research 10–20 genuine cash buyers using existing cash-purchase data and direct relationships; confirm buy boxes and permitted contact route. | Current buyer profiles, actual acquisition evidence where available, explicit price/rehab limits. No additional buyer subscription required by this plan. |
| 5. First outreach | Operator | Prepare 25–50 eligible mail recipients and a small manual call sheet. Review print proof/script and exact cost; place the order/dial manually. | Actual order/call receipts, costs and responses. Downloading is not sending. This is a workflow-quality test, not a statistically reliable A/B test. |
| 6. Daily operation | Operator | Work seller responses, follow-ups and contract deadlines; qualify; underwrite supported opportunities; make and record actual offers. | Conversations, appointments, delivered offers and signed contracts, with dates/references. |
| 7. First assignment | Operator + attorney/title/escrow as applicable | Match the signed contract, review buyer packet, deliver manually, negotiate, execute assignment and close. | Real packet delivery, assignment/closing references, collected fee and all costs. |
| 8. Fresh collection — deferred | Builder + operator | Continue scheduled processing of new manually uploaded PropStream exports. Revisit a licensed API only on a later operator decision; county automation needs its use-scope and owner-join work first. | No current claim of fresh automatic collection. Future activation needs account access, actual schema, source terms, cost controls and a tested cancellation path. |

### Exact input packet

- **Seller file:** authorized UTF-8 CSV plus its unmodified private original. Required mapping and optional fields are in [Getting started](GETTING_STARTED.md). Never put seller files in this public Git repository or in a public Notion page.
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

The operator deferred PropertyRadar, so its $119/month is **not** an adopted expense. For a future comparison, alongside a $99 PropStream plan the two base subscriptions would total $218/month before tax/overages. Do not select annual prepayment merely to advertise a lower monthly equivalent. Source API previews are not reservations of free credits, so a later purchase needs a supported spending policy.

Mail format/postage, contact append, phone service, hosting/auth/database, escrow/contract costs, tax and the operator's time remain real costs. A $15,000 target assignment fee is an assumption about gross revenue, not a forecast of net income or a guaranteed runway. Record actual net cash after all attributable expenses.

Stop new collection on expired/revoked source permission, repeated schema errors, missing observation dates or exhausted limits. Stop new outreach on suppression/evidence failures. Investigate healthy conversations but no accepted offers as a pricing/fit issue; do not automatically increase volume. Escalate deadline/title issues on signed contracts immediately.

## Recovery and regulatory evidence

Browser inspection on October 29 confirmed the dedicated Sangam Supabase organization is on **Free**, whose Backups screen says project backups are not included. The independent recovery tooling/runbook is intended to close that gap using an actual protected logical backup and isolated restore. A paid plan is optional, not purchased here. Supabase documents daily backups on paid plans and recommends private exports/off-site backups for Free. [Backup documentation](https://supabase.com/docs/guides/platform/backups), [recovery runbook](RECOVERY-RUNBOOK.md).

The official AB 1850 status page was read in Browser after the text fetch failed. On October 29 it displayed its latest action as **May 14, 2026: held under submission**, and a committee-process status. This report does not adopt the original assertion that it definitively died or predict reintroduction. Bill status does not determine whether a particular transaction is lawful. Keep the already-obtained professional review and its scope as the operating evidence. [Official status](https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB1850).

## Work prepared in this research cycle

- Cited source comparison, first-batch plan, owner/builder responsibilities and budget/volume corrections.
- Offline San Bernardino tax-bill research preparation: no network collection, seller creation or tax-score inference. See [county import](COUNTY-RESEARCH-IMPORT.md).
- PropertyRadar count/cost preview preparation with purchase fixed off: no property acquisition, contacts or scheduled feed. See [connector boundary](PROPERTYRADAR-CONNECTOR.md).
- Isolated backup verification tooling and a production recovery runbook; real production backup evidence remains required.

These supporting tools are local preparation until reviewed, tested and released. They do not change the live app's provider/outreach settings. The [changes ledger](SPEC-CHANGES.md) distinguishes these decisions from earlier implemented behavior. No services were purchased, people contacted, professional gates approved or real milestones recorded.
