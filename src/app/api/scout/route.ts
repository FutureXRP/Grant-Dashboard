import { NextResponse } from "next/server";
import { runScout, latestReport } from "@/lib/scout";

export const maxDuration = 300;

// POST = run the sweep now (hit this from cron each morning).
export async function POST() {
  try {
    const report = await runScout();
    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scout run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET = latest saved report.
export async function GET() {
  return NextResponse.json({ report: latestReport() });
}
