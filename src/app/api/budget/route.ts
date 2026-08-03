import { NextRequest, NextResponse } from "next/server";
import { getBudget, saveBudget, computeTotals, syncBudgetTotals, type Budget } from "@/lib/budget";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("opportunityId"));
  if (!id) return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  const budget = await getBudget(id);
  return NextResponse.json({ budget, totals: computeTotals(budget) });
}

export async function POST(req: NextRequest) {
  let body: { opportunityId?: number; budget?: Budget; syncTotals?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = Number(body.opportunityId);
  if (!id || !body.budget) {
    return NextResponse.json({ error: "opportunityId and budget required" }, { status: 400 });
  }
  // Sanitize: keep only known fields, coerce numbers.
  const clean: Budget = {
    lines: (body.budget.lines ?? []).slice(0, 200).map((l) => ({
      id: String(l.id ?? Math.random().toString(36).slice(2)),
      category: l.category,
      description: String(l.description ?? "").slice(0, 500),
      qty: Number(l.qty) || 0,
      rate: Number(l.rate) || 0,
      requested: Math.max(0, Math.round(Number(l.requested) || 0)),
      match: Math.max(0, Math.round(Number(l.match) || 0)),
      note: String(l.note ?? "").slice(0, 1000),
    })),
    indirectRatePct: Math.max(0, Math.min(100, Number(body.budget.indirectRatePct) || 0)),
    indirectExcludeEquipment: Boolean(body.budget.indirectExcludeEquipment),
    indirectNote: String(body.budget.indirectNote ?? "").slice(0, 300),
  };
  await saveBudget(id, clean);
  const totals = body.syncTotals ? await syncBudgetTotals(id, clean) : computeTotals(clean);
  return NextResponse.json({ ok: true, totals, synced: Boolean(body.syncTotals) });
}
