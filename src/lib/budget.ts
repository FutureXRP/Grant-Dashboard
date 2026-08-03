import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import {
  BUDGET_CATEGORIES,
  EMPTY_BUDGET,
  computeTotals,
  type Budget,
  type BudgetCategory,
  type BudgetTotals,
} from "./budget-core";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// Server side of the budget builder: persistence, SF-424 sync, and the two AI
// assists. All shared types + math live in budget-core.ts.

export { BUDGET_CATEGORIES, EMPTY_BUDGET, computeTotals };
export type { Budget, BudgetCategory, BudgetTotals };
export type { BudgetLine } from "./budget-core";

export async function getBudget(opportunityId: number): Promise<Budget> {
  const row = await q.get<{ budget: string }>(
    `SELECT budget FROM opportunity_budgets WHERE opportunity_id=?`,
    [opportunityId]
  );
  if (!row?.budget) return EMPTY_BUDGET;
  try {
    const parsed = JSON.parse(row.budget) as Partial<Budget>;
    return { ...EMPTY_BUDGET, ...parsed, lines: parsed.lines ?? [] };
  } catch {
    return EMPTY_BUDGET;
  }
}

export async function saveBudget(opportunityId: number, budget: Budget): Promise<void> {
  await q.run(
    `INSERT INTO opportunity_budgets (opportunity_id, budget, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(opportunity_id) DO UPDATE SET budget=excluded.budget, updated_at=datetime('now')`,
    [opportunityId, JSON.stringify(budget)]
  );
}

// Push the computed totals onto the opportunity + SF-424 item 18, so the
// request amount is consistent everywhere in the app.
export async function syncBudgetTotals(opportunityId: number, budget: Budget): Promise<BudgetTotals> {
  const totals = computeTotals(budget);
  await q.run(`UPDATE opportunities SET amount=?, updated_at=datetime('now') WHERE id=?`, [
    totals.totalRequested,
    opportunityId,
  ]);
  const row = await q.get<{ sf424_json: string }>(`SELECT sf424_json FROM opportunities WHERE id=?`, [
    opportunityId,
  ]);
  let sf424: Record<string, unknown> = {};
  try {
    sf424 = row?.sf424_json ? (JSON.parse(row.sf424_json) as Record<string, unknown>) : {};
  } catch {
    sf424 = {};
  }
  sf424.fund_federal = String(totals.totalRequested);
  sf424.fund_applicant = String(totals.totalMatch);
  await q.run(`UPDATE opportunities SET sf424_json=? WHERE id=?`, [JSON.stringify(sf424), opportunityId]);
  return totals;
}

// ---- AI: suggest line-item structure from the NOFO (never invents amounts) ----

const SUGGEST_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["personnel", "fringe", "travel", "equipment", "supplies", "contractual", "construction", "other"],
          },
          description: { type: "string" },
          note: { type: "string" },
        },
        required: ["category", "description", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "items"],
  additionalProperties: false,
};

const SUGGEST_SYSTEM = `You draft the STRUCTURE of a grant budget for a small nonprofit — the line items a competitive application for this program would include — based on the funding notice and the proposal draft.

Hard rules:
1. NEVER invent dollar amounts, salaries, quantities, or rates. You propose line items only; the organization fills in its real numbers. Every item's "note" says exactly where the number comes from (e.g. "[VERIFY: current payroll register — Program Director salary]", "[VERIFY: quote from playground equipment vendor]").
2. Respect the notice's budget rules: unallowable costs, match requirements, caps (e.g. equipment or construction restrictions, indirect limits). Mention any such rule in the relevant item's note.
3. Personnel first, then fringe, then the rest. Include evaluation, and the cost drivers this specific project implies.
4. If the notice requires match/cost share, include a note item under "other" explaining the match sources to document.
5. 8–20 items. The summary is 2-3 sentences on the budget shape a reviewer expects for this program.`;

export type SuggestedLine = { category: BudgetCategory; description: string; note: string };

export async function suggestBudgetLines(opportunityId: number): Promise<{ summary: string; items: SuggestedLine[] }> {
  const opp = await q.get<{ name: string; funder_name: string; type: string; amount: number; nofo_text: string }>(
    `SELECT name, funder_name, type, amount, nofo_text FROM opportunities WHERE id=?`,
    [opportunityId]
  );
  if (!opp) throw new Error("Opportunity not found");
  const sections = await q.all<{ section_key: string; content: string }>(
    `SELECT section_key, content FROM proposal_sections WHERE opportunity_id=? AND content != ''`,
    [opportunityId]
  );
  const proposal = sections.map((s) => `## ${s.section_key}\n${s.content.slice(0, 4000)}`).join("\n\n");
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SUGGEST_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: SUGGEST_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `# Opportunity\nGrant: ${opp.name}\nFunder: ${opp.funder_name} (${opp.type})\nPlanned request: ${opp.amount ? `$${opp.amount.toLocaleString()}` : "not set"}\n\n# Funding notice\n${opp.nofo_text ? opp.nofo_text.slice(0, 120000) : "(no NOFO text — use the standard budget expectations for this funder type and say so in the summary)"}\n\n# Proposal draft so far\n${proposal || "(no sections drafted yet)"}\n\nPropose the budget line items.`,
      },
    ],
  });
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from model");
  return JSON.parse(text) as { summary: string; items: SuggestedLine[] };
}

// ---- AI: budget-justification narrative from the ENTERED numbers ----

const NARRATIVE_SYSTEM = `You write the budget-justification narrative for a nonprofit grant application, using ONLY the line items and dollar amounts the organization entered — these are their real numbers, use them exactly as given.

Rules:
1. Never add, change, or estimate any number. If a line has $0 or a [VERIFY] note, flag it in the narrative as "[VERIFY: complete this line]" rather than guessing.
2. One subsection per category in standard order (Personnel, Fringe Benefits, Travel, Equipment, Supplies, Contractual, Construction, Other, Indirect Costs), skipping empty categories. For each: justify WHY each cost is necessary for the project and HOW it was calculated (qty × rate when provided).
3. State the totals exactly: total direct, indirect (with the rate), total request, and match with its percentage — and name the match sources if noted.
4. Reviewer-ready tone: specific, economical, no filler. Markdown with ### headings per category.
5. End with a "Placeholders to verify" list if any [VERIFY] flags remain, else omit it.`;

export async function generateBudgetNarrative(opportunityId: number): Promise<string> {
  const budget = await getBudget(opportunityId);
  if (budget.lines.length === 0) throw new Error("Add budget line items first — the narrative is written from your entered numbers.");
  const totals = computeTotals(budget);
  const opp = await q.get<{ name: string; funder_name: string }>(
    `SELECT name, funder_name FROM opportunities WHERE id=?`,
    [opportunityId]
  );
  const catLabel = Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.key, c.label]));
  const lineText = budget.lines
    .map(
      (l) =>
        `${catLabel[l.category]} | ${l.description} | ${l.qty ? `qty ${l.qty} × $${l.rate.toLocaleString()}` : "flat"} | requested $${l.requested.toLocaleString()} | match $${l.match.toLocaleString()}${l.note ? ` | note: ${l.note}` : ""}`
    )
    .join("\n");
  const user = `Grant: ${opp?.name ?? ""} (${opp?.funder_name ?? ""})

# Entered budget lines
${lineText}

# Computed totals
Total direct request: $${totals.directRequested.toLocaleString()}
Indirect: $${totals.indirect.toLocaleString()} (${budget.indirectRatePct}%${budget.indirectExcludeEquipment ? ", equipment excluded from base" : ""}; ${budget.indirectNote})
TOTAL REQUEST: $${totals.totalRequested.toLocaleString()}
Match / cost share: $${totals.totalMatch.toLocaleString()} (${totals.matchPct}% of total project)
Total project cost: $${totals.grandTotal.toLocaleString()}

Write the budget-justification narrative.`;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: NARRATIVE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const narrative = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  // Save into the proposal's Budget Narrative section so it flows into the
  // export package, red-team review, and compliance check automatically.
  await q.run(
    `INSERT INTO proposal_sections (opportunity_id, section_key, content, updated_at)
     VALUES (?, 'budget_narrative', ?, datetime('now'))
     ON CONFLICT(opportunity_id, section_key) DO UPDATE SET content=excluded.content, updated_at=datetime('now')`,
    [opportunityId, narrative]
  );
  await q.run(`INSERT INTO ai_runs (opportunity_id, agent, output) VALUES (?, 'budget_narrative', ?)`, [
    opportunityId,
    narrative,
  ]);
  return narrative;
}
