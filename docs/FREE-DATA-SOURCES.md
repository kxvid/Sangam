# Free public data for Sangam

Research verified 2026-10-29. This is an implementation recommendation, not a record of a live provider connection or import. Mail and calling remain manual.

**Later research on October 29:** a current official San Bernardino tax-default CSV was found and its ordinary download worked. This updates the earlier finding below that no usable free distress feed had been established. It is bill/account evidence without owner names or addresses; the published JSON query endpoint failed, and recurring commercial-use scope remains unresolved. It is not connected to the live collector. See the [wholesaler launch plan](WHOLESALER-LAUNCH-PLAN.md) and [offline county research decoder](COUNTY-RESEARCH-IMPORT.md) for the evidence and next steps.

**Current operator decision:** no data subscription. PropWire Basic's native 23-row export was mapped and imported into the private live workspace after factual source review. All 23 score 7; no phone/email data was supplied and absentee remains unknown, so none are ready for outreach. The actual mapping is verified; the overall monthly export limit is not. Riverside also publishes a free July 1 tax-sale inventory. See [Free-source first batch](FREE-LEAD-FIRST-BATCH.md). The older catalog findings below are historical where superseded by these later sources. No free recurring owner/contact API is claimed.

## Implemented boundary

The `src/public-data` adapter foundation supplies the catalog, one explicitly requested Census location lookup, and an offline FEMA county-response decoder. Census lookup responses are suggestions (`unique`, `ambiguous`, or `no_match`); they never overwrite a lead or alter scoring/contact eligibility. Automatic public-source collection is not enabled. FEMA loading returns a hold without a request; Riverside has no parser because its actual JSON schema is still unverified.

The authenticated address-lookup route reserves each attempt in the existing workspace audit using version checks before sending an address. It requires an explicit address-disclosure confirmation, rejects suppressed records and missing applicable source permission, and allows 20 attempts per workspace per rolling 24 hours, with one per property per minute. Failed attempts count. Only property address components reach Census; actor/workspace IDs and owner/contact information remain local to Sangam. The server rejects redirects, non-JSON responses, bodies over 256 KiB and more than 10 matches; the overall deadline is 10 seconds. A cancelled request stops the lookup. Source retrieval time and the actual Census benchmark remain separate from an unknown source update date.

The proposed limits in the research sections below describe possible future extensions; the implemented limits above take precedence. No bulk geocoding or worker-scheduled public-data job was added. Verification and deployment of the complete release are recorded separately from these adapter contracts.

## Recommended order

| Source | What it adds | Verification | Release decision |
| --- | --- | --- | --- |
| U.S. Census Geocoder | Coordinates and geography for an address already in the workspace | Official API documentation read; keyless public-building fixture returned HTTP 200 JSON | Suitable for bounded address enrichment; never creates motivation or contact permission |
| OpenFEMA Disaster Declarations Summaries v2 | County-level disaster context | Keyless Riverside query returned HTTP 200 JSON; current terms/documentation pages returned HTTP 403 | Build a bounded adapter, retain a terms-review hold before customer-facing activation |
| City of Riverside Permit Activity Reports | New property research candidates and permit history within the city | Official dataset, export documentation and commercial-use terms read; JSON endpoints returned HTTP 403 | Useful discovery candidate, but keep disabled until ordinary API access and required attribution are verified |

The research did **not** establish a working, licensed, no-key Inland Empire foreclosure, tax-delinquency, probate or code-violation API. A permit, geocoder match or county disaster declaration is not evidence that an owner is motivated to sell. These sources do not replace the authorized PropStream export workflow.

## 1. Census Geocoder

Primary reference: [Geocoding Services API, updated February 2026](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html).

Verified public fixture, with no API key:

```text
GET https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
    ?address=4600%20Silver%20Hill%20Rd%2C%20Washington%2C%20DC%2020233
    &benchmark=4
    &format=json
```

The response contained `result.addressMatches[0]`, `matchedAddress`, `coordinates.x/y`, `addressComponents`, and `tigerLine`. Observed coordinates: `-76.92836638093, 38.84505589808`. This is the Bureau's public example, not a seller record.

For county validation use `/geocoder/geographies/onelineaddress`, `benchmark=Public_AR_Current`, `vintage=Current_Current`, `format=json`. Store the returned county GEOID and benchmark/vintage. A Riverside City Hall fixture encountered a 502 during verification; treat geography lookup availability as separate from the successful location lookup.

The official batch limit is 10,000 addresses. Coordinates are calculated along address ranges and can be approximate. The underlying benchmark generally changes twice yearly; `Current` is mutable. Preserve retrieval time and benchmark, and avoid overwriting a reviewed location when there is no unique match. This is address enrichment, not parcel ownership verification. The service documentation does not establish a requests-per-second allowance.

Suggested application limits: 20 addresses per job, one request at a time, 10-second timeout, at most two retries for transient errors, 180-day cache. These are Sangam limits, not vendor promises. Only send property-address components; omit owner names, phone numbers, notes and contact history.

### Census Data API is a separate service

Do **not** implement a keyless ACS connector based on old “500 requests per day” advice. The [current Query Limits page, revised May 14, 2026](https://www.census.gov/data/developers/guidance/api-user-guide.Query_Limits.html) requires a key for every Census Data API data query and allows up to 50 variables per query. [Keys are free to register](https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html), but none was requested or created here.

The [Census API terms, revised April 14, 2026](https://www.census.gov/data/developers/about/terms-of-service.html) permit services using its data, require an attribution notice, prohibit implied endorsement, and restrict re-identification of respondents. ACS estimates should stay in a separate area-statistics view; never infer a particular household's income, vacancy, financial distress or protected traits from them. Terms for the separate geocoder are not expressly enumerated in its API page; retain the official documentation and Bureau policy links in the source record rather than claiming an unrestricted commercial license.

## 2. OpenFEMA county disaster context

Primary references: [FEMA's official sample repository](https://github.com/FEMA/openfema-samples), [dataset page](https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2), [API reference](https://www.fema.gov/about/openfema/api), [terms](https://www.fema.gov/about/openfema/terms-conditions).

Verified query, without credentials:

```text
GET https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries
    ?$top=1
    &$filter=state eq 'CA' and fipsCountyCode eq '065'
    &$select=disasterNumber,declarationDate,state,designatedArea,fipsCountyCode,incidentType,lastRefresh
```

Encode the query normally with `URLSearchParams`; do not interpolate user-supplied filter syntax. Use county code `065` for Riverside and `071` for San Bernardino, with state `CA`. The observed Riverside response contained disaster number `5636`, designated area `Riverside (County)`, incident type `Fire`, declaration date `2026-05-20`, and `lastRefresh=2026-10-05T11:26:24.661Z`. Retrieval metadata was dated `2026-10-29`.

Application recommendation: a county context card, not a seller record or scoring signal. Preserve `lastRefresh`, declaration date and retrieval time separately. Deduplicate on disaster number plus county and declaration type if subsequently selected. A county designation neither proves damage at an address nor identifies anyone receiving assistance.

Use a conservative 100-row cap, one request per county daily, and stop if truncated. These are proposed Sangam limits. The current official rate/row cap and reuse/attribution requirements could not be re-read because FEMA's documentation and terms pages returned 403; do not claim they were verified. A successful public endpoint is not proof that every intended commercial reuse is allowed. Do not substitute a third-party mirror for primary terms evidence or import redacted household claims to reconstruct identities.

## 3. Riverside city permit discovery

Primary source: [Permit Activity Reports and terms](https://riversideca.gov/transparency/data/dataset/show/34/Permit_Activity_Reports). The page showed an update on October 23, 2026 and a weekly Friday 17:00 schedule. It covers city residential/commercial permits, not the entire county. Owner fields are deprecated. Commercial reuse is expressly allowed, subject to the displayed terms, application disclaimer and other stated conditions. Include the required disclaimer from its “Use of Data” section before public release; do not imply City endorsement.

The machine feed linked by that page is:

```text
https://riversideca.gov/transparency/data/dataset/json/34/Permit_Activity_Reports
```

The [official export help](https://riversideca.gov/transparency/data/dataset/exporthelp) specifies an array of objects, per-row `_id`, `offset` pagination, 20 default rows and `max=100`. CSV exports retrieve the whole dataset. This review deliberately avoided a full export.

Normal bounded JSON requests returned 403, including `?max=1&offset=0` and the documented short dataset path. No authenticated access, bypass or alternate scraping method was attempted. Actual JSON key spelling and date/null formats therefore remain unverified; do not build a parser by assuming the human-readable column labels are JSON keys.

Expected useful columns: permit number, type/sub-type, status, issue/expiration dates, site address, parcel number, valuation and description. Keep contractor and owner contact fields out of ingestion. Permit valuation is not market value. A stalled application is not proof of owner distress. The source is suitable for a **research queue**, with human verification before scoring or outreach.

Proposed operating behavior after access works: 100 records per weekly run, source record IDs for deduplication, a visible truncation warning, no silent full-history download, and a change log for status changes. Record source update time separately from retrieval time. Validate farm ZIP and property type independently where absent. Never convert this feed automatically into “tax delinquent,” “vacant” or “code violation” points.

## Sources intentionally excluded from this release

- [Riverside's 311 catalog](https://riversideca.gov/transparency/data/) explicitly excludes code enforcement from its top-request dataset. It cannot supply the code-violation signal in the original scoring rubric.
- [San Bernardino parcel service](https://services.arcgis.com/aA3snZwJfFkVyDuP/arcgis/rest/services/Parcels_for_San_Bernardino_County/FeatureServer) exposes parcel polygons and assessment/zoning fields, with a 1,000-row service cap. Its description directs users to County GIS for current online-service instructions. Current publisher provenance, refresh cadence and commercial reuse terms were not fully established. An undifferentiated `TaxStatus` field is not verified delinquency evidence. Keep this candidate disabled.
- [Riverside County OpenData Assessor](https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/Assessor/MapServer) lists parcel and assessment layers and a 2,000-record service cap. A bounded ordinary JSON metadata request returned 403 on October 29, 2026; current redistribution terms were not established. It is a research lead for a future integration, not a verified working connector. County and City of Riverside terms are different and must not be substituted for each other.
- PropStream remains authorized export ingestion only. This research provides no basis for scraping its signed-in interface, acquiring credentials, circumventing export limits or promising a free PropStream API.

## Connector acceptance criteria

1. Fixed provider-host allowlist and fixed query shapes; no arbitrary URL fetcher.
2. A stored source reference, terms review date, collection purpose, geographic coverage and verified field mapping.
3. Timeout, response-size and row limits; reject HTML, unexpected schemas and redirects outside the allowlist. Report partial runs truthfully.
4. Idempotent source keys and provenance. Provider failures must not erase reviewed facts or re-enable suppressed leads.
5. Separate `research_candidate`, `address_enrichment` and `area_context` types. Only verified person/property evidence may affect operational eligibility.
6. No source creates consent, scrub results, approval evidence, touches, deals or launch milestones. Mail exports and manual calling still require their existing review gates.

## Change from the original specification and why

The original plan depended on paid list exports and contemplated future vendor API access. The proposed addition is bounded official public-data collection with explicit provenance, plus a separate research queue. It can reduce lookup work without representing public permits or area data as ready-to-call motivated sellers. ACS is deferred because its current data API requires a free registered key; Riverside permits are held until their documented feed works; FEMA activation needs current terms verification. No paid subscription or recurring data fee was introduced by this research; hosting/storage usage can still increase.
