import { NextRequest, NextResponse } from "next/server";
import { searchFederal, searchKindora, searchGranted, type SearchRow } from "@/lib/grantsearch";
import { q } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

export async function POST(req: NextRequest) {
  let body: { keyword?: string; sources?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const keyword = String(body.keyword || "").slice(0, 200).trim();
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });
  const wanted = new Set(body.sources?.length ? body.sources : ["federal", "kindora", "granted"]);

  const jobs: Promise<SearchRow[]>[] = [];
  const labels: string[] = [];
  if (wanted.has("federal")) { jobs.push(searchFederal(keyword)); labels.push("Grants.gov"); }
  if (wanted.has("kindora")) { jobs.push(searchKindora(keyword)); labels.push("Kindora"); }
  if (wanted.has("granted")) { jobs.push(searchGranted(keyword)); labels.push("Granted"); }

  const settled = await Promise.allSettled(jobs);
  const rows: SearchRow[] = [];
  const errors: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") rows.push(...s.value);
    else errors.push(`${labels[i]}: ${s.reason instanceof Error ? s.reason.message : "failed"}`);
  });

  // Badge rows whose funder is already in the dashboard's funder list.
  try {
    const funders = await q.all<{ name: string }>(`SELECT name FROM funders`);
    const keys = funders.map((f) => nameKey(f.name)).filter((k) => k.length > 5);
    for (const r of rows) {
      const fk = nameKey(r.funder);
      if (fk.length > 5) r.tracked = keys.some((k) => k.includes(fk) || fk.includes(k));
    }
  } catch { /* badge is best-effort */ }

  // De-dupe near-identical rows across sources (same title+funder).
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const k = nameKey(r.title) + "|" + nameKey(r.funder);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return NextResponse.json({ rows: deduped, errors });
}
