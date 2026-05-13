import { supabase } from "../lib/supabase.js";
import { sendSMS } from "../lib/twilio.js";
import { sendEmail } from "../lib/resend.js";
import { completeText } from "../lib/anthropic.js";
import type { Buyer, Deal } from "../types.js";

const DISCLOSURE =
  "Marketing message from KAHLA STUDIO. We are an information service, not a licensed real estate broker. We do not represent buyers or sellers in any transaction. Reply STOP to opt out.";

const DRY_RUN = process.env.DRY_RUN === "1";

function shortMoney(n: number | null): string {
  if (!n) return "?";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n / 1000)}k`;
}

// TCPA-style timing window: don't text before 8am or after 9pm local (Pacific).
function withinSendWindow(now = new Date()): boolean {
  const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const hour = pacific.getHours();
  return hour >= 8 && hour < 21;
}

async function patternReference(buyer: Buyer, deal: Deal): Promise<string> {
  const out = await completeText(
    `You are writing a 1-line SMS opener to a cash real estate buyer about a specific deal.
Buyer profile: ${JSON.stringify({
      region: buyer.primary_region,
      strategy: buyer.strategy,
      last: buyer.last_purchase_date,
      owned: buyer.total_properties_owned,
    })}
Deal: ${JSON.stringify({ beds: deal.beds, baths: deal.baths })}
Output: ONE pattern_reference phrase under 50 chars. No fluff, no greeting, no city/zip, just the reference.`,
    { maxTokens: 60 },
  );
  return out.trim().replace(/^["']|["']$/g, "").slice(0, 50);
}

async function recentlyContacted(buyerId: string): Promise<boolean> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await supabase
    .from("outreach")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", buyerId)
    .gte("sent_at", weekAgo);
  if (error) throw error;
  return (count ?? 0) >= 2; // already at 1 SMS + 1 email cap
}

async function channelCountThisWeek(
  buyerId: string,
  channel: "sms" | "email",
): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await supabase
    .from("outreach")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", buyerId)
    .eq("channel", channel)
    .gte("sent_at", weekAgo);
  if (error) throw error;
  return count ?? 0;
}

export async function sendOutreach(dealId: string) {
  if (!DRY_RUN && !withinSendWindow()) {
    console.log("Outside TCPA send window (8am-9pm Pacific). Aborting. Use DRY_RUN=1 to preview.");
    return;
  }

  const { data: deal, error: dErr } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();
  if (dErr || !deal) throw new Error(`Deal not found: ${dealId}`);
  const d = deal as Deal;

  const { data: pending, error: pErr } = await supabase
    .from("outreach")
    .select("*, buyer:buyers(*)")
    .eq("deal_id", dealId)
    .is("sent_at", null);
  if (pErr) throw pErr;

  let smsSent = 0;
  let emailSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of pending ?? []) {
    const buyer = (row as unknown as { buyer: Buyer }).buyer;

    // Anti-burnout: skip if already at this channel's weekly cap.
    if (await channelCountThisWeek(buyer.id, row.channel)) {
      skipped += 1;
      continue;
    }
    if (await recentlyContacted(buyer.id)) {
      skipped += 1;
      continue;
    }

    const firstName = (buyer.full_name ?? buyer.entity_name ?? "there").split(" ")[0];
    const ref = await patternReference(buyer, d);

    if (row.channel === "sms") {
      if (!buyer.phone) {
        errors.push(`buyer ${buyer.id}: no phone`);
        continue;
      }
      // No property address, city, or zip in SMS — only beds/baths/sqft + price math.
      const body =
        `Hey ${firstName}, ${ref}. Got a ${d.beds ?? "?"}/${d.baths ?? "?"} ${d.sqft ?? "?"}sqft CA flip, ARV ${shortMoney(d.est_arv)}, asking ${shortMoney(d.asking_price)}. Reply Y for deal sheet. - Kov, KAHLA. Reply STOP to opt out.`;
      try {
        if (!DRY_RUN) {
          await sendSMS(buyer.phone, body);
          await supabase
            .from("outreach")
            .update({ message_text: body, sent_at: new Date().toISOString() })
            .eq("id", row.id);
        } else {
          await supabase
            .from("outreach")
            .update({ message_text: `[DRY RUN] ${body}` })
            .eq("id", row.id);
        }
        smsSent += 1;
      } catch (e) {
        errors.push(`sms ${buyer.id}: ${(e as Error).message}`);
      }
    } else {
      if (!buyer.email) {
        errors.push(`buyer ${buyer.id}: no email`);
        continue;
      }
      const subject = `${d.region ?? "CA"} ${d.beds ?? "?"}/${d.baths ?? "?"} - ${shortMoney(d.asking_price)} / ARV ${shortMoney(d.est_arv)} - wholesale opportunity`;
      const text = `Hey ${firstName},\n\n${ref}.\n\nWholesale opportunity: ${d.beds}/${d.baths}, ${d.sqft} sqft in ${d.region ?? "CA"}. Asking ${shortMoney(d.asking_price)}, computed ARV ${shortMoney(d.est_arv)}, est repairs ${shortMoney(d.est_repairs)}.\n\nReply for deal sheet with full address, comps, and photos.\n\n- Kov, KAHLA STUDIO\n\n${DISCLOSURE}`;
      try {
        if (!DRY_RUN) {
          await sendEmail({ to: buyer.email, subject, html: text.replace(/\n/g, "<br>"), text });
          await supabase
            .from("outreach")
            .update({ message_text: text, sent_at: new Date().toISOString() })
            .eq("id", row.id);
        } else {
          await supabase
            .from("outreach")
            .update({ message_text: `[DRY RUN] ${text}` })
            .eq("id", row.id);
        }
        emailSent += 1;
      } catch (e) {
        errors.push(`email ${buyer.id}: ${(e as Error).message}`);
      }
    }
  }

  console.log(`OUTREACH BLAST: ${d.address}${DRY_RUN ? " (DRY RUN — no sends, no sent_at stamps)" : ""}`);
  console.log(`SMS sent: ${smsSent}`);
  console.log(`Email sent: ${emailSent}`);
  console.log(`Skipped (weekly cap): ${skipped}`);
  if (errors.length) console.log(`Errors:\n${errors.join("\n")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx src/jobs/send-outreach.ts <deal_id>");
    process.exit(1);
  }
  sendOutreach(id).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
