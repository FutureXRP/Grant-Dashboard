import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export type PacketItem = {
  requirement: string;
  doc_id: number; // 0 = no library match
  doc_name: string;
  status: "have_current" | "have_issue" | "missing";
  action: string;
};

export type Packet = {
  summary: string;
  items: PacketItem[];
  builtAt: string;
};

const PACKET_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string" },
          doc_id: { type: "integer" },
          doc_name: { type: "string" },
          status: { type: "string", enum: ["have_current", "have_issue", "missing"] },
          action: { type: "string" },
        },
        required: ["requirement", "doc_id", "doc_name", "status", "action"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "items"],
  additionalProperties: false,
};

const PACKET_SYSTEM = `You assemble the attachment packet for a nonprofit's grant application by matching the funding notice's required attachments against the organization's document library.

Rules:
- List every attachment/appendix/form the notice requires (if no notice text is provided, use the standard attachment list for this funder type and say so in the summary).
- Match each requirement to the single best library document by its id. doc_id 0 means no match.
- status "have_current": the matched document has an uploaded file or filled-in text content, its status is "current", and it is not past its expiration date.
- status "have_issue": a match exists but something is wrong — status draft/expired, past expiration, or the item is tracked but has no file/text yet. Say exactly what is wrong in the action.
- status "missing": nothing in the library covers it. The action says specifically how to produce it (who signs it, where to request it, what it must contain).
- Requirements the library can never hold (e.g. forms filled per-application like SF-424, project-specific budgets) get doc_id 0 and an action explaining they are produced per-application.
- The summary is 2-3 sentences: how ready this packet is and the single most urgent gap.`;

export async function buildPacket(opportunityId: number): Promise<Packet> {
  const d = db();
  const opp = d.prepare(`SELECT * FROM opportunities WHERE id=?`).get(opportunityId) as
    | { id: number; name: string; funder_name: string; type: string; nofo_text: string }
    | undefined;
  if (!opp) throw new Error("Opportunity not found");

  const docs = d
    .prepare(`SELECT id, name, category, status, expires, notes, file_name, content_text FROM documents ORDER BY category, name`)
    .all() as {
    id: number; name: string; category: string; status: string; expires: string;
    notes: string; file_name: string; content_text: string;
  }[];
  const today = new Date().toISOString().slice(0, 10);
  const docList = docs
    .map(
      (doc) =>
        `id=${doc.id} | ${doc.name} | category=${doc.category} | status=${doc.status} | expires=${doc.expires || "n/a"}${doc.expires && doc.expires < today ? " (PAST DUE)" : ""} | file=${doc.file_name || "none"} | info_text=${doc.content_text ? "yes" : "no"}${doc.notes ? ` | notes=${doc.notes}` : ""}`
    )
    .join("\n");

  const user = `# Opportunity
Grant: ${opp.name}
Funder: ${opp.funder_name} (${opp.type})
Today's date: ${today}

# Funding notice text
${opp.nofo_text ? opp.nofo_text.slice(0, 150000) : "(none pasted — use the standard attachment list for this funder type)"}

# Document library (match by id)
${docList}

Build the attachment packet.`;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: PACKET_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: PACKET_SCHEMA } },
    messages: [{ role: "user", content: user }],
  });
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from model");
  const parsed = JSON.parse(text) as Omit<Packet, "builtAt">;
  const packet: Packet = { ...parsed, builtAt: new Date().toISOString() };
  d.prepare(
    `INSERT INTO opportunity_packets (opportunity_id, packet, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(opportunity_id) DO UPDATE SET packet=excluded.packet, updated_at=datetime('now')`
  ).run(opportunityId, JSON.stringify(packet));
  return packet;
}

export function getPacket(opportunityId: number): Packet | null {
  const row = db().prepare(`SELECT packet FROM opportunity_packets WHERE opportunity_id=?`).get(opportunityId) as
    | { packet: string }
    | undefined;
  return row?.packet ? (JSON.parse(row.packet) as Packet) : null;
}
