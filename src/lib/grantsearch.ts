// Multi-source live grant search for the Discover page. No AI calls — these
// are free structured APIs, so searching costs nothing:
//   - Grants.gov search2 (federal, no key)
//   - Kindora (foundation + state/federal programs; open MCP endpoint)
//   - Granted (140K-grant database; open MCP endpoint)
// Kindora and Granted are the same services behind the team's Claude
// connectors — both publish auth-less endpoints intended for programmatic
// clients (kindora.co/mcp, grantedai.com/mcp). Results carry attribution.

export type SearchRow = {
  source: "federal" | "kindora" | "granted";
  kind: string; // foundation | government | federal
  title: string;
  funder: string;
  deadline: string; // free text ("Rolling", "2027-03-01", "12/31/2026", "")
  amount: string;
  url: string;
  description: string;
  tracked?: boolean; // funder already in the dashboard's funder list
  // Filled by the optional AI grading pass:
  grade?: string;
  lane?: string;
  reason?: string;
};

import { decodeEntities } from "./targeting";

// ---- minimal MCP streamable-HTTP client (one-shot tools/call) ----

async function mcpCall(endpoint: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`${new URL(endpoint).hostname} returned HTTP ${res.status}`);
  const text = await res.text();
  // The response is either plain JSON or an SSE stream of "data:" lines.
  const payload = text.trim().startsWith("{")
    ? text.trim()
    : text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .find((d) => d.includes('"result"') || d.includes('"error"'));
  if (!payload) throw new Error(`${new URL(endpoint).hostname}: empty response`);
  const msg = JSON.parse(payload) as { result?: unknown; error?: { message?: string } };
  if (msg.error) throw new Error(msg.error.message || "Search service error");
  return msg.result;
}

function stripTags(s: string): string {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// ---- Kindora: foundation programs + state/federal government grants ----

type KindoraProgram = {
  title?: string;
  funder_name?: string;
  deadline?: string;
  grant_range?: string;
  cite_url?: string;
  application_url?: string;
  description?: string;
  source?: string;
  geographic_focus?: string[];
};

export async function searchKindora(keyword: string): Promise<SearchRow[]> {
  const result = (await mcpCall("https://mcp.kindora.co/mcp", "search_open_grants", {
    query: keyword,
    location: "Tulsa County",
    state: "OK",
    limit: 15,
    deadline_days: 365,
  })) as { content?: { type: string; text?: string }[] };
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return [];
  const data = JSON.parse(text) as {
    results?: KindoraProgram[];
    government_opportunities?: KindoraProgram[];
  };
  const toRow = (p: KindoraProgram, kind: string): SearchRow => ({
    source: "kindora",
    kind,
    title: p.title || "",
    funder: p.funder_name || "",
    deadline: p.deadline || "",
    amount: p.grant_range && p.grant_range !== "Not specified" ? p.grant_range : "",
    url: p.cite_url || p.application_url || "",
    description: stripTags(p.description || "").slice(0, 280),
  });
  return [
    ...(data.results ?? []).map((p) => toRow(p, "foundation")),
    ...(data.government_opportunities ?? []).map((p) => toRow(p, "government")),
  ].filter((r) => r.title);
}

// ---- Granted: 140K-grant database (federal + state + foundation) ----

type GrantedMetaGrant = {
  name?: string;
  funder?: string;
  deadline?: string | null;
  deadlineLabel?: string;
  amount?: string | null;
  url?: string;
};

export async function searchGranted(keyword: string): Promise<SearchRow[]> {
  const result = (await mcpCall("https://grantedai.com/api/mcp/mcp", "search_grants", {
    query: keyword,
    state: "OK",
    org_type: "Nonprofit",
    limit: 12,
  })) as {
    content?: { type: string; text?: string }[];
    _meta?: Record<string, unknown>;
  };

  // Primary: parse the rich text blocks (summary + direct apply link).
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  const rows: SearchRow[] = [];
  for (const block of text.split(/\n---\n?/)) {
    const title = block.match(/\*\*(.+?)\*\*/)?.[1]?.trim();
    if (!title) continue;
    const field = (label: string) => block.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
    rows.push({
      source: "granted",
      kind: /federal|U\.S\.|Administration|Department of/i.test(field("Funder")) ? "government" : "foundation",
      title,
      funder: field("Funder"),
      deadline: /^no deadline$/i.test(field("Deadline")) ? "Rolling" : field("Deadline"),
      amount: field("Amount"),
      url: field("Apply") || block.match(/https:\/\/grantedai\.com\/grants\/[^\s)]+/)?.[0] || "",
      description: field("Summary").slice(0, 280),
    });
  }
  if (rows.length > 0) return rows;

  // Fallback: the structured block (fewer fields, but reliable).
  const meta = result._meta?.["com.grantedai/search-results"] as { grants?: GrantedMetaGrant[] } | undefined;
  return (meta?.grants ?? [])
    .filter((g) => g.name)
    .map((g) => ({
      source: "granted" as const,
      kind: "foundation",
      title: g.name || "",
      funder: g.funder || "",
      deadline: g.deadline || g.deadlineLabel || "",
      amount: g.amount || "",
      url: g.url || "",
      description: "",
    }));
}

// ---- Grants.gov (federal) ----

export async function searchFederal(keyword: string): Promise<SearchRow[]> {
  const res = await fetch("https://api.grants.gov/v1/api/search2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, rows: 20, oppStatuses: "forecasted|posted", eligibilities: "12" }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Grants.gov returned ${res.status}`);
  const data = (await res.json()) as {
    data?: { oppHits?: { id?: string | number; number?: string; title?: string; agencyName?: string; agency?: string; closeDate?: string; oppStatus?: string }[] };
  };
  return (data.data?.oppHits ?? [])
    .filter((h) => h.title)
    .map((h) => ({
      source: "federal" as const,
      kind: "federal",
      title: decodeEntities(h.title || ""),
      funder: decodeEntities(h.agencyName || h.agency || ""),
      deadline: h.closeDate || "",
      amount: "",
      url: h.id ? `https://www.grants.gov/search-results-detail/${h.id}` : "",
      description: [h.number, h.oppStatus].filter(Boolean).join(" · "),
    }));
}
