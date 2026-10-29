# San Bernardino county CSV research preparation

Verified source shape: 2026-10-29. This is a bounded, offline research tool. It does not fetch a website, import a lead into Sangam, add points, join an owner, or enable outreach. Mail and calling remain manual.

## What it accepts

An operator-provided UTF-8 CSV from either official San Bernardino Auditor-Controller/Treasurer/Tax Collector dataset:

| Dataset option | Official source | Publisher cadence and observed refresh |
| --- | --- | --- |
| `newer` | [Defaulted bills 5 years or newer](https://opendata.sbcountyatc.gov/dataset/d9541b0c4b2711f0a6031973736cf94a) | Sundays; observed 2026-10-25 04:00:09 (publisher timezone unspecified) |
| `older` | [Defaulted bills 5 years or older](https://opendata.sbcountyatc.gov/dataset/9bb708264b2811f08edbee73736cf94a) | First of the month; observed 2026-10-01 04:32:56 (publisher timezone unspecified) |

The newer dataset's linked CSV returned successfully during a bounded schema inspection. Its live header has `Assessment Year`; the API metadata describes `Tax Year`. Either spelling is supported, but exactly one must exist. The older dataset's current full CSV contents have not been verified; the tool accepts it only if its provided file passes the same strict schema. A reachable download is evidence of access, not a commercial reuse license.

Required columns, in any order:

```text
Roll Yr,Tax Rate Yr,Assessment Year,Account Number,Bill Number,Installment Number,Escrow Company,TRA Code,TRA Name,Installment Balance,Bill Amount,Bill Balance,Balance Status,Account Status,Roll,Transfer Destination,Bill Type,Bill Category,Tax Default Number,Tax Default Date,Redemption Status,Redemption Total,In Active Payment Plan?
```

Keep all identifiers as text. `Account Number` must have 13 digits, including leading zeros; `Bill Number` must be a digit string. A source account number is not assumed to be an APN. No owner or contact columns are accepted. When selecting a small subset, preserve every original field and the header. Do not silently truncate a download or use a spreadsheet conversion that removes zeros.

## Validate a file first

Use Node 22 or 24 and this repository's installed dependencies. Store real input only in an operator-controlled private directory or this repository's ignored `data/` directory. The examples use placeholders; substitute the actual authorized file, reference, and dates. A source reference can identify the original download and the local evidence record; do not include passwords or access tokens.

```sh
node --import tsx scripts/prepare-county-research.ts /private/path/selected-defaults.csv \
  --dataset newer \
  --source-reference 'Official county download; internal evidence reference REPLACE_ME' \
  --export-date YYYY-MM-DD \
  --source-updated-date YYYY-MM-DD
```

`--source-reference` and `--export-date` are required. Export date means the actual date the source file was obtained, not today's processing date. Supply `--source-updated-date` only when verified from the source; omit it to retain an explicit unknown. Dates require `YYYY-MM-DD`; source refresh cannot be after export, export cannot be in the future, and a row's tax-default date cannot be after export. Row default dates accept `M/D/YYYY` or `YYYY-MM-DD`. The tool does not detect whether a date or reference supplied by the operator is truthful and never treats those fields as an approval.

Validation prints aggregate counts and `status: held` only. It writes no output file by default. This is suitable for checking a file before storing a research artifact. A failure rejects the entire input without returning partial research.

To save validated evidence, append:

```sh
  --output /private/path/new-county-research.json
```

The destination parent must already exist. JSON is written with owner-only permissions (`0600`) and published only after a complete write. Existing files are never overwritten. Git checkout destinations are refused, except untracked, currently Git-ignored paths under this repository's `data/` folder. Symlinked destination parents are checked by their resolved location. The CLI cannot determine whether an otherwise ordinary private directory is cloud-synced or shared; choose that location deliberately. It produces JSON, not CSV, so spreadsheet formula execution is not part of this workflow. Treat raw source fields as data if later displaying or converting them.

## Evidence retained and limits

- Original field values, 13-digit source account identifiers, bill identifiers, source/default dates, original row references, export reference, processing timestamp, byte count and SHA-256 of the supplied file.
- Exact duplicate decoded rows collapse into one observation; all contributing row references remain. A changed bill balance or any other field creates a separate observation. Row references are nonempty CSV record numbers (header is 1), not physical text line numbers when quoted values contain line breaks.
- Bill status and account status remain separate. A paid bill can belong to an unpaid account. Unknown status, blank dates, unknown payment-plan state and blank bill balances remain unknown.
- Money is preserved as decimal text. Repeated account-level redemption amounts are never summed across bills/installments. No total payoff, equity, motivation, delinquency duration, score, mailing address, owner, contact permission or contracted opportunity is inferred.
- Maximum input: 5,000,000 bytes, 10,000 data rows including duplicates, 23 columns, and 4,096 characters per field. Invalid UTF-8, unexpected columns, unsupported amounts, invalid dates, malformed quoting and truncated row widths fail validation. A syntactically complete but incomplete source file cannot always be detected; all output explicitly remains potentially a selected subset. An absent account never proves redemption.
- There is no live retrieval, recurring job, app database mutation or operational launch in this tool. It does not read secrets, search for data, dial, send mail, or contact anyone.

## What must be resolved before operational use

Every result always carries all four holds:

1. **Source-use review:** the dataset metadata currently says no license provided. The county's [API guide](https://opendata.sbcountyatc.gov/data-api) invites integration, while the general [website terms](https://www.sbcountyatc.gov/terms-of-use) restrict automated navigation/search. Confirm the permission covering recurring commercial use, retention, redistribution and any SaaS access. The evidence does not establish either a blanket commercial license or a blanket prohibition. No connector is enabled on that basis.
2. **Parcel identity review:** confirm the account-to-parcel relationship against authoritative records, preserve county and all leading zeros, and verify sample joins. Similar length/format alone is insufficient.
3. **Owner/address source:** obtain an authorized current source and verify the join. County tax observations alone do not supply an outreach-ready owner record.
4. **Operational review:** verify current tax/bill status, source freshness, the real parcel/owner match, applicable source rights and the existing Sangam gates. Source snapshots can change; an unpaid observation does not prove willingness to sell or a viable wholesale spread.

These are research-artifact holds, not replacements for Sangam's existing gate evidence. No legal attestations are changed. This tool cannot clear the holds or mark a business milestone complete.

## Change from the original pilot spec

The original design anticipated nightly vendor ingestion feeding scored seller leads directly. This addition prepares bounded county account/bill evidence offline and holds it separately. The change is intentional: a free official tax-default download can add useful evidence, but its account-level totals, mixed paid/unpaid bill rows, missing owner/address information and unresolved reuse scope do not justify manufacturing seller leads or automatically awarding tax-distress points. Manual mail/calling and the existing approved PropStream import route remain the operational paths.

## Verification

```sh
node --import tsx --test tests/san-bernardino-defaults.test.ts
npm run typecheck
```

Tests use invented records only. They cover leading zeros, separate bill/account status, repeated redemption amounts, exact duplicate behavior, unknown facts, date validity, schema drift, malformed UTF-8, byte/row bounds, truncation, default validation-only behavior, private output, overwrite refusal, public Git-path refusal and sanitized error output. No real county data is copied into the repository.
