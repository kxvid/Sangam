# Getting Started — KAHLA Cash Buyer Network

A walk-through for someone who has never run this project. Assumes you can open a terminal, install Node, and copy/paste API keys.

---

## 1. What this thing actually does

You give it a property address + asking price. It tells you whether the deal is real (score 0-100). If the deal is real, it picks the 20 most likely cash buyers from your database and sends each one a personalized SMS or email. You make money charging wholesalers $1,500-3,000/month to use it.

Four moving parts:

| Piece | What it does | When you run it |
|---|---|---|
| **Deal Sizer** | Pulls comps, computes ARV, applies 70% rule, scores 0-100 | Every time a wholesaler sends you a deal |
| **Buyer Hunter** | Discovers new cash buyers from PropertyRadar etc. and writes them to the DB | Once a night (cron later, manual for now) |
| **Matcher** | Ranks the top 20 buyers for a specific scored deal | After a deal scores ≥ 30 |
| **Outreach** | Sends personalized SMS + email to those 20 buyers | After matcher returns a list and you say "go" |

---

## 2. One-time setup

### 2a. Install Node 22 and clone the repo

```bash
node --version    # need v22.x
git clone <this-repo>
cd Sangam
npm install
```

### 2b. Sign up for the APIs

Get one key per row. Free tiers are fine for testing.

| Service | Why | Free tier |
|---|---|---|
| Supabase | Database | Yes, generous |
| Anthropic | Claude API for ranking + message generation | Pay-as-you-go, ~$0.01/deal |
| RentCast | Property data + comparable sales | 50 free calls/mo |
| PropertyRadar | CA cash-buyer discovery | 7-day free trial |
| BatchSkipTracing | Phone/email lookup | Pay-per-lookup ($0.15) |
| Twilio | Send SMS | Pay-per-message + $1/mo for the number |
| Resend | Send email | 3,000 free emails/mo |

### 2c. Create the database

1. Go to [supabase.com](https://supabase.com), create a new project.
2. In the Supabase dashboard → SQL Editor → New Query.
3. Open `supabase/migrations/001_initial_schema.sql` from this repo, paste the whole thing, click Run.
4. Verify: Table Editor should now show `buyers`, `wholesalers`, `deals`, `outreach`, `discovery_runs`.

### 2d. Fill in `.env`

```bash
cp .env.example .env
```

Open `.env` and paste each key from step 2b. Where to find them:

- **Supabase** → Project Settings → API → copy `URL` and `service_role` key
- **Anthropic** → console.anthropic.com → API Keys → Create Key
- **RentCast** → app.rentcast.io → Dashboard → API Keys
- **PropertyRadar** → app.propertyradar.com → Account → API
- **Twilio** → console.twilio.com → Account SID, Auth Token, Phone Numbers → buy a number
- **Resend** → resend.com → API Keys → also verify your sending domain

---

## 3. Smoke test: score one deal

This is the fastest "does it work" check. No SMS, no email, no buyers needed.

```bash
npm run score-deal -- "229 Angus Ave E, San Bruno, CA 94066" 780000 1255000
```

What this means:
- Address: the property
- 780000: wholesaler is asking $780k
- 1255000: optional, the wholesaler's claimed ARV (we'll check if it's inflated)

You should see something like:

```
DEAL: 229 Angus Ave E, San Bruno, CA 94066
ASKING: $780,000
ARV (computed): $895,000  [median $/sqft of 5 qualified comps × 1100 sqft]
REPAIRS (gut @ $80/sqft): $88,000
MAO: $538,500
SCORE: 0
STATUS: dead
KILL REASON: Asking $780,000 exceeds 85% of computed ARV ...; Wholesaler claimed ARV $1,255,000 is 40% above computed ARV ...
```

The deal is now in your `deals` table — open Supabase → Table Editor → `deals` and you'll see the row.

**Calibration check:** the 229 Angus deal should always come back with `STATUS: dead`. If it scores ≥ 30, something is wrong with your API keys or comp data — stop and debug before going further.

---

## 4. Seed your buyer database

The matcher needs buyers to match against. Two ways to get them in:

### 4a. Manual seed (recommended for day 1)

Supabase dashboard → Table Editor → `buyers` → Insert row. Add 20-30 buyers you already know about. Required fields per row:

| Field | Example | Notes |
|---|---|---|
| `full_name` or `entity_name` | "Acme Holdings LLC" | One or the other |
| `phone` | "+14155551234" | E.164 format if possible |
| `email` | "deals@acme.com" | |
| `primary_region` | "Los Angeles" | City, not state |
| `min_price` / `max_price` | 300000 / 800000 | Their price band |
| `property_types` | `{sfr}` | Postgres array |
| `source` | "manual" | |
| `source_confidence` | 4 | 1-5 |

Where to find buyers to manually add:
- LA REIA member directory (laareia.com)
- BiggerPockets → Find Investors → filter California → flippers/investors
- Top commenters in "LA Real Estate Investors" / "SoCal Flippers" FB groups

### 4b. Auto-discovery (after PropertyRadar is set up)

```bash
npm run discovery
```

This queries PropertyRadar for CA cash buyers who own 2+ properties and purchased in the last year, then upserts them into `buyers`. The first run can take a few minutes and may cost up to $20 in skip-trace lookups (capped). Expect 200-500 new rows.

---

## 5. End-to-end on a real deal

Once you have buyers in the DB and one live deal that scored above 30:

```bash
# 1. Score the new deal
npm run score-deal -- "1234 Real St, Anaheim, CA 92805" 425000
# Copy the DEAL ID from the output, e.g. d3f9...

# 2. Match buyers to it
npm run match -- d3f9...
# Prints the top 20, also writes them to the `outreach` table as pending

# 3. Preview the messages first (no actual sends)
DRY_RUN=1 npm run outreach -- d3f9...
# Open Supabase → outreach table → check the message_text fields by eye

# 4. If the messages look good, send for real
npm run outreach -- d3f9...
```

**Important rails the system enforces automatically:**
- It refuses to send between 9pm and 8am Pacific (TCPA)
- It will not send the same buyer more than 1 SMS + 1 email per week
- It will not re-pitch a buyer on the same deal within 7 days
- Every SMS includes "Reply STOP to opt out" and the KAHLA STUDIO disclosure
- The SMS body never contains the property address (only beds/baths/sqft) — the address only goes out in the deal sheet after the buyer replies Y

---

## 6. Inside Claude Code (alternative to npm scripts)

If you're working inside Claude Code, you can use slash commands instead of `npm run`:

```
/size-deal "229 Angus Ave E, San Bruno, CA 94066" 780000 1255000
/run-discovery
/match-deal <deal_id>
/send-outreach <deal_id>
```

Each one invokes the matching subagent (in `.claude/agents/`).

---

## 7. The mental model in one minute

```
wholesaler texts you address ──► /size-deal ──► deals table
                                                    │
                              score ≥ 30 ──────────┘
                                                    │
                                                    ▼
                                              /match-deal
                                                    │
                                                    ▼
                                            outreach table (20 rows, pending)
                                                    │
                              you eyeball with DRY_RUN ─────► looks good?
                                                                  │
                                                                  ▼
                                                          /send-outreach
                                                                  │
                                                                  ▼
                                                        Twilio + Resend fire
                                                                  │
                                                                  ▼
                                                        buyer replies Y / questions
                                                                  │
                                                                  ▼
                                                  you hand-deliver the deal sheet
                                                  + connect buyer to wholesaler
```

You charge the wholesaler $1,500-3,000/month for this. You do not take commission on the actual transaction — you are a software vendor, not a broker. Keep it that way.

---

## 8. Common things that break

| Symptom | Cause | Fix |
|---|---|---|
| `SUPABASE_URL required` on every command | `.env` not loaded | Check `.env` exists at repo root, run `npm install dotenv` if missing |
| `RentCast 401` | Bad RentCast key | Re-copy from RentCast dashboard, make sure you're on the right account tier |
| Score is 100 for everything | RentCast returned `price: 0` | Check that `getProperty` returned a `squareFootage` — if 0, the median × 0 = 0 = trivially beats MAO. Bad address parse usually |
| Matcher returns 0 buyers | Empty `buyers` table or region mismatch | Seed buyers manually, or run `/run-discovery` |
| `Outside TCPA send window` | It's after 9pm PT | Wait until morning, or use `DRY_RUN=1` to preview |
| Twilio "phone number not verified" | On free tier Twilio only sends to verified numbers | Verify recipient numbers in Twilio console, or upgrade |

---

## 9. What to do this week

1. Day 1: Run setup (steps 1-2 above). Confirm `.env` is filled. Run the 229 Angus smoke test and verify it dies.
2. Day 2: Seed 20-30 buyers manually (step 4a).
3. Day 3: Run `npm run discovery` against PropertyRadar. Aim for 500 buyers total in the DB.
4. Day 4: Find one real live deal from a wholesaler, run the full pipeline (step 5) with `DRY_RUN=1`. Show the wholesaler the matched buyer count.
5. Day 5: Pitch your first wholesaler with the $1,500/mo flat-rate, first-30-days-free offer (see CLAUDE.md "FIRST CLIENT PITCH").

If the Angus wholesaler bites, he's client #1. If he ghosts, send 5 cold DMs to other LA/OC/IE wholesalers via BiggerPockets and FB.
