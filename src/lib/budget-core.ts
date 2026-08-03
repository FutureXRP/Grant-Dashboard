// Shared budget types + math — imported by both the server module (budget.ts)
// and the client editor, so it must stay free of server-only dependencies.

export const BUDGET_CATEGORIES = [
  { key: "personnel", label: "Personnel", hint: "Salaries/wages. qty = FTE (e.g. 0.5), rate = annual salary" },
  { key: "fringe", label: "Fringe Benefits", hint: "Payroll taxes, insurance, retirement — often a % of personnel" },
  { key: "travel", label: "Travel", hint: "Mileage, per diem, conference travel" },
  { key: "equipment", label: "Equipment", hint: "Items over $5,000 per unit (federal definition)" },
  { key: "supplies", label: "Supplies", hint: "Consumables and items under $5,000" },
  { key: "contractual", label: "Contractual", hint: "Subcontracts, consultants, professional services" },
  { key: "construction", label: "Construction", hint: "Renovation/build costs (only if the program allows)" },
  { key: "other", label: "Other", hint: "Rent, utilities, insurance, training, printing …" },
] as const;

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number]["key"];

export type BudgetLine = {
  id: string;
  category: BudgetCategory;
  description: string;
  qty: number; // 0 = not using qty×rate math
  rate: number;
  requested: number; // asked from this funder
  match: number; // covered by match / cost share
  note: string; // justification detail / [VERIFY: ...] flags
};

export type Budget = {
  lines: BudgetLine[];
  indirectRatePct: number; // 0 = no indirect
  indirectExcludeEquipment: boolean; // common MTDC-style exclusion
  indirectNote: string; // e.g. "10% de minimis rate"
};

export const EMPTY_BUDGET: Budget = {
  lines: [],
  indirectRatePct: 10,
  indirectExcludeEquipment: true,
  indirectNote: "10% de minimis indirect rate (2 CFR 200.414(f))",
};

export type BudgetTotals = {
  byCategory: Record<BudgetCategory, { requested: number; match: number }>;
  directRequested: number;
  directMatch: number;
  indirect: number;
  totalRequested: number;
  totalMatch: number;
  grandTotal: number;
  matchPct: number; // match as % of grand total
};

export function computeTotals(b: Budget): BudgetTotals {
  const byCategory = Object.fromEntries(
    BUDGET_CATEGORIES.map((c) => [c.key, { requested: 0, match: 0 }])
  ) as BudgetTotals["byCategory"];
  for (const line of b.lines) {
    const cat = byCategory[line.category] ?? byCategory.other;
    cat.requested += line.requested || 0;
    cat.match += line.match || 0;
  }
  const directRequested = Object.values(byCategory).reduce((s, c) => s + c.requested, 0);
  const directMatch = Object.values(byCategory).reduce((s, c) => s + c.match, 0);
  const indirectBase = b.indirectExcludeEquipment
    ? directRequested - byCategory.equipment.requested
    : directRequested;
  const indirect = Math.round((Math.max(0, indirectBase) * (b.indirectRatePct || 0)) / 100);
  const totalRequested = directRequested + indirect;
  const totalMatch = directMatch;
  const grandTotal = totalRequested + totalMatch;
  return {
    byCategory,
    directRequested,
    directMatch,
    indirect,
    totalRequested,
    totalMatch,
    grandTotal,
    matchPct: grandTotal > 0 ? Math.round((totalMatch / grandTotal) * 100) : 0,
  };
}

