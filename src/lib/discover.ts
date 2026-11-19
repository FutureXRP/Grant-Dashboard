import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { hashText, deadlinePassed } from "./scout";
import { TARGETING } from "./targeting";
import { aiConfigured } from "./ai";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// Deep Discovery: the "human researcher" channel. The daily scout can only
// find what's in its two boxes (Grants.gov keywords + the watched-page list);
// this sweep gives the AI live web search so it can hunt like a person does —
// corporate giving programs, quasi-public funders like TSET, foundation cycles
// — and propose new pages for the watch list. On-demand only (never on cron):
// each run costs real API money, so it runs when a human clicks the button.

export type DiscoveryItem = {
  key: string;
  funder: string;
  program: string;
  url: string;
  deadline: string;
  amount: string;
  kind: "corporate" | "foundation" | "state" | "federal" | "native" | "other";
  grade: "strong_fit" | "possible_fit";
  reason: string;
  next_step: string;
  watch_url: string; // page worth adding to the watch list ("" if none)
};

export type DiscoveryReport = {
  ranAt: string;
  summary: string;
  items: DiscoveryItem[];
  searchesUsed: number;
};

const PARSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          funder: { type: "string" },
          program: { type: "string" },
          url: { type: "string" },
          deadline: { type: "string" },
          amount: { type: "string" },
          kind: { type: "string", enum: ["corporate", "foundation", "state", "federal", "native", "other"] },
          grade: { type: "string", enum: ["strong_fit", "possible_fit"] },
          reason: { type: "string" },
          next_step: { type: "string" },
          watch_url: { type: "string" },
        },
        required: ["funder", "program", "url", "deadline", "amount", "kind", "grade", "reason", "next_step", "watch_url"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "items"],
  additionalProperties: false,
};

const RESEARCH_SYSTEM = `You are a grant prospect researcher for a small nonprofit, doing the kind of hunting a resourceful development director does by hand: corporate giving programs (retailers, utilities, banks, telecoms with local presence), quasi-public funders, family foundations, and state programs — NOT just federal notices.

${TARGETING}

Method:
- Use web search strategically (you have a limited number of searches). Prioritize funder types the organization's current watch list misses, and funders ACTIVE in the organization's specific geography.
- For each promising lead, confirm from search results: the program's name, what it funds, award size if stated, the current/next application window if stated, and the application URL.
- NEVER invent deadlines or amounts — write "not stated" when the search results don't show one. Skip anything whose application window has clearly passed.
- Report only genuine fits: the funder must plausibly fund this org's type of work in this org's geography. 8–15 findings beats 30 weak ones. Exclude funders the org already tracks (list provided) unless you found a SPECIFIC NEW program or cycle they likely don't know about.
- For each finding, note the single page on the funder's site that announces opportunities — that becomes a candidate for the org's automated watch list.
- End with a short summary: the 2–3 best leads and why.`;

export type DiscoveryProgress = {
  active: boolean;
  label: string;
  startedAt: string;
};

async function writeDiscoveryProgress(p: DiscoveryProgress) {
  await q.run(
    `INSERT INTO settings (key, value) VALUES ('discovery_progress', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [JSON.stringify(p)]
  );
}

export async function getDiscoveryProgress(): Promise<DiscoveryProgress | null> {
  const row = await q.get<{ value: string }>(`SELECT value FROM settings WHERE key='discovery_progress'`);
  if (!row?.value) return null;
  try {
    const p = JSON.parse(row.value) as DiscoveryProgress;
    // A run killed by the host never clears its progress — ignore stale state
    // (Vercel caps the run at 5 minutes, so 6 is definitely dead).
    if (p.active && Date.now() - new Date(p.startedAt).getTime() > 6 * 60 * 1000) return null;
    return p;
  } catch {
    return null;
  }
}

export async function runDiscovery(): Promise<DiscoveryReport> {
  if (!aiConfigured()) throw new Error("ANTHROPIC_API_KEY is not set.");
  const startedAt = new Date().toISOString();
  const tick = (label: string) => writeDiscoveryProgress({ active: true, label, startedAt });
  try {
  const profile = (await q.get<{
    name: string; legal_status: string; mission: string; programs: string;
    service_area: string; populations: string;
  }>(`SELECT * FROM org_profile WHERE id=1`))!;
  const knownFunders = await q.all<{ name: string }>(`SELECT name FROM funders ORDER BY name`);
  const watched = await q.all<{ name: string }>(`SELECT name FROM scout_sources ORDER BY name`);

  const brief = `# Organization
${profile.name} (${profile.legal_status})
Mission: ${profile.mission}
Programs: ${profile.programs}
Service area: ${profile.service_area}
Populations: ${profile.populations}

# Funders already tracked (don't re-report unless you find a specific new program/cycle)
${knownFunders.map((f) => f.name).join("; ")}

# Pages already watched automatically
${watched.map((s) => s.name).join("; ")}

Research grant opportunities this organization is likely missing. Today's date: ${new Date().toDateString()}.`;

  const client = new Anthropic();

  // Step 1 — research with live web search. Server tools may pause the turn;
  // continue until the model finishes (bounded).
  let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: brief }];
  let searchesUsed = 0;
  let researchText = "";
  for (let i = 0; i < 3; i++) {
    await tick(i === 0 ? "Searching the web for funders…" : `Continuing research (round ${i + 1})…`);
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
      messages,
    });
    searchesUsed += response.usage.server_tool_use?.web_search_requests ?? 0;
    researchText += response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (response.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: response.content }];
  }
  if (!researchText.trim()) throw new Error("Research step returned no text.");

  // Step 2 — parse the research into structured findings (no tools, so the
  // JSON-schema output constraint applies cleanly).
  await tick("Organizing and grading the findings…");
  const parseResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      "Convert the researcher's notes into structured data, faithfully. Keep only findings with a named funder and program. Use \"not stated\" for missing deadlines/amounts — never fill gaps with guesses. watch_url is the funder page that announces opportunities, or \"\".",
    output_config: { format: { type: "json_schema", schema: PARSE_SCHEMA } },
    messages: [{ role: "user", content: researchText }],
  });
  const text = parseResponse.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("Parse step returned no text.");
  const parsed = JSON.parse(text) as { summary: string; items: Omit<DiscoveryItem, "key">[] };

  const report: DiscoveryReport = {
    ranAt: new Date().toISOString(),
    summary: parsed.summary,
    searchesUsed,
    items: parsed.items.map((item) => ({
      ...item,
      key: "discover:" + hashText(`${item.funder}|${item.program}`.toLowerCase()),
    })),
  };
  await q.run(
    `INSERT INTO settings (key, value) VALUES ('discovery_report', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [JSON.stringify(report)]
  );
  return report;

  } finally {
    await writeDiscoveryProgress({ active: false, label: "done", startedAt });
  }
}

// Latest stored report with dismissed items filtered out.
export async function latestDiscovery(): Promise<DiscoveryReport | null> {
  const row = await q.get<{ value: string }>(`SELECT value FROM settings WHERE key='discovery_report'`);
  if (!row?.value) return null;
  try {
    const report = JSON.parse(row.value) as DiscoveryReport;
    const dismissed = new Set(
      (await q.all<{ key: string }>(`SELECT key FROM scout_dismissed`)).map((r) => r.key)
    );
    // Same read-time rules as the scout report: dismissed leads never return,
    // and a lead whose stated deadline has passed leaves the page on its own.
    report.items = (report.items ?? []).filter((i) => !dismissed.has(i.key) && !deadlinePassed(i.deadline));
    return report;
  } catch {
    return null;
  }
}
