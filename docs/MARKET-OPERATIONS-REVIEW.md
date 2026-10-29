# Market operations release review — 2026-10-29

Scope: `/operations`, bounded operator-requested public-address lookup, and additive planning/history records. The original manual execution boundaries remain in force. No migration, paid service, customer billing, source-rights attestation or real business outcome is part of this release.

## Verified before release

- 118 unit tests passed, including 17 new operations cases and 12 public-data/request cases.
- TypeScript checks and optimized production build passed.
- 46 isolated fictional browser workflow checks passed: 17 Acquisition, 14 sourcing/matching, 15 Operations. This includes explicit address-disclosure choice, lookup-result workspace separation, persisted scenarios, stale-save conflict recovery and stable buyer activity retries.
- Actual disposable PostgreSQL: workspace membership/isolation and atomic state/audit, optional operations JSON roundtrip, three automation transaction suites and backup/restore passed. These tests do not use the hosted production database.
- Built-server HTTP smoke passed: private pages/API fail closed without sign-in configuration; retired outbound endpoints refuse operation; untrusted cron calls receive 401.
- The actual Census adapter made an ordinary public City Hall address request on 2026-10-29T15:47:50Z. It returned valid JSON and `no_match`, preserving benchmark/retrieval evidence. No seller address was used and no coordinates were fabricated.

## Independent review and fixes

1. Buyer follow-up planning previously omitted general/specialist approval checks. New plans and suggested contact work now check applicable general/NOD evidence; historical actual replies can still be recorded.
2. Closed contracts previously labeled losing buyers as closed. Only the assigned buyer receives that stage; other relationships end with the contract.
3. Same-time seller events could favor an earlier receipt over a later decline. Ordering now considers event time, recording time and a deterministic terminal-safe tie policy.
4. Aborting a public-address request while switching workspaces could trigger an obsolete reload. The panel now captures and checks the original request's abort state before returning results or refreshing.
5. Source holds now reach the operations queue and readiness, while transactional checks continue to protect manual preparation/export and external enrichment.
6. Date-only source dates display their recorded calendar date rather than converting midnight UTC to the previous Pacific day.

An independent reviewer re-ran the gate, closing-stage, same-time decline and source-hold regressions after the fixes. No blocking finding remained in that scope.

## Deployment verification still required

Confirm the exact reviewed commit in a READY deployment, exercise the protected Operations page with the signed-in administrator, save/reload an explicitly fictional scenario, inspect source holds and real/practice separation, and verify that real activity/launch metrics remain unchanged. Hosted buyer-offer/closing and paid customer workflows must not be represented as tested merely from local fixtures. Record the deployment reference and live screenshot in the task's release handoff after these checks.

## Operating limits

The public-data catalog exposes one usable per-address Census lookup. FEMA and Riverside permits remain visibly held; no working free motivated-seller feed was established. PropStream acquisition remains manual export. Address results are screen-only suggestions; requests are audited and capped at 20 per rolling day, with failed requests counting. Source documents, legal approvals, actual sending, negotiation and closing remain human work. Production restore evidence, self-service onboarding and billing remain separate prerequisites for a public paid SaaS launch.
