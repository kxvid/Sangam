import { supabase } from "../lib/supabase";
import { sendSMS } from "../lib/twilio";
import { sendEmail } from "../lib/resend";
import { completeText } from "../lib/anthropic";
import type { Buyer, Deal } from "../types";

const DISCLOSURE =
  "Marketing message from KAHLA STUDIO. We are an information service, not a licensed real estate broker. We do not represent buyers or sellers in any transaction. Reply STOP to opt out.";

export type SendOutreachOpts = { dryRun?: boolean; skipWindow?: boolean };
export type SendOutreachResult = {
  deal: Deal;
  smsSent: number;
  emailSent: number;
  skipped: number;
  errors: string[];
  dryRun: boolean;
};

function shortMoney(n: number | null | undefined): string {
  if (!n) return "?";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n / 1000)}k`;
}

function withinSendWindow(now = new Date()): boolean {
  const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const hour = pacific.getHours();
  return hour >= 8 && hour < 21;
}

async function patternReference(buyer: Buyer, deal: Deal): Promise<string> {
  try {
    const out = await completeText(
      `You are writing a 1-line SMS opener to a cash real estate buyer about a specific deal.
Buyer profile: ${JSON.stringify({
        region: buyer.primary_region,
        strategy: buyer.strategy,
        last: buyer.last_purchase_date,
        owned: buyer.total_properties_owned,
      })}
Deal: ${JSON.stringify({ beds: deal.beds, baths: deal.baths })}
Output: ONE phrase under 50 chars. No greeting, no city/zip, no quotes.`,
      { maxTokens: 60 },
    );
    return out.trim().replace(/^["']|["']$/g, "").slice(0, 50);
  } catch {
    return "saw you're active in CA";
  }
}

async function channelCountThisWeek(buyerId: string, channel: "sms" | "email"): Promise<number> {
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

export async function sendOutreach(
  dealId: string,
  opts: SendOutreachOpts = {},
): Promise<SendOutreachResult> {
  const dryRun = !!opts.dryRun;

  const { data: deal, error: dErr } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();
  if (dErr || !deal) throw new Error(`Deal not found: ${dealId}`);
  const d = deal as Deal;

  if (!dryRun && !opts.skipWindow && !withinSendWindow()) {
    throw new Error("Outside TCPA send window (8am-9pm Pacific). Use dry run to preview.");
  }

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

    if ((await channelCountThisWeek(buyer.id, row.channel)) > 0) {
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
      const body = `Hey ${firstName}, ${ref}. Got a ${d.beds ?? "?"}/${d.baths ?? "?"} ${d.sqft ?? "?"}sqft CA flip, ARV ${shortMoney(d.est_arv)}, asking ${shortMoney(d.asking_price)}. Reply Y for deal sheet. - Kov, KAHLA. Reply STOP to opt out.`;
      try {
        if (!dryRun) {
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
        if (!dryRun) {
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

  return { deal: d, smsSent, emailSent, skipped, errors, dryRun };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx src/jobs/send-outreach.ts <deal_id>");
    process.exit(1);
  }
  sendOutreach(id, { dryRun: process.env.DRY_RUN === "1" })
    .then((r) => {
      console.log(`OUTREACH: ${r.deal.address}${r.dryRun ? " (DRY RUN)" : ""}`);
      console.log(`SMS sent: ${r.smsSent}`);
      console.log(`Email sent: ${r.emailSent}`);
      console.log(`Skipped: ${r.skipped}`);
      if (r.errors.length) console.log(`Errors:\n${r.errors.join("\n")}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
