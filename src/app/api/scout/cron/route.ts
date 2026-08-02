import { NextRequest, NextResponse } from "next/server";
import { runScout } from "@/lib/scout";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel Cron endpoint (crons send GET requests). When CRON_SECRET is set in
// the environment, Vercel sends it as "Authorization: Bearer <secret>" and we
// reject anyone else — so strangers can't burn API credits by hitting the URL.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runScout();
    return NextResponse.json({
      ok: true,
      ranAt: report.ranAt,
      totalFound: report.totalFound,
      newCount: report.newCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scout run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
