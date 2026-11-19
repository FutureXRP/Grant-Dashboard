import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { hashText, deadlinePassed } from "./scout";
import { TARGETING, LANE_KEYS } from "./targeting";
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
  lane?: string;
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
          lane: { type: "string", enum: LANE_KEYS },
        },
        required: ["funder", "program", "url", "deadline", "amount", "kind", "grade", "reason", "next_step", "watch_url", "lane"],
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

// ---- Stepwise research: one bounded model call per HTTP request ----
//
// A full research run (several web-search rounds + parsing) regularly exceeds
// Vercel's 300-second function cap, which killed runs mid-flight. So the run
// is split into STEPS: each HTTP request makes exactly one model call (capped
// searches), persists the conversation state, and returns; the browser calls
// step after step until the model finishes, then the final step parses and
// stores the report. Each step finishes comfortably inside the cap.

type DiscoveryState = {
  startedAt: string;
  round: number;
  searchesUsed: number;
  researchText: string;
  messages: Anthropic.Beta.BetaMessageParam[];
};

const MAX_ROUNDS = 4;

async function loadState(): Promise<DiscoveryState | null> {
  const row = await q.get<{ value: string }>(`SELECT value FROM settings WHERE key='discovery_state'`);
  if (!row?.value) return null;
  try {
    const st = JSON.parse(row.value) as DiscoveryState;
    // Abandoned runs go stale; start fresh after 15 minutes.
    if (Date.now() - new Date(st.startedAt).getTime() > 15 * 60 * 1000) return null;
    return st;
  } catch {
    return null;
  }
}

async function saveState(st: DiscoveryState | null): Promise<void> {
  if (st === null) {
    await q.run(`DELETE FROM settings WHERE key='discovery_state'`);
    return;
  }
  await q.run(
    `INSERT INTO settings (key, value) VALUES ('discovery_state', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [JSON.stringify(st)]
  );
}

async function initState(): Promise<DiscoveryState> {
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
  return {
    startedAt: new Date().toISOString(),
    round: 0,
    searchesUsed: 0,
    researchText: "",
    messages: [{ role: "user", content: brief }],
  };
}

export type DiscoveryStepResult =
  | { done: false; round: number; searchesUsed: number }
  | { done: true; report: DiscoveryReport };

export async function discoveryStep(reset: boolean): Promise<DiscoveryStepResult> {
  if (!aiConfigured()) throw new Error("ANTHROPIC_API_KEY is not set.");
  let state = reset ? null : await loadState();
  if (!state) state = await initState();
  const tick = (label: string) =>
    writeDiscoveryProgress({ active: true, label, startedAt: state!.startedAt });

  try {
    state.round += 1;
    await tick(
      state.round === 1
        ? "Searching the web for funders…"
        : `Research round ${state.round} (${state.searchesUsed} searches so far)…`
    );
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: "text", text: RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      messages: state.messages,
    });
    state.searchesUsed += response.usage.server_tool_use?.web_search_requests ?? 0;
    state.researchText += response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (response.stop_reason === "pause_turn" && state.round < MAX_ROUNDS) {
      state.messages = [...state.messages, { role: "assistant", content: response.content }];
      await saveState(state);
      await tick(`Research round ${state.round} done — continuing…`);
      return { done: false, round: state.round, searchesUsed: state.searchesUsed };
    }

    // Final step: parse the accumulated notes into structured findings.
    if (!state.researchText.trim()) throw new Error("Research returned no text.");
    await tick("Organizing and grading the findings…");
    const parseResponse = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system:
        "Convert the researcher's notes into structured data, faithfully. Keep only findings with a named funder and program. Use \"not stated\" for missing deadlines/amounts — never fill gaps with guesses. If a note says a cycle is closed but recurs, the deadline field carries the NEXT-cycle expectation text, never a past date. watch_url is the funder page that announces opportunities, or \"\".",
      output_config: { format: { type: "json_schema", schema: PARSE_SCHEMA } },
      messages: [{ role: "user", content: state.researchText }],
    });
    const text = parseResponse.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) throw new Error("Parse step returned no text.");
    const parsed = JSON.parse(text) as { summary: string; items: Omit<DiscoveryItem, "key">[] };

    const report: DiscoveryReport = {
      ranAt: new Date().toISOString(),
      summary: parsed.summary,
      searchesUsed: state.searchesUsed,
      items: parsed.items.map((item) => ({
        ...item,
        key: "discover:" + hashText(`${item.funder}|${item.program}`.toLowerCase()),
      })),
    };
    await q.run(
      `INSERT INTO settings (key, value) VALUES ('discovery_report', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [JSON.stringify(report)]
    );
    await saveState(null);
    await writeDiscoveryProgress({ active: false, label: "done", startedAt: state.startedAt });
    return { done: true, report };
  } catch (e) {
    await writeDiscoveryProgress({ active: false, label: "failed", startedAt: state.startedAt });
    throw e;
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
