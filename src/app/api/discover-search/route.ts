import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchFederal, searchKindora, searchGranted, type SearchRow } from "@/lib/grantsearch";
import { getExcludes } from "@/lib/scout";
import { isExcluded, TARGETING, LANE_KEYS } from "@/lib/targeting";
import { aiConfigured } from "@/lib/ai";
import { q } from "@/lib/db";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

const GRADE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    grades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "number", description: "The result's number from the list" },
          grade: { type: "string", enum: ["strong_fit", "possible_fit", "unlikely", "not_eligible"] },
          lane: { type: "string", enum: LANE_KEYS },
          reason: { type: "string", description: "One short sentence" },
        },
        required: ["i", "grade", "lane", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["grades"],
  additionalProperties: false,
};

export async function POST(req: NextRequest) {
  let body: { action?: string; keyword?: string; sources?: string[]; rows?: SearchRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ---- optional AI pass: grade a result set against the targeting rule ----
  if (body.action === "grade") {
    if (!aiConfigured()) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
    }
    const rows = (body.rows ?? []).slice(0, 60);
    if (rows.length === 0) return NextResponse.json({ error: "No rows to grade" }, { status: 400 });
    try {
      const client = new Anthropic();
      const listing = rows
        .map(
          (r, i) =>
            `${i}. ${r.title} — ${r.funder}${r.deadline ? ` (deadline: ${r.deadline})` : ""}${r.amount ? ` (amount: ${r.amount})` : ""}${r.description ? `\n   ${r.description.slice(0, 200)}` : ""}`
        )
        .join("\n");
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [
          {
            type: "text",
            text: `${TARGETING}\n\nYou grade live search results for this organization. Grade EVERY numbered result: strong_fit / possible_fit / unlikely / not_eligible, with the single best-fitting service lane and one short reason. Research awards, fellowships, clinical programs, government-agency-only programs, and other-geography programs are not_eligible.`,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } },
        messages: [{ role: "user", content: `# Search results to grade\n${listing}\n\nGrade every result.` }],
      });
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      if (!text) throw new Error("Empty grading response");
      const parsed = JSON.parse(text) as { grades: { i: number; grade: string; lane: string; reason: string }[] };
      return NextResponse.json({ grades: parsed.grades });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Grading failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ---- the live multi-source search ----
  const keyword = String(body.keyword || "").slice(0, 200).trim();
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });
  const wanted = new Set(body.sources?.length ? body.sources : ["federal", "kindora", "granted"]);

  const jobs: Promise<SearchRow[]>[] = [];
  const labels: string[] = [];
  if (wanted.has("federal")) { jobs.push(searchFederal(keyword)); labels.push("Grants.gov"); }
  if (wanted.has("kindora")) { jobs.push(searchKindora(keyword)); labels.push("Kindora"); }
  if (wanted.has("granted")) { jobs.push(searchGranted(keyword)); labels.push("Granted"); }

  const settled = await Promise.allSettled(jobs);
  let rows: SearchRow[] = [];
  const errors: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") rows.push(...s.value);
    else errors.push(`${labels[i]}: ${s.reason instanceof Error ? s.reason.message : "failed"}`);
  });

  // The scout's editable exclude-word list drops the obvious junk that loose
  // keyword matching lets through ("walking track" → "Science Track Award").
  try {
    const excludes = await getExcludes();
    rows = rows.filter((r) => !isExcluded(r.title, r.funder, excludes) && !isExcluded(r.description, "", excludes));
  } catch { /* filter is best-effort */ }

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
