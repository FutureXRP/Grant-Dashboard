// Application Filler: read a funder's online application (including forms
// embedded from Wufoo, JotForm, Google Forms and the like), extract every
// question, and draft an answer to each from the organization's stored
// knowledge. The output is a copy-paste answer sheet — a human always makes
// the final submission.

import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { orgContext } from "./ai";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export type AppFieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "number"
  | "file";

export type AppField = {
  key: string;
  label: string;
  type: AppFieldType;
  required: boolean;
  choices?: string[];
  instructions?: string;
  maxLength?: number;
};

export type AppAnswer = {
  answer: string;
  status: "ready" | "verify" | "attach";
  note?: string;
};

export type AppForm = {
  url: string;
  title: string;
  fields: AppField[];
  answers: Record<string, AppAnswer>;
  fetchedAt: string;
};

// ---------- fetching ----------

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; GrantCopilot/1.0)",
  Accept: "text/html,application/xhtml+xml",
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`The page returned HTTP ${res.status}`);
  const text = await res.text();
  return text.slice(0, 3_000_000);
}

// Many funder pages are just a wrapper around a form service. Find the real
// form so the extractor reads actual questions, not the wrapper page.
export function findEmbeddedFormUrl(html: string): string | null {
  // Wufoo — full URL anywhere in the markup (embed snippets include it).
  const wufoo = html.match(/https?:\/\/([a-z0-9-]+)\.wufoo\.com\/(?:embed|forms)\/([a-z0-9]+)/i);
  if (wufoo) return `https://${wufoo[1]}.wufoo.com/forms/${wufoo[2]}/`;
  // Wufoo JS-config style: host + formHash variables.
  const host = html.match(/['"]?host['"]?\s*[:=]\s*['"]([a-z0-9-]+\.wufoo\.com)['"]/i);
  const hash = html.match(/['"]?formHash['"]?\s*[:=]\s*['"]([a-z0-9]+)['"]/i);
  if (host && hash) return `https://${host[1]}/forms/${hash[1]}/`;
  // Other common form services embedded via iframe.
  const iframes = [...html.matchAll(/<iframe[^>]+src=["']((?:https?:)?\/\/[^"']+)["']/gi)].map((m) =>
    m[1].startsWith("//") ? `https:${m[1]}` : m[1]
  );
  const services = /jotform\.com|forms\.gle|docs\.google\.com\/forms|formstack\.com|cognitoforms\.com|tfaforms\.com|machform|formsite\.com|smartsheet\.com\/b\/form|airtable\.com\/(embed|shr)/i;
  const found = iframes.find((u) => services.test(u));
  return found ?? null;
}

// Keep the markup the extractor needs (labels, inputs, instructions) and drop
// the noise that eats tokens.
export function sanitizeFormHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(path|svg|symbol|defs)[\s\S]*?<\/\1>/gi, " ")
    .replace(/\s(?:style|onchange|onclick|onkeyup|onfocus|onblur|data-[a-z-]+)="[^"]*"/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 180_000);
}

// ---------- AI extraction ----------

const EXTRACT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string", description: "The application's title" },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "short_snake_case identifier, unique within the form" },
          label: { type: "string", description: "The question exactly as the form asks it" },
          type: {
            type: "string",
            enum: ["text", "textarea", "select", "radio", "checkbox", "date", "number", "file"],
          },
          required: { type: "boolean" },
          choices: { type: "array", items: { type: "string" } },
          instructions: {
            type: "string",
            description: "Any guidance the form gives for this question (bullet prompts, definitions, word limits), verbatim-condensed",
          },
          maxLength: { type: "number", description: "Character limit if the form sets one, else 0" },
        },
        required: ["key", "label", "type", "required"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "fields"],
  additionalProperties: false,
};

const EXTRACT_SYSTEM = `You read the HTML of a grant application form and list every question an applicant must answer, in the form's order.

Rules:
- One entry per question. A radio/checkbox group is ONE field with its choices listed — never one field per option, and never duplicate a label that appears twice in the markup for the same input group.
- Attach the form's own guidance to the right field: if a narrative box is preceded by instructions or bullet-point prompts, put them (condensed but complete) in that field's "instructions".
- Repeated table-style inputs (e.g. a budget grid with rows like Personnel / Other Direct Costs and columns like Funder Support / Other Support) become one field PER CELL with a label naming row and column, e.g. "Budget — Personnel: Piñon Foundation Support".
- File-upload requirements are fields with type "file".
- Skip navigation, footers, CAPTCHAs, and the submit button. Keep hidden/duplicate technical inputs out.
- maxLength only when the form really sets one; otherwise 0.`;

export async function readApplication(opportunityId: number, url: string): Promise<AppForm> {
  let html = await fetchHtml(url);
  let finalUrl = url;
  const embedded = findEmbeddedFormUrl(html);
  if (embedded) {
    try {
      html = await fetchHtml(embedded);
      finalUrl = embedded;
    } catch {
      /* keep the wrapper page if the embed fetch fails */
    }
  }
  const cleaned = sanitizeFormHtml(html);
  if (cleaned.replace(/<[^>]+>/g, "").trim().length < 200) {
    throw new Error(
      "The page has almost no readable content — it may build its form entirely in the browser. Try the direct form link, or paste the questions into the NOFO box instead."
    );
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 12000,
    system: [{ type: "text", text: EXTRACT_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    messages: [{ role: "user", content: `Form page URL: ${finalUrl}\n\n# Form HTML\n${cleaned}` }],
  });
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from the extractor");
  const parsed = JSON.parse(text) as { title: string; fields: AppField[] };
  if (!parsed.fields?.length) {
    throw new Error("No questions found on that page. If the application is behind a login, paste the questions into the opportunity's NOFO box and use the proposal workspace.");
  }

  const form: AppForm = {
    url,
    title: parsed.title || "Application",
    fields: parsed.fields,
    answers: {},
    fetchedAt: new Date().toISOString(),
  };
  await saveForm(opportunityId, form);
  return form;
}

// ---------- AI answering ----------

const ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          answer: { type: "string" },
          status: { type: "string", enum: ["ready", "verify", "attach"] },
          note: { type: "string", description: "One short line for the human reviewer when something needs their attention, else empty" },
        },
        required: ["key", "answer", "status"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
};

const ANSWER_GUARDRAILS = `You fill out a grant application for a small nonprofit, answering every question from the organization's stored profile, documents, and this opportunity's records.

Rules that always apply:
1. NEVER invent statistics, counts, dates, names, or dollar figures. Where a needed fact is not in the provided context, write [VERIFY: what's needed] in the answer and set status "verify".
2. Answers must be paste-ready: write exactly what goes in the box, in the form's voice (no "I would suggest…"). For select/radio/checkbox questions, the answer is the matching choice text exactly as listed.
3. Respect every character limit. Narrative questions with bullet-point guidance must address each bullet, in order.
4. File-upload questions get status "attach": the answer states what document to attach and whether the organization's library already has it (by name) or it still needs to be produced.
5. status "ready" only when the answer is complete and verbatim-usable; "verify" when it contains any placeholder or assumption.
6. The organization is Native-led but has NO statutory tribal status — never claim tribal-program eligibility.
7. Every question in the form must get exactly one answer entry, keyed by the question's key.`;

export async function answerApplication(opportunityId: number): Promise<AppForm> {
  const stored = await loadForm(opportunityId);
  if (!stored || stored.fields.length === 0) throw new Error("Read the application first.");

  type OppRow = {
    name: string; funder_name: string; type: string; amount: number;
    deadline: string; url: string; eligibility_notes: string; nofo_text: string;
  };
  const opp = await q.get<OppRow>(`SELECT * FROM opportunities WHERE id=?`, [opportunityId]);
  if (!opp) throw new Error("Opportunity not found");

  const profile = await q.get<{ ein: string; uei: string }>(`SELECT ein, uei FROM org_profile WHERE id=1`);
  const docs = await q.all<{ name: string; category: string; status: string; file_name: string; content_text: string }>(
    `SELECT name, category, status, file_name, content_text FROM documents ORDER BY category, name`
  );
  const docList = docs
    .map((d) => {
      const has = d.file_name || d.status === "current" ? "ON FILE" : "not on file";
      const excerpt = (d.content_text || "").replace(/\s+/g, " ").slice(0, 1200);
      return `- ${d.name} (${d.category}) — ${has}${excerpt ? `\n  excerpt: ${excerpt}` : ""}`;
    })
    .join("\n");
  const sections = await q.all<{ section_key: string; content: string }>(
    `SELECT section_key, content FROM proposal_sections WHERE opportunity_id=? AND content != ''`,
    [opportunityId]
  );
  const proposal = sections.map((s) => `## ${s.section_key}\n${s.content.slice(0, 5000)}`).join("\n\n");
  const budgetRow = await q.get<{ budget: string }>(
    `SELECT budget FROM opportunity_budgets WHERE opportunity_id=?`,
    [opportunityId]
  );

  const system = `${ANSWER_GUARDRAILS}\n\n${await orgContext()}\nEIN: ${profile?.ein || "[VERIFY: EIN]"} · UEI: ${profile?.uei || "[VERIFY: UEI]"}\n\n# Document library (for attachment questions)\n${docList || "(no documents tracked yet)"}`;

  const user = `# The opportunity this application is for
Grant: ${opp.name}
Funder: ${opp.funder_name} (${opp.type})
Planned request: ${opp.amount ? `$${opp.amount.toLocaleString()}` : "not set — use [VERIFY: amount requested]"}
Deadline: ${opp.deadline || "not set"}
Eligibility notes: ${opp.eligibility_notes || "none"}

# Funding notice / guidelines text
${opp.nofo_text ? opp.nofo_text.slice(0, 60000) : "(none pasted)"}

# Proposal sections already drafted for this opportunity (reuse this language)
${proposal || "(none yet)"}

# Budget entered for this opportunity (JSON; use these exact numbers for budget questions)
${budgetRow?.budget || "(no budget entered — budget amounts become [VERIFY: ...] placeholders)"}

# The application to fill out — "${stored.title}" (${stored.url})
${stored.fields
  .map(
    (f, i) =>
      `${i + 1}. key=${f.key} [${f.type}${f.required ? ", required" : ""}${f.maxLength ? `, max ${f.maxLength} chars` : ""}] ${f.label}${
        f.choices?.length ? `\n   choices: ${f.choices.join(" | ")}` : ""
      }${f.instructions ? `\n   guidance: ${f.instructions}` : ""}`
  )
  .join("\n")}

Answer every question.`;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: ANSWER_SCHEMA } },
    messages: [{ role: "user", content: user }],
  });
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from the answer engine");
  const parsed = JSON.parse(text) as { answers: { key: string; answer: string; status: AppAnswer["status"]; note?: string }[] };

  const answers: Record<string, AppAnswer> = {};
  for (const a of parsed.answers) {
    answers[a.key] = { answer: a.answer, status: a.status, note: a.note || undefined };
  }
  const form: AppForm = { ...stored, answers };
  await saveForm(opportunityId, form);
  await q.run(`INSERT INTO ai_runs (opportunity_id, agent, output) VALUES (?, ?, ?)`, [
    opportunityId,
    "application_filler",
    JSON.stringify({ url: stored.url, answered: parsed.answers.length }),
  ]);
  return form;
}

// ---------- storage ----------

export async function saveForm(opportunityId: number, form: AppForm): Promise<void> {
  await q.run(
    `INSERT INTO application_forms (opportunity_id, url, title, fields, answers, fetched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(opportunity_id) DO UPDATE SET
       url=excluded.url, title=excluded.title, fields=excluded.fields,
       answers=excluded.answers, fetched_at=excluded.fetched_at, updated_at=datetime('now')`,
    [opportunityId, form.url, form.title, JSON.stringify(form.fields), JSON.stringify(form.answers), form.fetchedAt]
  );
}

export async function saveAnswers(opportunityId: number, answers: Record<string, AppAnswer>): Promise<void> {
  await q.run(`UPDATE application_forms SET answers=?, updated_at=datetime('now') WHERE opportunity_id=?`, [
    JSON.stringify(answers),
    opportunityId,
  ]);
}

export async function loadForm(opportunityId: number): Promise<AppForm | null> {
  const row = await q.get<{ url: string; title: string; fields: string; answers: string; fetched_at: string }>(
    `SELECT url, title, fields, answers, fetched_at FROM application_forms WHERE opportunity_id=?`,
    [opportunityId]
  );
  if (!row) return null;
  try {
    return {
      url: row.url,
      title: row.title,
      fields: JSON.parse(row.fields || "[]"),
      answers: JSON.parse(row.answers || "{}"),
      fetchedAt: row.fetched_at,
    };
  } catch {
    return null;
  }
}
