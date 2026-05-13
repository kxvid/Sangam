import { NextResponse } from "next/server";
import { scoreDeal } from "@/src/jobs/score-deal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.address || !body.askingPrice) {
      return NextResponse.json({ error: "address and askingPrice required" }, { status: 400 });
    }
    const result = await scoreDeal({
      address: String(body.address),
      askingPrice: Number(body.askingPrice),
      claimedArv: body.claimedArv ? Number(body.claimedArv) : undefined,
      repairTier: body.repairTier ?? "gut",
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
