import { q } from "./db";

// Grant-list CSV import: turns an exported research list (Instrumentl export,
// consultant spreadsheet, any grant list with headers) into funder records and
// optionally pipeline opportunities. The human does the licensed research;
// this absorbs their judgment. No AI involved — deterministic mapping only.

// Minimal RFC-4180 CSV parser: quoted fields, embedded commas/newlines/quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// Loose name key so "Anne & Henry Zarrow" matches "Anne and Henry Zarrow"
// and "Quik Trip" matches "QuikTrip": lowercase, &→and, alphanumerics only.
function nameKey(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

// Find a column by fuzzy header match (first header containing any candidate).
function findCol(headers: string[], candidates: string[]): number {
  const h = headers.map((x) => x.toLowerCase().trim());
  for (const cand of candidates) {
    const i = h.findIndex((x) => x.includes(cand));
    if (i >= 0) return i;
  }
  return -1;
}

// "1 Strong" / "2 Worth a look" / "strong fit" → tier 1-3.
function fitTier(fit: string): number {
  const f = fit.toLowerCase();
  const n = f.match(/^\s*([1-5])/);
  if (n) return Math.min(3, Number(n[1]));
  if (f.includes("strong")) return 1;
  if (f.includes("worth") || f.includes("possible")) return 2;
  return 3;
}

function fitIsStrong(fit: string): boolean {
  return fitTier(fit) === 1;
}

function fitIsNoFit(fit: string): boolean {
  const f = fit.toLowerCase();
  return /^\s*[45]/.test(f) || f.includes("not a fit");
}

// Largest dollar figure in the text ("$1,000 - $10,000,000" → 10000000).
export function parseAmount(s: string): number {
  const nums = (s.match(/\$\s*([\d,]+)/g) || []).map((m) => Number(m.replace(/[^0-9]/g, "")));
  return nums.length ? Math.max(...nums) : 0;
}

function isoDate(s: string): string {
  const t = s.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

export type ImportSummary = {
  rows: number;
  fundersCreated: number;
  fundersExisting: number;
  opportunitiesCreated: number;
  skippedNoFit: number;
  skippedNoFunder: number;
};

export async function importGrantCsv(
  csvText: string,
  opts: { addStrongToPipeline: boolean }
): Promise<ImportSummary> {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one data row.");
  const headers = rows[0];
  const col = {
    grant: findCol(headers, ["grant", "opportunity", "title", "name"]),
    funder: findCol(headers, ["funder", "foundation", "organization", "agency"]),
    fit: findCol(headers, ["fit", "rating", "tier", "priority"]),
    deadline: findCol(headers, ["deadline", "due"]),
    amount: findCol(headers, ["amount", "award", "size"]),
    notes: findCol(headers, ["why", "note", "description", "summary"]),
    link: findCol(headers, ["link", "url", "website"]),
  };
  if (col.funder < 0 && col.grant < 0) {
    throw new Error("Couldn't find a 'Funder' or 'Grant' column in the header row.");
  }

  const summary: ImportSummary = {
    rows: rows.length - 1,
    fundersCreated: 0,
    fundersExisting: 0,
    opportunitiesCreated: 0,
    skippedNoFit: 0,
    skippedNoFunder: 0,
  };
  const get = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i].trim() : "");
  const seenFunders = new Set<string>();

  for (const row of rows.slice(1)) {
    const funderName = get(row, col.funder) || get(row, col.grant);
    const grantName = get(row, col.grant);
    const fit = get(row, col.fit);
    const notes = get(row, col.notes).slice(0, 1000);
    const link = get(row, col.link);
    const website = /^https?:\/\//.test(link) ? link : "";
    const deadline = isoDate(get(row, col.deadline));
    const amountText = get(row, col.amount);

    if (!funderName) {
      summary.skippedNoFunder++;
      continue;
    }
    // "Not a fit" rows are research output too — but don't pollute the funder
    // database with funders the team already ruled out.
    if (fitIsNoFit(fit)) {
      summary.skippedNoFit++;
      continue;
    }

    const funderKey = nameKey(funderName);
    if (!seenFunders.has(funderKey)) {
      seenFunders.add(funderKey);
      const allNames = await q.all<{ name: string }>(`SELECT name FROM funders`);
      const existing = allNames.some((f) => nameKey(f.name) === funderKey);
      if (existing) {
        summary.fundersExisting++;
      } else {
        await q.run(
          `INSERT INTO funders (name, type, tier, focus, award_range, projects, website, notes)
           VALUES (?, 'foundation', ?, ?, ?, ?, ?, ?)`,
          [
            funderName,
            fitTier(fit),
            grantName ? `Known program: ${grantName}`.slice(0, 300) : "",
            amountText.slice(0, 100),
            notes.slice(0, 500),
            website,
            "Imported from grant-list CSV",
          ]
        );
        summary.fundersCreated++;
      }
    }

    if (opts.addStrongToPipeline && fitIsStrong(fit) && grantName) {
      const oppNames = await q.all<{ name: string }>(`SELECT name FROM opportunities`);
      if (!oppNames.some((o) => nameKey(o.name) === nameKey(grantName))) {
        await q.run(
          `INSERT INTO opportunities (name, funder_name, type, stage, amount, deadline, url, notes)
           VALUES (?, ?, 'foundation', 'prospect', ?, ?, ?, ?)`,
          [grantName, funderName, parseAmount(amountText), deadline, website, notes]
        );
        summary.opportunitiesCreated++;
      }
    }
  }
  return summary;
}
