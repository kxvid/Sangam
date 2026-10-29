# PropertyRadar cost-preview preparation

Verified against public provider documentation on October 29, 2026. **This is a count/cost preview tool, not a live lead collector.** No paid account, secret, scheduled source, production route or subscription was activated. Mail and calling remain manual.

**Operator decision after the comparison: use PropStream exports for now.** PropertyRadar activation is deferred. This local preview preparation remains available for a later explicit source decision; it does not change the chosen route or add recurring cost.

PropertyRadar is the recommended next paid source for Kahla Labs' own wholesaling desk because current Solo access includes its API and the county coverage includes relevant property-level records. Solo is listed at $119/month, or $99/month equivalent with annual prepayment. Those are published prices; no checkout or purchase occurred. Current-plan trial subscriptions do not include API access. [Pricing](https://www.propertyradar.com/pricing), [September 22, 2026 API access guidance](https://help.propertyradar.com/en/articles/15604571-using-the-propertyradar-api), [California coverage](https://www.propertyradar.com/coverage/california).

## Use the offline plan

From the project directory:

```sh
node --import tsx scripts/propertyradar-preview.ts
```

The default prints its exact request plan and performs zero network requests. The only adjustable search option is `--limit`, a whole number from 1 to 100 (default 10). It fixes the source host, method, fields, Riverside/San Bernardino FIPS codes and starter ZIPs. Its proposed search is tax-delinquent, two or more years, different tax-mailing address and at least 50% estimated equity. This is a research/counting strategy, not a validated opportunity or a contact decision. An alternate mailing address is an absentee proxy and may not describe actual occupancy.

The existing app's approved PropStream upload workflow remains the route for real seller imports. This tool does not write to Sangam, approve a source, acquire contacts or change any launch evidence.

## Optional explicit cost preview

Only after the operator has an authorized paid account, provision its API token through the trusted server environment as `PROPERTYRADAR_API_TOKEN`. Never pass a token as a command argument, place it in a URL, paste it in chat or commit it. This script does not automatically load environment files.

```sh
node --import tsx scripts/propertyradar-preview.ts --preview --limit 10
```

This makes exactly one authenticated request with `Purchase=0`. It does not follow with `Purchase=1`, return seller rows, spend export credits or enable a schedule. The provider documents this preview as count/cost only. The response is reduced to validated numbers and explicit statements that no records were imported, no purchase occurred and no credits were reserved. An unexpected nonempty `results` array is refused. Missing cost/allowance information produces an error, not a zero-cost assumption. [Cost-preview semantics](https://help.propertyradar.com/en/articles/8769706-api-implementation-considerations).

The client sends only reviewed criteria to `https://api.propertyradar.com/v1/properties`, places the token in the Authorization header, rejects redirects and changed endpoints, caps the response at 32 KiB and bounds the entire request to ten seconds. It never retries. Errors exclude provider body text, tokens and arbitrary URLs. No caller-supplied host, fields, purchase flag, raw criteria or personal-data input is accepted.

## Why actual acquisition remains separate

The published API requires an explicit purchase flag; it does not document an atomic maximum-price/no-overage or credit-reservation parameter. A cost preview and remaining-credit count can change before a later retrieval, including when other account users export data. A preview is therefore **not a guarantee of zero overage on a future purchase**. This implementation makes no retrieval request and cannot toggle billing or auto-recharge. Do not remove its constant `Purchase=0` to turn it into a collector. [Official OpenAPI 5.3.1.0](https://developers.propertyradar.com/_bundle/api.json?download=).

To activate a future collector, separately configure the actual account scope and approved recurring cost, verify returned property fields on a bounded authorized run, establish account-level spending controls, and implement source provenance, storage, freshness, deduplication and existing review gates. Contact appends and any webhook that enables provider automation require their own concrete implementation; none is part of this preview.

The provider documents internal CRM/data-warehouse integrations. Kahla Labs' own desk is that intended use; this guide does not invent a special written-permission requirement. Record the actual account/API terms and applicable limits. The API's end-user restriction and partner program matter separately if Sangam later sells access to shared provider data. Broad general-agreement clauses and newer integration guidance should remain visible in that review. [Internal API use](https://help.propertyradar.com/en/articles/15604571-using-the-propertyradar-api), [end-user/partner boundary](https://developers.propertyradar.com/), [general agreement](https://www.propertyradar.com/user-agreement).

## Validation and change from the original specification

```sh
node --import tsx --test tests/propertyradar-preview.test.ts
```

Tests use fictional credentials and local response fixtures only. They cover no-purchase request construction, scope/host refusal, exact money parsing, missing/invalid counts, unexpected lead rows, redirects, redacted failures, body limits, cancellation, deadline and actual offline CLI behavior. No authenticated provider response is claimed.

The original spec assumed possible PropStream API access. This adds a documented PropertyRadar cost-preview path because API access is now included in its current paid plans. It deliberately stops before billable acquisition: the present API contract has no atomic price cap, and the pilot has no configured paid PropertyRadar account. It does not replace PropStream exports or imply fresh lead scraping is live.
