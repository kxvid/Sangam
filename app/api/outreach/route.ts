import { NextResponse } from "next/server";
import { sendOutreach } from "@/src/jobs/send-outreach";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.dealId) {
      return NextResponse.json({ error: "dealId required" }, { status: 400 });
    }
    const result = await sendOutreach(String(body.dealId), {
      dryRun: !!body.dryRun,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
