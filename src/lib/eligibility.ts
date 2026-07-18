import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export type EligQuestion = {
  id: string;
  question: string;
  why: string;
  where_to_find: string;
  answer_kind: "yes_no" | "number" | "text";
  knockout: boolean;
};

export type EligVerdict = {
  verdict: "eligible" | "not_eligible" | "conditional";
  summary: string;
  items: {
    requirement: string;
    status: "met" | "not_met" | "needs_verification";
    reasoning: string;
    next_step: string;
  }[];
};

const QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          why: { type: "string" },
          where_to_find: { type: "string" },
          answer_kind: { type: "string", enum: ["yes_no", "number", "text"] },
          knockout: { type: "boolean" },
        },
        required: ["id", "question", "why", "where_to_find", "answer_kind", "knockout"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

const VERDICT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["eligible", "not_eligible", "conditional"] },
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string" },
          status: { type: "string", enum: ["met", "not_met", "needs_verification"] },
          reasoning: { type: "string" },
          next_step: { type: "string" },
        },
        required: ["requirement", "status", "reasoning", "next_step"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdict", "summary", "items"],
  additionalProperties: false,
};

type OppRow = {
  id: number; name: string; funder_name: string; type: string;
  nofo_text: string; eligibility_notes: string; url: string;
};

function getOpp(id: number): OppRow {
  const opp = db().prepare(`SELECT * FROM opportunities WHERE id=?`).get(id) as OppRow | undefined;
  if (!opp) throw new Error("Opportunity not found");
  return opp;
}

function profileText(): string {
  const p = db().prepare(`SELECT * FROM org_profile WHERE id=1`).get() as {
    name: string; legal_status: string; service_area: string; programs: string; stats: string;
  };
  return `Organization: ${p.name} (${p.legal_status}). Service area: ${p.service_area}. Programs: ${p.programs}. Known stats: ${p.stats}`;
}

const SCREENER_SYSTEM = `You are an eligibility screener for a small nonprofit applying for grants. Your job is to protect them from spending writing hours on grants they cannot win, and from wrongly ruling themselves out of grants they CAN win.

Rules:
- Derive questions ONLY from actual requirements in the funding notice (or, if no notice text is available, the standard requirements for this funder/program type — and say so in the question's "why").
- Every question must be answerable with a verifiable fact the organization can look up — never an opinion.
- "where_to_find" must name the SPECIFIC document, record, website, or office where the answer lives. Examples: "Your IRS determination letter (the letterhead states your subsection, e.g. 509(a)(1))", "SAM.gov entity record → Entity Registration → Core Data", "HRSA Rural Health Grants Eligibility Analyzer at data.hrsa.gov/tools/rural-health — enter each service-site address", "Your Oklahoma DHS child care license certificate (star rating is printed on it)", "Your Articles of Incorporation, first page", "Monthly enrollment report from your childcare management system", "Call the program officer listed in Section VII of the NOFO". Be that concrete.
- Mark knockout=true only for requirements that would definitively rule the applicant IN or OUT (entity type, statutory tribal status, geographic/rural designation, licensure, consortium requirements, mandatory registrations, deadlines already passed). Capacity/competitiveness questions are knockout=false.
- Ask about numbers when the notice sets thresholds (enrollment minimums, service volume, budget size, match capacity).
- The organization is Native-led but that does NOT confer statutory tribal status (Federally Recognized Tribe / Tribal Organization / Urban Indian Organization). If the notice has tribal requirements, ask the statutory question directly.
- 6 to 14 questions. Order: knockouts first.`;

const VERDICT_SYSTEM = `You are an eligibility screener delivering a verdict for a small nonprofit. You are conservative in the right direction:
- "eligible": every knockout requirement is affirmatively met by the answers. Even then, recommend confirming with the program officer before major writing effort.
- "not_eligible": at least one knockout requirement is definitively failed. Say which one, and whether there is a path (partnership, fiscal sponsor, future cycle) — or whether to walk away.
- "conditional": any knockout answered "unsure", unanswered, or ambiguous. For each, the next_step must say exactly how to resolve it (which document to pull, which website to check, who to call).
- Never soften a failed knockout into "conditional". Never treat a non-knockout weakness as disqualifying — note it as a competitiveness concern in reasoning instead.
- The summary is 2-4 plain sentences a board member would understand.`;

async function structured<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  });
  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  )?.text;
  if (!text) throw new Error("Empty response from model");
  return JSON.parse(text) as T;
}

export async function generateEligibilityQuestions(opportunityId: number): Promise<EligQuestion[]> {
  const opp = getOpp(opportunityId);
  const user = `${profileText()}

# Opportunity
Grant: ${opp.name}
Funder: ${opp.funder_name} (${opp.type})
Existing eligibility notes: ${opp.eligibility_notes || "(none)"}

# Funding notice text
${opp.nofo_text ? opp.nofo_text.slice(0, 150000) : "(No NOFO text pasted. Generate questions from the standard, well-known requirements for this funder and program type, and note that in each question's 'why'.)"}

Generate the eligibility screening questions.`;

  const result = await structured<{ questions: EligQuestion[] }>(SCREENER_SYSTEM, user, QUESTIONS_SCHEMA);
  const d = db();
  d.prepare(
    `INSERT INTO eligibility_screens (opportunity_id, questions, answers, verdict, updated_at)
     VALUES (?, ?, '{}', '', datetime('now'))
     ON CONFLICT(opportunity_id) DO UPDATE SET questions=excluded.questions, answers='{}', verdict='', updated_at=datetime('now')`
  ).run(opportunityId, JSON.stringify(result.questions));
  return result.questions;
}

export async function evaluateEligibility(
  opportunityId: number,
  answers: Record<string, string>
): Promise<EligVerdict> {
  const opp = getOpp(opportunityId);
  const d = db();
  const screen = d
    .prepare(`SELECT questions FROM eligibility_screens WHERE opportunity_id=?`)
    .get(opportunityId) as { questions: string } | undefined;
  if (!screen) throw new Error("Generate the questions first");
  const questions: EligQuestion[] = JSON.parse(screen.questions);

  const qa = questions
    .map(
      (q) =>
        `- [${q.knockout ? "KNOCKOUT" : "competitiveness"}] ${q.question}\n  Answer: ${answers[q.id]?.trim() || "(unanswered)"}`
    )
    .join("\n");

  const user = `${profileText()}

# Opportunity
Grant: ${opp.name}
Funder: ${opp.funder_name} (${opp.type})

# Relevant notice excerpts
${opp.nofo_text ? opp.nofo_text.slice(0, 60000) : "(no NOFO text on file)"}

# Screening questions and the organization's answers
${qa}

Deliver the eligibility verdict.`;

  const verdict = await structured<EligVerdict>(VERDICT_SYSTEM, user, VERDICT_SCHEMA);
  d.prepare(
    `UPDATE eligibility_screens SET answers=?, verdict=?, updated_at=datetime('now') WHERE opportunity_id=?`
  ).run(JSON.stringify(answers), JSON.stringify(verdict), opportunityId);

  // Surface the verdict on the opportunity record so it shows across the app.
  const label =
    verdict.verdict === "eligible" ? "ELIGIBLE (screened)" :
    verdict.verdict === "not_eligible" ? "NOT ELIGIBLE (screened)" : "CONDITIONAL (screened)";
  d.prepare(`UPDATE opportunities SET eligibility_notes=?, updated_at=datetime('now') WHERE id=?`).run(
    `${label}: ${verdict.summary}`,
    opportunityId
  );
  return verdict;
}

export function getScreen(opportunityId: number): {
  questions: EligQuestion[];
  answers: Record<string, string>;
  verdict: EligVerdict | null;
} {
  const row = db()
    .prepare(`SELECT questions, answers, verdict FROM eligibility_screens WHERE opportunity_id=?`)
    .get(opportunityId) as { questions: string; answers: string; verdict: string } | undefined;
  if (!row) return { questions: [], answers: {}, verdict: null };
  return {
    questions: JSON.parse(row.questions || "[]"),
    answers: JSON.parse(row.answers || "{}"),
    verdict: row.verdict ? JSON.parse(row.verdict) : null,
  };
}
