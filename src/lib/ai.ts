import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  return new Anthropic();
}

type ProfileRow = {
  name: string; legal_status: string; mission: string; vision: string;
  programs: string; service_area: string; populations: string;
  leadership: string; stats: string;
};

function orgContext(): string {
  const p = db().prepare(`SELECT * FROM org_profile WHERE id=1`).get() as ProfileRow;
  const narratives = db()
    .prepare(`SELECT category, title, content FROM narratives ORDER BY category`)
    .all() as { category: string; title: string; content: string }[];
  const narrText = narratives
    .map((n) => `### ${n.category} — ${n.title}\n${n.content}`)
    .join("\n\n");
  return `# Organization Profile
Name: ${p.name} (${p.legal_status})
Mission: ${p.mission}
Vision: ${p.vision}
Programs: ${p.programs}
Service area: ${p.service_area}
Populations served: ${p.populations}
Leadership: ${p.leadership}
Verified statistics: ${p.stats}

# Approved Narrative Library
${narrText}`;
}

// Stable system prompt (kept byte-identical across calls so it prompt-caches).
const GUARDRAILS = `You are the grant-writing copilot for a small nonprofit. Rules that always apply:
1. NEVER invent statistics, participant counts, outcomes, or dollar figures. If data is needed but not present in the organization profile, insert a bracketed placeholder like [VERIFY: annual patients served] and list every placeholder at the end of your output.
2. The organization is Native-led, but Native-led does NOT satisfy statutory tribal-eligibility definitions (Federally Recognized Tribe, Tribal Organization, Urban Indian Organization). Never imply tribal-program eligibility; flag it as a check when relevant.
3. All output is a draft for human review — funders require staff review before submission.
4. Write in clear, professional grant-writing prose: specific, evidence-oriented, free of hype and filler.
5. Reinforce the organization's key messages where they naturally fit.`;

async function run(system: string, user: string, maxTokens = 8000): Promise<string> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export type AgentAction =
  | "analyze_nofo"
  | "draft_section"
  | "improve"
  | "shorten"
  | "smart_objectives"
  | "red_team"
  | "compliance_check";

export async function runAgent(
  action: AgentAction,
  input: {
    opportunityId?: number;
    sectionKey?: string;
    sectionTitle?: string;
    text?: string;
    targetWords?: number;
  }
): Promise<string> {
  const d = db();
  const system = `${GUARDRAILS}\n\n${orgContext()}`;

  type OppRow = {
    id: number; name: string; funder_name: string; type: string;
    amount: number; deadline: string; nofo_text: string; eligibility_notes: string;
  };
  let opp: OppRow | null = null;
  if (input.opportunityId) {
    opp = (d.prepare(`SELECT * FROM opportunities WHERE id=?`).get(input.opportunityId) as OppRow | undefined) ?? null;
  }
  const oppContext = opp
    ? `# Current Opportunity\nGrant: ${opp.name}\nFunder: ${opp.funder_name}\nType: ${opp.type}\nAmount sought: $${opp.amount?.toLocaleString()}\nDeadline: ${opp.deadline}\nEligibility notes: ${opp.eligibility_notes}\n\n# NOFO / Guidelines Text\n${opp.nofo_text ? opp.nofo_text.slice(0, 150000) : "(none pasted yet)"}`
    : "";

  let user = "";
  switch (action) {
    case "analyze_nofo":
      // The Section 4/7 "Opportunity Analysis" prompt.
      user = `${oppContext}\n\nAnalyze this Notice of Funding Opportunity for the organization. Produce an executive planning brief in markdown with these sections:
1. **Eligibility** — are we eligible? Call out any tribal-status, geographic, or org-type requirements explicitly.
2. **Required registrations** (SAM/UEI/Grants.gov/agency portals)
3. **Required partners** (if any)
4. **Required attachments** — a complete checklist
5. **Scoring / evaluation criteria** with point values if published
6. **Recommended project concepts** — which of our programs fit, and 2–3 concrete concepts
7. **Budget guidance** (match, indirect, allowable costs)
8. **Timeline** — key dates and a recommended internal schedule working back from the deadline
9. **Compliance risks**
10. **Suggested narrative outline** mapped to the scoring criteria
11. **Honest probability assessment** for this organization, with reasons.
If no NOFO text has been pasted, say so and analyze from the opportunity metadata only, listing what to look for once the NOFO is available.`;
      break;
    case "draft_section":
      user = `${oppContext}\n\nDraft the "${input.sectionTitle}" section of this proposal. Use the organization profile and the approved narrative library as source material — reuse approved language where it fits, tailored to this funder and opportunity. Match the NOFO's expectations if NOFO text is available.${input.text ? `\n\nThe current draft (revise/extend rather than starting over):\n${input.text}` : ""}\n\nReturn only the section text in markdown, followed by a "Placeholders to verify" list if any.`;
      break;
    case "improve":
      user = `${oppContext}\n\nImprove the following proposal text: strengthen clarity, flow, specificity, and alignment with the funder's priorities. Keep all facts exactly as written — do not add new claims or numbers. Return the revised text only, then a one-paragraph note on what you changed.\n\n---\n${input.text}`;
      break;
    case "shorten":
      user = `${oppContext}\n\nReduce the following text to approximately ${input.targetWords || 250} words while preserving every substantive point and all factual claims. Return the shortened text only.\n\n---\n${input.text}`;
      break;
    case "smart_objectives":
      user = `${oppContext}\n\nBased on this text (and the NOFO if available), write 3–5 SMART objectives using the template: "By the end of the project period, [population] will achieve [measurable result], as measured by [evaluation method], within [timeframe]." Where a baseline or target number is unknown, use a [VERIFY: ...] placeholder rather than inventing one.\n\n---\n${input.text || "(no draft provided — derive objectives from the opportunity and organization profile)"}`;
      break;
    case "red_team": {
      const sections = d
        .prepare(
          `SELECT ps.section_key, ps.content FROM proposal_sections ps WHERE ps.opportunity_id=? AND ps.content != ''`
        )
        .all(input.opportunityId) as { section_key: string; content: string }[];
      const proposal = sections.map((s) => `## ${s.section_key}\n${s.content}`).join("\n\n");
      user = `${oppContext}\n\nAct as a skeptical federal grant reviewer scoring this proposal against the published criteria (or standard federal criteria if none are available: need, program design, organizational capacity, evaluation, budget, sustainability). For each area: score 1–10, quote the weakest passages, and state exactly what a competitive proposal would say instead. Report every issue you find, including ones you are uncertain about — coverage over politeness. End with the three changes that would most improve the score.\n\n# Proposal Draft\n${proposal || "(no sections drafted yet)"}`;
      break;
    }
    case "compliance_check": {
      const sections = d
        .prepare(
          `SELECT ps.section_key, ps.content FROM proposal_sections ps WHERE ps.opportunity_id=? AND ps.content != ''`
        )
        .all(input.opportunityId) as { section_key: string; content: string }[];
      const proposal = sections.map((s) => `## ${s.section_key}\n${s.content}`).join("\n\n");
      user = `${oppContext}\n\nBuild a compliance checklist from the NOFO (every required element, section, attachment, format rule, and page/word limit), then check the draft against it. Output a markdown table: Requirement | Where required | Status (✅ met / ⚠️ partial / ❌ missing) | What to fix. Flag any unverified-statistics placeholders still in the draft as blockers.\n\n# Proposal Draft\n${proposal || "(no sections drafted yet)"}`;
      break;
    }
  }

  const output = await run(system, user, action === "analyze_nofo" || action === "red_team" ? 16000 : 8000);
  d.prepare(`INSERT INTO ai_runs (opportunity_id, agent, output) VALUES (?, ?, ?)`).run(
    input.opportunityId ?? null,
    action,
    output
  );
  return output;
}
