# Deploy to Vercel

Get from `git push` to a working `https://your-app.vercel.app` you can sign into from any device.

---

## 0. What you're shipping

A Next.js dashboard with:
- Google sign-in (Clerk), restricted to your email allowlist
- 5 pages: Dashboard, Score deal, Deals, Buyers, Inbox
- 3 API routes the dashboard calls (score, match, outreach)
- 1 nightly Vercel Cron that runs PropertyRadar discovery
- 2 webhooks (Twilio inbound SMS, Resend events)

No CLI required. You only need the CLI if you want to develop locally.

---

## 1. Push the branch to GitHub

If you haven't already, this branch (`claude/cash-buyer-network-FRYis`) needs to be in a GitHub repo Vercel can read.

```bash
git push -u origin claude/cash-buyer-network-FRYis
```

---

## 2. Set up Clerk (5 min)

1. Go to [clerk.com](https://clerk.com), sign up.
2. Create a new application → enable **Google** as a sign-in method, disable everything else.
3. From the Clerk dashboard:
   - Copy **Publishable Key** → save as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Copy **Secret Key** → save as `CLERK_SECRET_KEY`
4. Sessions → "Customize session token" → add this JSON so the email is included in claims (the allowlist check needs it):
   ```json
   {
     "email": "{{user.primary_email_address}}"
   }
   ```

---

## 3. Set up Supabase (you may have done this already)

1. [supabase.com](https://supabase.com) → new project.
2. SQL Editor → paste `supabase/migrations/001_initial_schema.sql` → Run.
3. Project Settings → API:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret — full access)
   - `SUPABASE_ANON_KEY`

---

## 4. Import the repo into Vercel

1. [vercel.com](https://vercel.com) → New Project → Import from GitHub → pick your `Sangam` repo.
2. Framework Preset: Next.js (auto-detected).
3. Build Command: leave default (`next build`).
4. Output Directory: leave default.
5. **Before you click Deploy**, expand "Environment Variables" and paste every key from your `.env.example`. Critical ones:

| Variable | Source | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase Settings → API | `https://abc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | same | long JWT |
| `SUPABASE_ANON_KEY` | same | long JWT |
| `ANTHROPIC_API_KEY` | console.anthropic.com | `sk-ant-…` |
| `RENTCAST_API_KEY` | RentCast dashboard | |
| `PROPERTYRADAR_API_KEY` | PropertyRadar account | |
| `BATCHSKIPTRACE_API_KEY` | BatchSkipTracing | |
| `TWILIO_ACCOUNT_SID` | Twilio console | `AC…` |
| `TWILIO_AUTH_TOKEN` | Twilio console | |
| `TWILIO_PHONE_NUMBER` | the number you bought | `+14155551234` |
| `RESEND_API_KEY` | resend.com | `re_…` |
| `RESEND_FROM_EMAIL` | a domain you verified in Resend | `outreach@yourdomain.com` |
| `RESEND_WEBHOOK_SECRET` | optional, set if you wire Resend webhooks | |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard | `pk_live_…` |
| `CLERK_SECRET_KEY` | Clerk dashboard | `sk_live_…` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | literal | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | literal | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | literal | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | literal | `/dashboard` |
| `CLERK_ALLOWED_EMAILS` | YOUR emails, comma-sep | `you@gmail.com,you@kahlastudio.com` |
| `CRON_SECRET` | any long random string | `openssl rand -hex 32` |

6. Click **Deploy**. First build takes ~2 min.

When it finishes you get `https://kahla-network.vercel.app` (or whatever Vercel names it). Open it.

---

## 5. First sign-in

1. Visit the URL — you land on `/sign-in`.
2. Click "Continue with Google".
3. Pick the Google account whose email you put in `CLERK_ALLOWED_EMAILS`.
4. You're in the dashboard.

If you get a 403 "your account is not on the operator allowlist" — your Google email isn't in `CLERK_ALLOWED_EMAILS`. Update the env var in Vercel → Settings → Environment Variables → **redeploy** so it takes effect.

---

## 6. Wire the webhooks (do this once)

### Twilio inbound SMS

Twilio console → Phone Numbers → your number → Messaging Configuration:

- **A message comes in** → Webhook → `https://YOUR-APP.vercel.app/api/webhooks/twilio` → HTTP POST.

This lets buyers reply Y / STOP and have it logged.

### Resend events (optional but useful)

resend.com → Webhooks → Add Endpoint:

- URL: `https://YOUR-APP.vercel.app/api/webhooks/resend`
- Events: `email.opened`, `email.clicked`, `email.bounced`

Copy the signing secret into `RESEND_WEBHOOK_SECRET` env var on Vercel, redeploy.

---

## 7. Custom domain (optional)

Vercel → Project → Settings → Domains → Add → `app.kahlastudio.com` (or whatever you bought).

Add the CNAME record at your registrar (Vercel shows the exact one). DNS propagates in 5-30 min. SSL is automatic.

---

## 8. Verify the cron is running

Vercel → Project → Settings → Cron Jobs. You should see one entry:

| Path | Schedule |
|---|---|
| `/api/cron/discovery` | `0 9 * * *` |

This runs **9:00 UTC daily** (1am Pacific). The job hits PropertyRadar, upserts new buyers, logs to `discovery_runs`. On the dashboard you'll see the last run timestamp under "Latest discovery run".

To trigger it manually for testing: Vercel → Cron Jobs → click the job → **Run now**. Or:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/discovery
```

---

## 9. Daily flow (now you operate from your phone)

1. Wholesaler texts you an address.
2. Open `https://YOUR-APP.vercel.app/score` on your phone.
3. Type address + asking price → tap "Score deal".
4. If alive, the result page links to the deal detail → tap "Match buyers".
5. Tap "Preview messages" → eyeball them in `/deals/<id>`.
6. Tap "Send live blast" → SMS + email go out to top 20.
7. Replies show up in `/inbox` automatically (via Twilio webhook).

You never need to open a laptop.

---

## 10. Common deploy issues

| Symptom | Cause | Fix |
|---|---|---|
| Build fails with "Module not found '@clerk/nextjs'" | Old node_modules cached | Vercel → Project → Settings → General → Clear Build Cache → redeploy |
| 403 on every page after sign-in | Email not in allowlist or session token doesn't include email | Step 2.4 above |
| `/api/score` returns 500 "SUPABASE_URL required" | Env var typo | Vercel → Settings → Env Vars → verify spelling, redeploy |
| Cron never runs | Vercel Hobby plan limits crons to daily; Pro allows shorter | Either keep daily or upgrade to Pro |
| Twilio webhook returns 403 | Signature validation failed | Make sure `TWILIO_AUTH_TOKEN` is set and webhook URL exactly matches |
| Discovery cron hits 300s timeout | Too many PropertyRadar results in one run | Lower `limit` in `src/jobs/nightly-discovery.ts` or split by region |

---

## 11. Costs

| Service | Monthly | Notes |
|---|---|---|
| Vercel Hobby | $0 | Sufficient until you have multiple wholesaler clients |
| Vercel Pro | $20 | Only needed if cron exceeds 60s or you need more bandwidth |
| Clerk | $0 | Up to 10k MAU |
| Supabase | $0 | Up to 500MB |
| Anthropic | ~$5-15 | Pay-per-call, mostly the matcher + outreach copy |
| RentCast | $0-50 | Per deal scored |
| PropertyRadar | $99 | Required for discovery |
| Twilio | $1 + per-SMS | $0.0079/SMS |
| Resend | $0 | 3k emails/mo free |
| **Total at idle** | **~$100/mo** | Breakeven at 1 wholesaler client |

---

## 12. Local development (only if you want it)

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
# open http://localhost:3000
```

The CLI scripts (`npm run score-deal`, `npm run match`, etc.) still work for ad-hoc invocations against the same Supabase DB.
