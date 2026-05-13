# KAHLA STUDIO — Cash Buyer Network

A web dashboard that finds, scores, and matches cash real estate buyers to wholesale deals. Sold as a $1,500-3,000/mo subscription to wholesalers in CA.

Built as a Next.js app on Vercel — operate from a phone, laptop, anywhere with a browser.

## Quick start

**Deploy to Vercel (recommended):** see [`docs/DEPLOY.md`](./docs/DEPLOY.md).

**Local dev:**

```bash
npm install
cp .env.example .env.local   # fill in keys
# Run supabase/migrations/001_initial_schema.sql in your Supabase SQL editor
npm run dev
# open http://localhost:3000
```

## Pages

| Path | What it does |
|---|---|
| `/dashboard` | At-a-glance stats: buyer count, deal count, replies this week |
| `/score` | Enter address + asking price → ARV, MAO, score, kill reasons |
| `/deals` | List of every scored deal with status badges |
| `/deals/[id]` | Per-deal: math breakdown + buyer matches + send outreach |
| `/buyers` | Searchable, filterable table of every cash buyer in the DB |
| `/inbox` | Replies from buyers + recent sends |

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/score` | Clerk | Score a deal |
| `POST /api/match` | Clerk | Match buyers to a scored deal |
| `POST /api/outreach` | Clerk | Send SMS + email (or dry-run preview) |
| `GET /api/cron/discovery` | Bearer token | Vercel Cron nightly buyer discovery |
| `POST /api/webhooks/twilio` | Twilio signature | Inbound SMS replies |
| `POST /api/webhooks/resend` | Resend signature | Email open/click/bounce events |

## CLI (optional)

The original CLI entry points still work for one-off use:

```bash
npm run score-deal -- "<address>" <asking> [claimed_arv]
npm run discovery
npm run match -- <deal_id>
npm run outreach -- <deal_id>
```

## More docs

- [`docs/DEPLOY.md`](./docs/DEPLOY.md) — push to production
- [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md) — beginner walk-through of the whole system
- [`CLAUDE.md`](./CLAUDE.md) — full system spec
