import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const sig = req.headers.get("x-twilio-signature") ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const valid = twilio.validateRequest(
      token,
      sig,
      url.origin + url.pathname,
      params as Record<string, string>,
    );
    if (!valid) {
      return new NextResponse("invalid signature", { status: 403 });
    }
  }

  const fromPhone = (params.From as string | undefined) ?? null;
  const text = (params.Body as string | undefined) ?? "";
  if (!fromPhone) return new NextResponse("ok", { status: 200 });

  const { data: buyer } = await supabase
    .from("buyers")
    .select("id")
    .eq("phone", fromPhone)
    .maybeSingle();
  if (!buyer) return new NextResponse("ok", { status: 200 });

  const responseType = /^y(es)?\b/i.test(text)
    ? "yes"
    : /^stop\b/i.test(text)
      ? "stop"
      : "reply";

  await supabase
    .from("outreach")
    .update({ response_at: new Date().toISOString(), response_type: responseType })
    .eq("buyer_id", buyer.id)
    .is("response_at", null)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (responseType === "stop") {
    await supabase.from("buyers").update({ active_flag: false }).eq("id", buyer.id);
  }

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "content-type": "text/xml" } },
  );
}
