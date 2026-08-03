import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { supabaseConfigured } from "@/lib/storage";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Plain-English deployment check. Visit /api/health after deploying — it says
// which backends are configured and, if the database can't be reached, shows
// the actual error message instead of a production error digest.
export async function GET() {
  const database = process.env.TURSO_DATABASE_URL ? "turso (cloud)" : "local file";
  const checks: Record<string, string> = {
    database,
    documentStorage: supabaseConfigured() ? "supabase" : "local disk",
    ai: aiConfigured() ? "configured" : "ANTHROPIC_API_KEY not set — AI agents disabled",
    cronSecret: process.env.CRON_SECRET ? "set" : "not set — /api/scout/cron is unprotected",
  };
  try {
    const row = await q.get<{ n: number }>(`SELECT COUNT(*) n FROM org_profile`);
    return NextResponse.json({
      ok: true,
      ...checks,
      databaseConnection: `ok — schema ready (org_profile rows: ${row?.n ?? 0})`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        ...checks,
        databaseConnection: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        hint:
          database === "turso (cloud)"
            ? "Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel → Settings → Environment Variables, then redeploy (env changes only apply to NEW deployments)."
            : "TURSO_DATABASE_URL is not set — on Vercel both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.",
      },
      { status: 500 }
    );
  }
}
