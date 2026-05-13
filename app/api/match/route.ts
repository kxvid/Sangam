import { NextResponse } from "next/server";
import { matchBuyers } from "@/src/jobs/match-buyers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.dealId) {
      return NextResponse.json({ error: "dealId required" }, { status: 400 });
    }
    const result = await matchBuyers(String(body.dealId));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
