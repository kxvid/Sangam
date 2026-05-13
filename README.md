# KAHLA STUDIO — Cash Buyer Network

Curated, scored, regularly-updated database of CA cash real estate buyers + matchmaking software that runs personalized outreach when wholesaler clients drop a deal.

Sold as $1,500-3,000/mo subscription. We are an information service, not a broker.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in keys
# Run supabase/migrations/001_initial_schema.sql in your Supabase SQL editor
```

## Commands

Inside Claude Code:

- `/size-deal "<address>" <asking> [claimed_arv]` — run deal through Deal Sizer
- `/run-discovery` — nightly buyer discovery across all sources
- `/match-deal <deal_id>` — rank top 20 buyers for a scored deal
- `/send-outreach <deal_id>` — send SMS + email to matched buyers

CLI scripts (alternative entry points):

```bash
npm run score-deal
npm run discovery
npm run match
npm run outreach
```

## Architecture

See [CLAUDE.md](./CLAUDE.md) for the full system spec, agent definitions, build sequence, and operating notes.

## Status

MVP scaffold. See CLAUDE.md "BUILD SEQUENCE" for day-by-day delivery to 5/22.
