# First lead batch without a data subscription

Checked October 29, 2026. Kahla Labs LLC is operating as the wholesaler. Mail, calling, offers, buyer delivery and contracts remain manual. A free source reduces the data bill; it does not prove seller motivation, contact permission or profit.

## Selected route

Use **PropWire Basic's native property download**, then supplement selected properties with official county tax records. Its [investor page](https://propwire.com/investors) advertises free downloads without a credit card and ten included skip traces monthly. Confirm the actual account allowance and remaining credits before each action. Do not select a paid membership, fund a wallet or buy additional traces under this plan.

The operator approved free registration and personally completed password creation. Browser verified Basic Active, a $0 wallet, no saved payment methods and 10 of 10 included traces remaining. No trace was run. Browser verified Riverside County search before login, absentee/years-owned filters and a tax-delinquent-year filter. No public PropWire API was established. Native download is the collection method; Sangam automates processing after upload.

PropStream's legitimate free option is its one-time seven-day trial with 50 property imports/exports, not an ongoing free source. Its prepared signup was left unfinished after the operator rejected the expense. [Official FAQ](https://www.propstream.com/faq).

## First export result

The first native search in **92503** returned **23 candidates** with filters set to single-family, vacant, absentee, at least ten years owned and estimated equity 70–100%. Those are search settings, not proof of each row's facts. The account generated `Download 23 Properties - Oct 29, 2026` and My Activity showed **READY**. This establishes one successful free export-generation workflow, not an overall monthly entitlement or a validated seller list.

After browser download permission was declined, the operator downloaded the ready CSV manually. The private native file was verified as **23 rows and 74 columns** and mapped into a separate UTF-8 copy. All rows have owner and owner mailing fields, with no duplicate county/APN pairs. Eight rows name co-owners; all named owners were preserved. Four rows have bank-related `Owner Type` tags and need owner-status review. There are no phone or email values in this export.

All `Owner Occupied` cells are blank despite the absentee search filter, so `absentee` remains unknown for all 23 records. The exported vacancy flag is 1, estimated equity is 79–100%, and ownership length is 162–395 months. These supported values produce **7 points for every record**: vacancy 3, equity 3 and completed ownership of at least ten years 1. The search's absentee label supplies no additional points. Current listing status and underlying record observation/update dates remain unverified; October 29 is the export date, not proof every fact was observed that day.

The mapped file passed Sangam's CSV parser. A factual data-source review was recorded, naming Codex as reviewer acting under the operator's instructions and retaining the native-export, accepted-terms, internal-use and limitation evidence. The live preview showed **23 new records, 0 updates and 0 scoring 8+**. Import completed, and a refresh verified **23 persisted real seller research records**. Today showed **0 mail-ready and 0 call-ready**. No other readiness gates were approved; counsel evidence is the next blocked gate. There are no touches, offers or contracts, and the 90-day clock has not started.

The 23-record sample replaces the proposed 25–50-record starting size; no expansion is needed merely to reach 25. The overall monthly download allowance remains unknown. No skip trace, paid purchase or outreach occurred.

## Repeatable sample procedure: up to 25–50 candidates

1. Search one starter cluster, initially Riverside **92503, 92505 and 92507**. Limit the experiment to supported residential types and off-market candidates. Keep the original 17-ZIP farm for later expansion.
2. Make separate lists for vacant/absentee/high-equity properties, long-held absentee properties and preforeclosure research. Use the actual filters available on Basic; skip any paid-only category. Record the selected filters with the export.
3. Preserve the original score threshold of 8. Absentee + 50% equity + ten years owned totals only 5. Vacant + absentee + at least 70% equity totals 8, if each fact is actually supported. A list label is not a replacement for the evidence. NOD candidates also retain the specialist-review gate.
4. Select at most 25–50 records using the native download control, within the account's actual free allowance. Preserve the unmodified file privately with its export date and source reference. Do not store seller files in this public repository or a public page.
5. Check 10–25 rows first: correct county/parcel, current owner, complete owner mailing address, source dates, missing values, duplicates and supported signal meanings. An address, tax debt or high equity does not establish willingness to sell. Review any equity value outside 0–100 instead of clamping it into a valid score.
6. Retain unknowns as unknown. A calendar tax-delinquent year is not automatically a count of continuously delinquent years. A cash-buyer label does not establish three purchases in 24 months. Do not import either assumption as a fact.

## Map into Sangam

Use **Acquisition → Import → CSV template**. The backend already accepts a source name such as `PropWire Basic — native export`; it does not require a PropStream account. Existing PropStream wording reflects the original workflow. These are the **Sangam target columns** for any authorized source:

| Target | Required evidence or handling |
|---|---|
| `county`, `apn`, `address`, `owner_name` | Required for intake. County is Riverside or San Bernardino. Keep APN as text and preserve leading zeros. |
| `city`, `zip`, `property_type` | Actual property location/type; ZIP must fit the farm for outreach. |
| `mailing_address` | Actual owner mailing destination, formatted `street, city ST ZIP`; do not substitute the property address without evidence. |
| `phone`, `email` | Optional for import. Retain the source for any contact detail. A skip trace is not a consent or screening record. |
| `estimated_value`, `equity_pct` | Source estimates with their dates; equity uses 0–100. Do not treat assessment or redemption amounts as market value/equity. |
| `tax_delinquent_years`, `years_owned` | Supported numeric durations; otherwise blank. |
| `nod`, `vacant`, `absentee`, `inherited`, `code_violations` | Supported true/false values. Leave unknowns blank; avoid invented negatives. |
| `notes` | Field definitions, limitations and references; no credentials or private unrelated information. |

The following native headers were verified in the October 29 export. Recheck future files rather than assuming the vendor schema is permanent:

| Verified PropWire header | Sangam mapping or handling |
|---|---|
| `County`, `APN`, `Address`, `City`, `Zip` | `county`, `apn`, `address`, `city`, `zip`; preserve parcel text and ZIP leading zeros. |
| `Owner 1 First Name` / `Owner 1 Last Name` through `Owner 4 First Name` / `Owner 4 Last Name` | Assemble each nonempty owner name and join all named owners into `owner_name`; retain co-owners. |
| `Owner Mailing Address`, `Owner Mailing City`, `Owner Mailing State`, `Owner Mailing Zip` | Assemble `mailing_address` as `street, city ST ZIP`. Completeness/format does not establish deliverability or current ownership. |
| `Property Type` | Normalize the reviewed single-family records to `property_type=SFR`. |
| `Estimated Value`, `Estimated Equity Percent` | `estimated_value`, `equity_pct`; retain these as source estimates. `Estimated Equity` is an amount, not the percentage field. |
| `Ownership Length (Months)` | `years_owned=floor(months/12)`; use completed years rather than rounding up. |
| `Vacant?` | `vacant`; the first sample contains 1 for all 23 records. |
| `Owner Occupied` | The first sample is entirely blank, so leave `absentee` blank. Do not infer it from the search filter. |
| `Owner Type` | Retain as review context in `notes`; bank-related tags do not prove seller motivation or readiness. |
| `Bedrooms`, `Bathrooms`, `Living Square Feet`, `Year Built`, `Last Sale Date`, `Last Sale Amount` | Optional corresponding targets: `beds`, `baths`, `sqft`, `year_built`, `last_sale_date`, `last_sale_price`; these are retained as source notes by the current importer. |
| `Status`, `Default Amount`, `Recording Date`, `Auction Date` | Preserve relevant evidence for review; their presence as headers does not establish an NOD or current listing status. No supported NOD was established in this sample. |

There are no phone/email columns in this native file. Leave `phone`, `email`, `tax_delinquent_years`, `nod`, `inherited` and `code_violations` unknown unless separate authorized evidence supplies them. `Tax Amount` and `Assessment Year` are not delinquency duration. Keep the original privately, map/remove unsupported columns in a separate UTF-8 copy, and quote comma-containing fields. Acquisition accepts up to 1.8 MB and 5,000 workspace leads; start much smaller. Duplicate county/APN rows in a file are rejected. See [full import guide](GETTING_STARTED.md) for optional fields and request limits.

A reviewer records genuine **Readiness → Data source permission** evidence: provider/account entity, permitted internal purpose, actual review date and a retrievable source/terms reference. Then supply the actual export date and permission reference in Import, preview and import the exact reviewed file. That source review was recorded for the first sample; it is not a professional wholesaling opinion or blanket approval for other sources or outreach.

For explained research decisions use **Sourcing & matching** with an approved upload source, current source permission, a published seller rule and the mapped file. That route accepts at most 500 rows per upload and the configured lower limit. Scheduled refresh reassesses uploaded facts; it does not fetch fresh vendor records.

## Free county supplements

| Source | What it provides | What remains missing |
|---|---|---|
| [San Bernardino newer-default dataset](https://opendata.sbcountyatc.gov/dataset/d9541b0c4b2711f0a6031973736cf94a) | Weekly bill/account/default/payment-plan evidence; observed refresh October 25, 2026 | Verified account-to-APN relationship, owner, property/mailing address and contact data. Use the [offline decoder](COUNTY-RESEARCH-IMPORT.md); repeated installments are not separate sellers. |
| [Riverside power-to-sell inventory](https://countytreasurer.org/inventory-all-tax-defaulted-property) | Free XLSX/PDF with parcel/location and tax-sale research facts; underlying snapshot July 1, 2026 | Owner mailing/phone information and present status. The October file folder is not a new observation date. Recheck redeemed/sold status. |
| [Riverside Assessor public records](https://www.rivcoacr.org/public-records), [SB property information](https://arc.sbcounty.gov/property-information/) | Manual public-record inspection and selected public parcel files | No verified free remote owner-plus-mail API. Respect withheld fields. A requested copy or special file can cost money; no order is authorized. |

Keep county observation dates, exact join evidence and conflicting statuses separate. Do not add tax points from an unmatched account or infer a foreclosure deadline from a power-to-sell date. Automated recurring collection remains separate work requiring verified schema and use scope.

## From candidates to manual outreach

Free Basic contact enrichment is limited to the verified remaining included allowance. Prioritize the strongest reviewed candidates; no paid overage. Even ten successful traces do not guarantee ten eligible calls.

For the imported sample, first verify current owner/status, the four bank-related tags and missing occupancy evidence. A genuine additional scoring fact could change a score; do not add absentee points just to cross 8. After a candidate qualifies, obtain actual contact/screening evidence and complete the remaining readiness and template reviews before preparing any contact batch.

**Current app constraint:** both mail and calling require phone-keyed DNC/litigator evidence no older than 30 days. This is the retained conservative pilot rule, not a statement that all mail legally requires a phone scrub. A file with names/addresses but no screened phone can be imported and researched, but cannot currently be released as a mail batch. Changing that rule would be an explicit reviewed policy and implementation change; it is not silently removed to accommodate free data.

Once the required genuine gate evidence, score, destination, screening and reviewed template exist, prepare and approve the exact batch in **Mail & calls**. The eligible count can be zero. Exporting does not send it. Place the mail order or dial manually; record only actual activity and actual costs. The 90-day clock starts at the first evidenced real outreach receipt.

Buyer research can use available cash-purchase records and existing business relationships. Confirm the actual buy box and permitted contact route; do not buy an Active Buyers upgrade or assume a generic cash-buyer label proves repeat purchasing. Only market a reviewed real contractual interest through the existing manual packet process.

## Terms, budget and changes

PropWire's native CRM-export description supports the intended private operator workflow. Its [terms dated October 28, 2026](https://propwire.com/terms-of-use) also contain broad copying, independent-file and distribution restrictions. Preserve the accepted account evidence; no public API, unrestricted scraping or raw-data resale license is claimed. Current terms mention a 250,000 monthly maximum, but that is not a verified Basic-account entitlement. Use the account's actual allowance rather than older “unlimited” claims.

Changes from the original spec:

- **$99/month PropStream → $0 data-subscription target:** removes that recurring commitment before the first deal; PropWire Basic is the selected experiment.
- **500 monthly pieces → a small first research sample:** the proposed 25–50 became 23 actual imported records. All scored 7 and remain held; this tests field quality before paying for outreach. The original threshold and 90-day targets remain unchanged.
- **Paid tracing by default → verified included credits first:** limits spend; free property records are not unlimited phone records.
- **Vendor flags alone → dated county corroboration where useful:** improves evidence without treating county snapshots as current title or seller intent.
- **Fresh automated scraping → native exports followed by automated processing:** uses the working collection route without claiming a verified free vendor API.

Postage, screening, phone service, hosting, closing and operator time remain costs. No source guarantees an accepted offer or assignment fee. See the [full changes ledger](SPEC-CHANGES.md) and [launch plan](WHOLESALER-LAUNCH-PLAN.md).
