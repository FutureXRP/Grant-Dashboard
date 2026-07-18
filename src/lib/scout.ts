import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { aiConfigured } from "./ai";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export type ScoutHit = {
  number: string;
  title: string;
  agency: string;
  openDate: string;
  closeDate: string;
  status: string;
  url: string;
  keyword: string;
  isNew: boolean;
  grade?: "strong_fit" | "possible_fit" | "unlikely" | "not_eligible";
  reason?: string;
};

export type ScoutReport = {
  ranAt: string;
  keywords: string[];
  totalFound: number;
  newCount: number;
  graded: boolean;
  summary: string;
  hits: ScoutHit[];
  errors: string[];
};

const GRADE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "string" },
          grade: { type: "string", enum: ["strong_fit", "possible_fit", "unlikely", "not_eligible"] },
          reason: { type: "string" },
        },
        required: ["number", "grade", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "items"],
  additionalProperties: false,
};

const SCOUT_SYSTEM = `You grade federal funding opportunities for a small nonprofit, from titles and agency names only (full notices are not fetched at this stage). Grades:
- strong_fit: squarely matches the organization's programs AND a plain 501(c)(3) is almost certainly eligible.
- possible_fit: plausibly relevant; worth opening the notice.
- unlikely: technically open to nonprofits but a poor mission match or almost certainly out of reach (e.g. research-institution programs).
- not_eligible: title/agency signals an eligibility bar the org cannot meet — tribal-government-only (the org is Native-led but does NOT hold statutory tribal status), state-government-only, institutions of higher education, foreign entities, individuals.
Each reason is ONE short sentence naming the decisive factor. Be honest: a morning report full of false positives wastes the team's time; a false "not_eligible" loses money — when the title alone cannot tell, use possible_fit and say what to check. The summary is 2-3 sentences: the morning's top picks by number and name, or "nothing new worth pursuing today".`;

export function getKeywords(): string[] {
  const row = db().prepare(`SELECT value FROM settings WHERE key='scout_keywords'`).get() as
    | { value: string }
    | undefined;
  return (row?.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
}

export function setKeywords(keywords: string) {
  db()
    .prepare(`INSERT INTO settings (key, value) VALUES ('scout_keywords', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(keywords);
}

async function searchGrantsGov(keyword: string): Promise<Omit<ScoutHit, "keyword" | "isNew">[]> {
  const res = await fetch("https://api.grants.gov/v1/api/search2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, rows: 25, oppStatuses: "forecasted|posted" }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Grants.gov returned ${res.status} for "${keyword}"`);
  const data = await res.json();
  type Hit = {
    id?: string | number; number?: string; title?: string; agencyName?: string;
    agency?: string; openDate?: string; closeDate?: string; oppStatus?: string;
  };
  const hits: Hit[] = data?.data?.oppHits ?? [];
  return hits
    .filter((h) => h.number && h.title)
    .map((h) => ({
      number: String(h.number),
      title: h.title ?? "",
      agency: h.agencyName ?? h.agency ?? "",
      openDate: h.openDate ?? "",
      closeDate: h.closeDate ?? "",
      status: h.oppStatus ?? "",
      url: h.id ? `https://www.grants.gov/search-results-detail/${h.id}` : "",
    }));
}

export async function runScout(): Promise<ScoutReport> {
  const d = db();
  const keywords = getKeywords();
  const errors: string[] = [];
  const byNumber = new Map<string, ScoutHit>();

  for (const kw of keywords) {
    try {
      const results = await searchGrantsGov(kw);
      for (const r of results) {
        if (!byNumber.has(r.number)) {
          byNumber.set(r.number, { ...r, keyword: kw, isNew: false });
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `Search failed for "${kw}"`);
    }
  }

  // Skip anything whose deadline already passed.
  const now = Date.now();
  const hits = Array.from(byNumber.values()).filter((h) => {
    const m = h.closeDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return true; // forecasted / no date yet — keep
    return new Date(`${m[3]}-${m[1]}-${m[2]}T23:59:59`).getTime() >= now;
  });

  // Mark new vs. previously seen, then record all as seen.
  const seen = new Set(
    (d.prepare(`SELECT number FROM scout_seen`).all() as { number: string }[]).map((r) => r.number)
  );
  for (const h of hits) h.isNew = !seen.has(h.number);
  const insSeen = d.prepare(`INSERT OR IGNORE INTO scout_seen (number) VALUES (?)`);
  for (const h of hits) insSeen.run(h.number);

  let summary = "";
  let graded = false;
  if (aiConfigured() && hits.length > 0) {
    try {
      const profile = d.prepare(`SELECT * FROM org_profile WHERE id=1`).get() as {
        name: string; legal_status: string; service_area: string; programs: string; populations: string;
      };
      const list = hits
        .slice(0, 100)
        .map((h) => `${h.number} | ${h.agency} | ${h.title} | closes ${h.closeDate || "TBD"}${h.isNew ? " | NEW today" : ""}`)
        .join("\n");
      const client = new Anthropic();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: "text", text: SCOUT_SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } },
        messages: [
          {
            role: "user",
            content: `Organization: ${profile.name} (${profile.legal_status}). Service area: ${profile.service_area}. Programs: ${profile.programs}. Populations: ${profile.populations}.\n\nGrade every opportunity:\n${list}`,
          },
        ],
      });
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      if (text) {
        const parsed = JSON.parse(text) as {
          summary: string;
          items: { number: string; grade: ScoutHit["grade"]; reason: string }[];
        };
        const gradeByNumber = new Map(parsed.items.map((i) => [i.number, i]));
        for (const h of hits) {
          const g = gradeByNumber.get(h.number);
          if (g) {
            h.grade = g.grade;
            h.reason = g.reason;
          }
        }
        summary = parsed.summary;
        graded = true;
      }
    } catch (e) {
      errors.push(`Grading failed: ${e instanceof Error ? e.message : "unknown error"} — showing ungraded results.`);
    }
  } else if (!aiConfigured()) {
    summary = "ANTHROPIC_API_KEY not set — results are ungraded. Add the key to get eligibility grading.";
  }

  const order = { strong_fit: 0, possible_fit: 1, unlikely: 2, not_eligible: 3 } as const;
  hits.sort(
    (a, b) =>
      (a.grade ? order[a.grade] : 4) - (b.grade ? order[b.grade] : 4) ||
      Number(b.isNew) - Number(a.isNew)
  );

  const report: ScoutReport = {
    ranAt: new Date().toISOString(),
    keywords,
    totalFound: hits.length,
    newCount: hits.filter((h) => h.isNew).length,
    graded,
    summary,
    hits,
    errors,
  };
  d.prepare(`INSERT INTO scout_reports (report) VALUES (?)`).run(JSON.stringify(report));
  // Keep the last 30 reports.
  d.prepare(
    `DELETE FROM scout_reports WHERE id NOT IN (SELECT id FROM scout_reports ORDER BY id DESC LIMIT 30)`
  ).run();
  return report;
}

export function latestReport(): ScoutReport | null {
  const row = db().prepare(`SELECT report FROM scout_reports ORDER BY id DESC LIMIT 1`).get() as
    | { report: string }
    | undefined;
  return row ? (JSON.parse(row.report) as ScoutReport) : null;
}
