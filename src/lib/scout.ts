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

export type WatchSource = {
  id: number;
  name: string;
  url: string;
  kind: string;
  enabled: number;
};

export type WatchFinding = {
  source: string;
  source_url: string;
  title: string;
  deadline: string;
  details: string;
  url: string;
  isNew: boolean;
  grade?: "strong_fit" | "possible_fit" | "unlikely" | "not_eligible";
  reason?: string;
};

export type WatchResult = {
  summary: string;
  findings: WatchFinding[];
  sources: { name: string; url: string; kind: string; status: string; changed: boolean }[];
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
  watch?: WatchResult;
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
- not_eligible: title/agency signals an eligibility bar the org cannot meet — restricted to federally recognized tribes/tribal governments only (the org is Native-led but does NOT hold statutory tribal status), state-government-only, institutions of higher education, foreign entities, individuals.
IMPORTANT Native-funding nuance: do NOT auto-reject Native-focused programs. Some — notably ACF's Administration for Native Americans (ANA: SEDS, language preservation, environmental) — accept "Native nonprofit organizations" serving Native communities, which this Native-led 501(c)(3) may qualify as. Grade those possible_fit or strong_fit with a note to verify the notice's exact eligibility list; reserve not_eligible for programs explicitly limited to federally recognized tribes, tribal governments, or Urban Indian Organizations.
Each reason is ONE short sentence naming the decisive factor. Be honest: a morning report full of false positives wastes the team's time; a false "not_eligible" loses money — when the title alone cannot tell, use possible_fit and say what to check. The summary is 2-3 sentences: the morning's top picks by number and name, or "nothing new worth pursuing today".`;

export type ScoutProgress = {
  active: boolean;
  step: number;
  total: number;
  label: string;
  startedAt: string;
};

function writeProgress(p: ScoutProgress) {
  db()
    .prepare(`INSERT INTO settings (key, value) VALUES ('scout_progress', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(JSON.stringify(p));
}

export function getProgress(): ScoutProgress | null {
  const row = db().prepare(`SELECT value FROM settings WHERE key='scout_progress'`).get() as
    | { value: string }
    | undefined;
  if (!row?.value) return null;
  try {
    const p = JSON.parse(row.value) as ScoutProgress;
    // Ignore stale progress from a crashed run (>15 min old).
    if (p.active && Date.now() - new Date(p.startedAt).getTime() > 15 * 60 * 1000) return null;
    return p;
  } catch {
    return null;
  }
}

const WATCH_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          title: { type: "string" },
          deadline: { type: "string" },
          details: { type: "string" },
          url: { type: "string" },
          grade: { type: "string", enum: ["strong_fit", "possible_fit", "unlikely", "not_eligible"] },
          reason: { type: "string" },
        },
        required: ["source", "title", "deadline", "details", "url", "grade", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "items"],
  additionalProperties: false,
};

const WATCH_SYSTEM = `You read the text of state-agency and foundation web pages for a small nonprofit and extract ACTUAL funding opportunities.

Extract an item ONLY when the page announces a specific opportunity: an open or upcoming grant cycle, RFP, letter-of-inquiry window, or application period. Do NOT extract general program descriptions, past awards, "we fund these areas" boilerplate, or news items. If a page contains no actual opportunity, extract nothing from it.

For each item: title (the opportunity's name), deadline (as stated on the page, or "" if not stated), details (one sentence: what it funds and any amount shown), url (the application/details link if one appears in the text, else ""), and a grade for THIS organization:
- strong_fit: mission match and a plain 501(c)(3) in the org's service area is clearly eligible
- possible_fit: plausibly relevant, worth opening
- unlikely: open to nonprofits but poor mission/geography match
- not_eligible: the page states an eligibility bar the org cannot meet (government-only, restricted to federally recognized tribes/tribal governments only — the org is Native-led but has NO statutory tribal status, specific counties outside the service area, schools only, individuals only). Native-funding nuance: programs open to "Native nonprofit organizations serving Native communities" (e.g. ACF's Administration for Native Americans) ARE potentially available to this Native-led 501(c)(3) — grade those possible_fit or better and say what to verify
The reason is one short sentence naming the decisive factor. The summary is 1-3 sentences: what is new or approaching deadline across all pages, or "no open opportunities found on the watched pages today". Never invent deadlines or amounts not present in the text.`;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

export function listSources(): WatchSource[] {
  return db().prepare(`SELECT id, name, url, kind, enabled FROM scout_sources ORDER BY kind, name`).all() as WatchSource[];
}

export function addSource(name: string, url: string, kind: string) {
  db().prepare(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`).run(name, url, kind);
}

export function deleteSource(id: number) {
  db().prepare(`DELETE FROM scout_sources WHERE id=?`).run(id);
}

export function toggleSource(id: number) {
  db().prepare(`UPDATE scout_sources SET enabled = 1 - enabled WHERE id=?`).run(id);
}

async function runWatch(errors: string[], tick: (label: string) => void): Promise<WatchResult> {
  const d = db();
  const sources = d
    .prepare(`SELECT * FROM scout_sources WHERE enabled=1 ORDER BY kind, name`)
    .all() as (WatchSource & { last_hash: string })[];
  const statuses: WatchResult["sources"] = [];
  const pages: { source: WatchSource & { last_hash: string }; text: string; changed: boolean }[] = [];

  for (const src of sources) {
    tick(`Reading ${src.name}…`);
    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0 (GrantCopilot nonprofit grant scout)" },
        signal: AbortSignal.timeout(20000),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = stripHtml(await res.text()).slice(0, 12000);
      const hash = hashText(text);
      const changed = Boolean(src.last_hash) && src.last_hash !== hash;
      d.prepare(`UPDATE scout_sources SET last_hash=?, last_checked=datetime('now') WHERE id=?`).run(hash, src.id);
      pages.push({ source: src, text, changed });
      statuses.push({ name: src.name, url: src.url, kind: src.kind, status: "ok", changed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      statuses.push({ name: src.name, url: src.url, kind: src.kind, status: msg, changed: false });
    }
  }

  let findings: WatchFinding[] = [];
  let summary = "";
  if (pages.length === 0) {
    summary = "No watched pages could be fetched.";
  } else if (!aiConfigured()) {
    summary = "Pages fetched, but ANTHROPIC_API_KEY is not set — no extraction/grading.";
  } else {
    tick("AI is reading the watched pages for opportunities…");
    try {
      const profile = d.prepare(`SELECT * FROM org_profile WHERE id=1`).get() as {
        name: string; legal_status: string; service_area: string; programs: string; populations: string;
      };
      const body = pages
        .map(
          (p) =>
            `=== SOURCE: ${p.source.name} | ${p.source.url} | ${p.changed ? "CHANGED since last check" : "unchanged"} ===\n${p.text}`
        )
        .join("\n\n");
      const client = new Anthropic();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: "text", text: WATCH_SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { format: { type: "json_schema", schema: WATCH_SCHEMA } },
        messages: [
          {
            role: "user",
            content: `Organization: ${profile.name} (${profile.legal_status}). Service area: ${profile.service_area}. Programs: ${profile.programs}. Populations: ${profile.populations}.\n\n${body}`,
          },
        ],
      });
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      if (text) {
        const parsed = JSON.parse(text) as { summary: string; items: Omit<WatchFinding, "isNew" | "source_url">[] };
        summary = parsed.summary;
        const urlByName = new Map(sources.map((s) => [s.name, s.url]));
        const seen = new Set(
          (d.prepare(`SELECT number FROM scout_seen`).all() as { number: string }[]).map((r) => r.number)
        );
        const insSeen = d.prepare(`INSERT OR IGNORE INTO scout_seen (number) VALUES (?)`);
        findings = parsed.items.map((item) => {
          const key = "watch:" + hashText(`${item.source}|${item.title}`.toLowerCase());
          const isNew = !seen.has(key);
          insSeen.run(key);
          return { ...item, source_url: urlByName.get(item.source) ?? "", isNew };
        });
      }
    } catch (e) {
      errors.push(`Watch extraction failed: ${e instanceof Error ? e.message : "unknown error"}`);
      summary = "Pages fetched, but AI extraction failed — see errors.";
    }
  }

  const order = { strong_fit: 0, possible_fit: 1, unlikely: 2, not_eligible: 3 } as const;
  findings.sort(
    (a, b) => (a.grade ? order[a.grade] : 4) - (b.grade ? order[b.grade] : 4) || Number(b.isNew) - Number(a.isNew)
  );
  return { summary, findings, sources: statuses };
}

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

  // Progress tracking: one step per keyword search, one per watched page,
  // plus one for each of the two AI grading passes.
  const sourceCount = (
    d.prepare(`SELECT COUNT(*) n FROM scout_sources WHERE enabled=1`).get() as { n: number }
  ).n;
  const total = keywords.length + 1 + sourceCount + 1;
  const startedAt = new Date().toISOString();
  let step = 0;
  const tick = (label: string) => {
    step = Math.min(step + 1, total);
    writeProgress({ active: true, step, total, label, startedAt });
  };

  try {

  for (const kw of keywords) {
    tick(`Searching Grants.gov: “${kw}”…`);
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
  tick("AI is grading federal results against your profile…");
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

  // State, foundation, and Native-funder page watch.
  const watch = await runWatch(errors, tick);

  const report: ScoutReport = {
    ranAt: new Date().toISOString(),
    keywords,
    totalFound: hits.length,
    newCount: hits.filter((h) => h.isNew).length,
    graded,
    summary,
    hits,
    errors,
    watch,
  };
  d.prepare(`INSERT INTO scout_reports (report) VALUES (?)`).run(JSON.stringify(report));
  // Keep the last 30 reports.
  d.prepare(
    `DELETE FROM scout_reports WHERE id NOT IN (SELECT id FROM scout_reports ORDER BY id DESC LIMIT 30)`
  ).run();
  return report;

  } finally {
    writeProgress({ active: false, step: total, total, label: "done", startedAt });
  }
}

export function latestReport(): ScoutReport | null {
  const row = db().prepare(`SELECT report FROM scout_reports ORDER BY id DESC LIMIT 1`).get() as
    | { report: string }
    | undefined;
  return row ? (JSON.parse(row.report) as ScoutReport) : null;
}
