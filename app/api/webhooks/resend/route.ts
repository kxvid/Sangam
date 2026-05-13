import { NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabase";

export const runtime = "nodejs";

// Resend posts JSON events. We care about "email.opened", "email.clicked",
// and "email.bounced" for now. Inbound replies require a separate inbound
// route (Resend Inbound) that is opt-in; if you wire that, parse `from` and
// match the buyer by email.

export async function POST(req: Request) {
  const secret = req.headers.get("resend-signature");
  if (process.env.RESEND_WEBHOOK_SECRET && secret !== process.env.RESEND_WEBHOOK_SECRET) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const event = await req.json().catch(() => null);
  if (!event?.type) return NextResponse.json({ ok: true });

  const toEmail: string | undefined =
    event.data?.to?.[0] ?? event.data?.from ?? event.data?.email;
  if (!toEmail) return NextResponse.json({ ok: true });

  const { data: buyer } = await supabase
    .from("buyers")
    .select("id")
    .eq("email", toEmail)
    .maybeSingle();
  if (!buyer) return NextResponse.json({ ok: true });

  if (event.type === "email.opened" || event.type === "email.clicked") {
    await supabase
      .from("outreach")
      .update({
        response_at: new Date().toISOString(),
        response_type: event.type === "email.clicked" ? "click" : "open",
      })
      .eq("buyer_id", buyer.id)
      .is("response_at", null)
      .order("sent_at", { ascending: false })
      .limit(1);
  }

  if (event.type === "email.bounced") {
    await supabase.from("buyers").update({ active_flag: false }).eq("id", buyer.id);
  }

  return NextResponse.json({ ok: true });
}
