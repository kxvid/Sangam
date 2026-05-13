import { NextResponse } from "next/server";
import { runDiscovery } from "@/src/jobs/nightly-discovery";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  // Vercel Cron sends a signed Authorization header on Pro plan. On Hobby,
  // we fall back to a shared CRON_SECRET header.
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (process.env.CRON_SECRET && auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDiscovery();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
