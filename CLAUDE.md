# KAHLA STUDIO — Cash Buyer Network

A Claude Code project that finds, scores, and matches cash real estate buyers to wholesale deals. Sold as a $1,500-3,000/mo subscription to wholesalers in CA. Built by Kov as part of KAHLA STUDIO.

---

## CORE THESIS

We are not a wholesaler. We are not a broker. We are an **information service** that sells access to a curated, scored, regularly-updated database of cash buyers, plus matchmaking software that runs personalized outreach when our wholesaler clients have a deal.

Legal positioning: software-as-a-service vendor to wholesalers. We do not represent buyers or sellers. We do not negotiate. We do not earn commissions. We earn subscription fees.

This sidesteps CA BPC 10131 (broker licensing) and CA AB 1850 (pending wholesaler licensing). Get a CA real estate attorney to review ToS before charging the first client.

---

## STACK

| Layer | Tool | Notes |
|---|---|---|
| Runtime | Node 22 + TypeScript | Matches MeasureJoy patterns |
| DB | Supabase | RLS enabled, prepared for multi-tenant later |
| Property data + comps | RentCast API | $0-50/mo, has ARV and comps endpoints |
| Buyer discovery | PropertyRadar | $99/mo, only CA-native cash buyer API |
| Scraping | Playwright | FB groups, county recorder sites |
| Skip tracing | BatchSkipTracing | $0.10-0.20/lookup |
| SMS | Twilio | Start 1 number, scale to 3 |
| Email | Resend | $20/mo, clean DX |
| Cron | Vercel Cron | Free for daily jobs |
| Dashboard (Phase 2) | Next.js on Vercel | Reuse MeasureJoy patterns |
| Auth (Phase 2) | Clerk | Already connected |
| Billing (Phase 2) | Stripe Subscriptions | Already connected |

Monthly run cost at MVP: ~$220-280. Breakeven: 1 client at $1,500/mo.

---

## PROJECT STRUCTURE

```
kahla-buyer-network/
├── CLAUDE.md                       # this file
├── .claude/
│   ├── agents/
│   │   ├── deal-sizer.md
│   │   ├── buyer-hunter.md
│   │   ├── matcher.md
│   │   └── outreach.md
│   ├── commands/
│   │   ├── size-deal.md
│   │   ├── run-discovery.md
│   │   ├── match-deal.md
│   │   └── send-outreach.md
│   └── settings.json
├── src/
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client + types
│   │   ├── propertyradar.ts        # PropertyRadar API wrapper
│   │   ├── rentcast.ts             # RentCast API wrapper
│   │   ├── skiptrace.ts            # BatchSkipTracing wrapper
│   │   ├── twilio.ts               # SMS send + webhook handler
│   │   ├── resend.ts               # Email send + webhook handler
│   │   └── anthropic.ts            # Claude API for in-code calls
│   ├── scrapers/
│   │   ├── la-county-recorder.ts
│   │   ├── biggerpockets.ts
│   │   └── fb-groups.ts            # Playwright-based
│   ├── jobs/
│   │   ├── score-deal.ts           # Deal Sizer execution
│   │   ├── nightly-discovery.ts    # Buyer Hunter execution
│   │   ├── match-buyers.ts         # Matcher execution
│   │   └── send-outreach.ts        # Outreach execution
│   └── types.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
├── package.json
└── README.md
```

---

## ENVIRONMENT VARIABLES

Create `.env` in project root:

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# Anthropic (for in-code Claude calls inside agents)
ANTHROPIC_API_KEY=

# Property data
RENTCAST_API_KEY=
PROPERTYRADAR_API_KEY=

# Skip tracing
BATCHSKIPTRACE_API_KEY=

# SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=outreach@kahlastudio.com

# App
NODE_ENV=development
```

---

## DATABASE SCHEMA

See `supabase/migrations/001_initial_schema.sql` for the full DDL. Tables: `buyers`, `wholesalers`, `deals`, `outreach`, `discovery_runs`.

---

## SUBAGENTS

Defined in `.claude/agents/`:

- **deal-sizer** — evaluates a wholesale deal, computes real ARV from filtered comps, applies the 70% rule, scores 0-100, auto-kills < 30.
- **buyer-hunter** — discovers cash buyers from PropertyRadar, county recorders, BiggerPockets, FB groups, and hard money DOT filings. Dedupes, enriches via skip trace, upserts.
- **matcher** — matches scored deals to ranked buyers via SQL filter + Claude reranking. Returns top 20.
- **outreach** — generates personalized SMS + email, sends via Twilio/Resend, logs to outreach table.

---

## SLASH COMMANDS

Defined in `.claude/commands/`:

- `/size-deal "<address>" <asking_price> [claimed_arv]`
- `/run-discovery`
- `/match-deal <deal_id>`
- `/send-outreach <deal_id>`

---

## BUILD SEQUENCE (10 DAYS BEFORE 5/22)

### Day 1 (Mon, 2 hr after gym)
- `mkdir kahla-buyer-network && cd kahla-buyer-network`
- `npm init -y && npm install @supabase/supabase-js @anthropic-ai/sdk twilio resend playwright zod dotenv`
- `npx claude init`
- Create Supabase project at supabase.com
- Run the migration SQL in Supabase SQL editor
- Drop this CLAUDE.md at project root
- Drop the 4 agent .md files in `.claude/agents/`
- Drop the 4 command files in `.claude/commands/`
- Sign up: RentCast (free trial), PropertyRadar (free trial), Twilio (1 number), Resend (free tier), BatchSkipTracing
- Fill in .env

### Day 2 (Tue, 4 hr no gym)
- Build `src/lib/supabase.ts`, `src/lib/rentcast.ts`, `src/lib/anthropic.ts`
- Build `src/jobs/score-deal.ts` (the actual code the deal-sizer agent invokes)
- Test: run `/size-deal "229 Angus Ave E, San Bruno, CA 94066" 780000` in Claude Code
- Verify: deals table shows row with score < 30 and kill_reason populated
- Calibrate against 5 known historical flips. Known-good must score 70+, known-bad <30.

### Day 3 (Wed, 2 hr after gym)
- Manually seed 30 buyers via Supabase dashboard
- Sources: LA REIA member directory, BiggerPockets find-investors filter, top 10 commenters from each FB group
- Each entry: name, entity, phone, email, primary_region, source, notes

### Day 4-5 (Thu-Fri, 7 hr total)
- Build `src/lib/propertyradar.ts`, `src/lib/skiptrace.ts`, `src/jobs/nightly-discovery.ts`
- Run discovery against PropertyRadar for CA cash buyers, last 12 months
- Verify: buyers table has 500+ rows by Friday EOD

### Day 6 (Sat, 4 hr)
- Build `src/jobs/match-buyers.ts`
- Test on 5 fake deals across regions and price bands
- Verify top 20 buyers per deal actually fit

### Day 7 (Sun, 3 hr if energy)
- Build `src/lib/twilio.ts`, `src/lib/resend.ts`
- Build `src/jobs/send-outreach.ts` in dry-run mode
- Generate sample messages for 1 real deal, review by eye

### Day 8 (Mon, 2 hr)
- Flip outreach to live-send mode
- Send 1 test SMS + 1 test email to yourself
- Set up Twilio webhook for inbound replies → update outreach.response_at

### Day 9 (Tue, 4 hr)
- Text the Angus wholesaler the subscription pitch
- Send 5 cold DMs to other wholesalers in LA, OC, IE via BP and FB

### Day 10 (Wed, 2 hr)
- Polish the demo: clean Supabase dashboard view, one-pager PDF with the system overview
- Be ready for a demo call by Thursday

By 5/22: working pipeline, 500+ buyers in DB, 1 demo done, 5 cold pitches sent.

---

## FIRST CLIENT PITCH (verbatim, for the Angus wholesaler)

> "Hey — ran the numbers on Angus. Math doesn't pencil for a flipper at $780k (comp you sent is in a different school zone with a Bay view, so it's not apples-to-apples). I'll pass on that one. But the real problem you're hitting is buyer access — you're offering $10k to find one buyer because you don't have a deep enough list. I'm building a system that pulls active CA cash buyers from county records, PropertyRadar, and investor groups, scores them, and runs personalized outreach the day you drop a deal. $1,500/mo flat. First 30 days free if you let me use you as the proof-of-concept client. Want a demo Thursday?"

---

## TEST CASE: 229 ANGUS AVE E

Calibration deal. Run it through Deal Sizer first.

Expected output:
- Score < 30
- Status: dead
- Kill reason: "Asking $780k exceeds 85% of computed ARV ($880-900k). Subject sold $600k on 2026-03-17, current ask is 30% markup over recent arms-length sale with no improvements. Wholesaler's $1.255M comp (611 Elm) rejected: different school zone (John Muir vs Belle Air), has Bay + City Lights view, hill topography."

If Deal Sizer produces that output, scoring is calibrated.

---

## SUCCESS CRITERIA

By Friday 5/22:
- [ ] 500+ buyers in DB
- [ ] Deal Sizer kills 229 Angus correctly
- [ ] 1 generated SMS message body that passes the smell test
- [ ] At least 1 wholesaler pitched (Angus guy)
- [ ] At least 5 cold DMs sent to other wholesalers

By July 1: $3k MRR (2 wholesaler clients).
By August 1: $5k MRR (3-4 wholesaler clients).

---

## NOTES

- Notion MCP is connected. Use Notion as the client-facing dashboard: one workspace per wholesaler client with their matched buyers, deal pipeline, outreach status. Auto-sync from Supabase.
- Get a CA real estate attorney to review ToS before charging client #1. $500-1500 one-time.
- Track every dollar in/out from day 1 in a separate Stripe + bookkeeping account. KAHLA STUDIO LLC if not already filed.
- The buyer database itself is the moat. PropertyRadar resets when you cancel; your enriched, scored, deduplicated DB does not. Treat the buyers table like the only asset that matters.
