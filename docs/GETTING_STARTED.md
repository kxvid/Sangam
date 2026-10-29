# Use Sangam Acquisition

Open **Acquisition** and choose your workspace. For the first real pilot this is Kahla Labs LLC. Everything stays manual: Sangam prepares files and keeps records; you place mail orders, dial calls and deliver buyer packets yourself.

## Practice before using real records

Use a separate test workspace and the **Practice data** checkbox when importing wholly fictional records. Practice exports are marked **SYNTHETIC EXERCISE — DO NOT CONTACT**, and practice activity never starts the real pilot clock or contributes to its targets. Do not label real sellers as practice to bypass evidence checks. Practice contacts must use reserved 555-0100–0199 phone numbers, reserved example/test email domains, and visibly fictional names/addresses. Exported practice destinations are deliberately unusable. The repository browser test runs an entire fictional workflow in memory without touching your hosted workspace.

The operator sequence is: Import → Seller leads → Mail & calls → record actual activity → qualify and underwrite → record offer and signed contract → Contracts & buyers → reviewed packet → actual delivery → signed assignment → closing. An export or a button click is never proof that a contract was signed, a person contacted or money received.

## Prepare the PropStream export

In your authorized PropStream account, use the Riverside/San Bernardino farm lists from the original SOP. Retain each relevant distress signal, including notice of default; do not remove a flag to make a lead eligible. The starter ZIPs are:

`92501, 92503, 92505, 92507, 92401, 92404, 92408, 92410, 92551, 92553, 92555, 92335, 92336, 91761, 91762, 92376, 92324`

Download the seller data using your account's available export option. Export screens/field names can vary by vendor plan; this guide specifies Sangam's required mapping, not a claim of access to your PropStream account. Use **Import → CSV template**, rename/map source columns to those headers, and save as UTF-8 CSV. Keep the raw export privately for source verification.

| Sangam column | What to put in it |
|---|---|
| `county` | Riverside or San Bernardino; required. |
| `apn` | Parcel number as text, preserving leading zeros; required. |
| `address` | Property street address; required. |
| `owner_name` | Current owner name/entity from the source; required. |
| `city`, `zip` | Property city and five-digit ZIP. ZIP is needed for farm eligibility. |
| `mailing_address` | Owner mailing destination as `street, city ST ZIP`; quote CSV fields containing commas. Do not substitute the subject address unless it is the verified owner mailing address. |
| `phone` | One selected US phone number, with its source retained. Do not combine numbers in one cell. |
| `email` | Optional valid email; the app does not send it. |
| `property_type` | A consistent value such as SFR, CONDO or 2–4 UNIT, matching buyer profiles. |
| `estimated_value`, `equity_pct` | Known source values; equity is 0–100, not a decimal fraction. |
| `tax_delinquent_years`, `years_owned` | Known nonnegative numbers, otherwise blank. Do not convert a generic delinquent flag to '2 years'. |
| `nod`, `vacant`, `absentee`, `inherited`, `code_violations` | `true/false`, `yes/no` or `1/0`; leave unknown facts blank. |
| `notes` | Useful source notes; no passwords/API keys. |

Optional supported columns: `beds`, `baths`, `sqft`, `year_built`, `last_sale_date`, `last_sale_price`. These are retained as source notes in this pilot. The importer deliberately rejects unsupported headers, duplicate county/APN rows, malformed values and embedded permission fields. Remove or map extra vendor columns; do not discard the original source file.

Limits: 1.8 MB per CSV and 5,000 leads per workspace. Split larger exports. The enclosing request also has a 2 MB limit, so heavily quoted files may require smaller parts. Start with 10–25 reviewed records before a larger batch.

## Evidence needed before real import

A reviewer/admin opens **Readiness → Data source permission** and records the genuine evidence: authorized account/entity, source, allowed use, document/reference, actual review date and any expiration. This is the `data_provenance` gate. A generic 'we are good to go' is not a file-specific source-rights record.

Then, in **Import**, supply the CSV, source name, actual source/export date and permission reference. Preview it, review scores/warnings/unknown fields, then choose **Import reviewed rows**. The import is tied to the exact previewed file and source details. An owner/phone/address change clears old contact evidence. Records are deduplicated within the workspace by county and APN.

Scoring stays at the original weights and threshold of 8. A high score alone does not mean a record is eligible to contact.

## Evidence needed before the first mail or calling batch

Readiness shows the next blocked gate. A reviewer/admin records authentic references for counsel-reviewed documents, the mail/manual-call policy, data provenance, suppression procedures, title/escrow readiness, this deployed release's verification, and operator launch authorization. A notice-of-default lead also needs the specialist `nod_counsel` gate. Record actual review dates; do not invent names, documents or approvals. A blocked, changed or expired gate can invalidate previously reviewed material.

For each selected seller in **Seller leads**, open the detail and record:

- The selected phone number, matching the imported owner contact.
- DNC status and litigator status from the actual scrub result, with its date and retrievable evidence reference. Both must be clear and no more than 30 days old for release.
- For calling, `America/Los_Angeles` recipient timezone and evidence supporting it. The property ZIP or phone area code alone is not evidence of where the recipient lives.
- A complete owner mailing address for mail.

The retained pilot policy requires phone-keyed scrub evidence even for mail. A reviewer would need to approve and implement a distinct policy before changing that rule. Suppression applies across channels and remains permanent. Use the suppression form promptly when someone asks not to be contacted.

## Prepare and use a manual batch

1. In **Mail & calls → Templates**, enter the exact copy or call script approved for this activity, including the reviewed assignment disclosure. Supported placeholders are `{{owner_name}}`, `{{address}}` and `{{zip}}`. Save a draft, then have a reviewer approve that revision with an evidence reference. Saving copy does not approve it.
2. In **Seller leads**, select the intended recipients. Return to **Mail & calls**, choose the reviewed template and create a draft, up to 500 recipients.
3. Open the draft, inspect every destination and rendered message, and approve the exact batch. Approval lasts 24 hours. Changing source/contact information, gates or template approval requires a fresh reviewed batch.
4. Download the mail CSV or call sheet. The download rechecks current eligibility, suppression and approval. Calling release/use is limited to 9am–7pm Pacific, Monday–Saturday, with one attempt per contact per day. A call sheet can be drafted outside those hours.
5. For mail, manually map the exported recipient/address/copy fields into the mail vendor's order tool. Verify the final print proof and count before purchasing. Sangam does not place or pay for the order. For calls, manually dial the approved number and use the reviewed script. Neither channel is connected to a sender.
6. Record the actual recipient outcome, actual event time, external receipt/log reference and actual cost. A download is not a touch. If nothing happened, record nothing. Duplicate receipts are rejected or handled idempotently.

Approval expiry cannot physically recall a downloaded file. Operators must honor its use-before time, check new suppressions, and obtain a fresh export when anything changes. File preparation does not guarantee a vendor will mail within 24 hours; approve at handoff time and use the actual accepted-mailing/order evidence appropriate to the reviewed operating policy.

## Qualify, offer and contract

Use the seller detail to record actual responses, property condition, timeline, price expectation and mortgage balance. Responses are separate from outbound touches: a mailed letter's reply can count as a conversation without pretending another call occurred.

Enter your ARV, repairs, closing costs, target assignment fee, required margin and at least three distinct sold comparable references. The app calculates MAO from those inputs; it does not obtain or verify comparable sales or appraise the property. Review the inputs before making a human offer.

Record only an offer actually delivered, with its date/reference. After a real purchase agreement is signed, record its price, signed date, closing date, assignability and contract/disclosure references. The contract target is a real signed purchase contract, not a draft. Use evidenced extensions/termination records when the contract changes; revised terms require fresh packet review.

## Match and assign the contract

In **Contracts & buyers**, add buyers whose source and contact permission you can document. Record target ZIPs, price range, property types, rehab limit and known activity facts. Unknown activity stays unknown. The matcher considers fit separately from seller motivation and returns up to ten permitted candidates.

Choose the buyers and enter the exact reviewed assignment message. Identify the contractual/equitable interest and intended assignment. Review and approve the packet, then download it. Deliver it manually through the permitted route and record the actual delivery/reference; a download does not satisfy the 24-hour buyer-alert task. Record inbound buyer replies and opt-outs even when they arrive after the packet's release period.

After humans execute the assignment, record its signed agreement, actual amount, required disclosure references and any deposit actually received with its evidence. After escrow closes, record the real closing reference, assignment fee and expenses. The app does not sign, hold deposits or collect money.

## Daily review and recovery

**Today** shows readiness, actual pilot progress, follow-ups and buyer alerts. Real launch begins with the earliest actual real outreach receipt. The 90-day targets remain 2,000 unique leads touched, 20 offers and one signed purchase contract. Practice records are excluded. At 500 mail pieces/month, mail alone supplies at most 1,500 pieces in 90 days before repeats; plan the remaining unique manual contacts explicitly.

Use **Record an expense** for actual vendor/setup costs with their dates and receipts. Do not enter a cost again if it is already included in a touch receipt or closing record. Cost-per-conversation, offer and contract use these recorded costs; absent activity shows no ratio, not zero. **Rescore existing leads** recalculates stored facts without fetching vendor data.

If a form says the workspace changed, refresh and review before retrying. If a save or connection is unconfirmed, refresh and inspect the record first. Never retry a physical mail order or contact because a screen was slow. Use the recorded external receipt to reconcile.

See [the changes ledger](SPEC-CHANGES.md) for deviations from the original spec and [deployment/recovery](DEPLOY.md) for administrator steps. No part of this guide supplies professional approval or an authorization to contact a specific person.
