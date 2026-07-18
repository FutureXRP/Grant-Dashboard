// Pipeline stages and probability weights from the playbook (Build3.md, Section 22).
export type Stage = {
  key: string;
  label: string;
  p: number; // forecast probability used for the weighted pipeline
  preAward: boolean;
};

export const STAGES: Stage[] = [
  { key: "prospect", label: "Prospect", p: 0.1, preAward: true },
  { key: "qualified", label: "Qualified", p: 0.2, preAward: true },
  { key: "relationship", label: "Relationship Dev", p: 0.35, preAward: true },
  { key: "development", label: "Proposal Dev", p: 0.5, preAward: true },
  { key: "submitted", label: "Submitted", p: 0.6, preAward: true },
  { key: "under_review", label: "Under Review", p: 0.75, preAward: true },
  { key: "pending_award", label: "Award Pending", p: 0.9, preAward: true },
  { key: "awarded", label: "Awarded", p: 1, preAward: false },
  { key: "reporting", label: "Reporting", p: 1, preAward: false },
  { key: "closed", label: "Closed", p: 0, preAward: false },
];

export const stageByKey = (key: string): Stage =>
  STAGES.find((s) => s.key === key) ?? STAGES[0];

// Qualification scorecard from Section 7: eight criteria, >=75/100 to proceed.
export const QUAL_CRITERIA: { key: string; label: string; weight: number }[] = [
  { key: "mission", label: "Mission Alignment", weight: 20 },
  { key: "funding", label: "Funding Size", weight: 10 },
  { key: "competition", label: "Competition Level", weight: 10 },
  { key: "strategic", label: "Strategic Value", weight: 15 },
  { key: "capacity", label: "Staff Capacity", weight: 10 },
  { key: "probability", label: "Probability of Award", weight: 15 },
  { key: "partnership", label: "Partnership Opportunity", weight: 10 },
  { key: "executive", label: "Executive Priority", weight: 10 },
];

// scores: { [criterionKey]: 0-10 }
export function qualTotal(scores: Record<string, number>): number {
  return Math.round(
    QUAL_CRITERIA.reduce(
      (sum, c) => sum + ((scores[c.key] ?? 0) / 10) * c.weight,
      0
    )
  );
}

export const PROPOSAL_SECTIONS: { key: string; title: string }[] = [
  { key: "executive_summary", title: "Executive Summary" },
  { key: "need_statement", title: "Statement of Need" },
  { key: "program_design", title: "Program Design & Activities" },
  { key: "objectives", title: "Goals & SMART Objectives" },
  { key: "evaluation", title: "Evaluation Plan" },
  { key: "sustainability", title: "Sustainability Plan" },
  { key: "capacity", title: "Organizational Capacity" },
  { key: "budget_narrative", title: "Budget Narrative" },
  { key: "logic_model", title: "Logic Model" },
  { key: "work_plan", title: "Work Plan & Timeline" },
];

export function fmtMoney(n: number | null | undefined): string {
  if (!n) return "—";
  return "$" + n.toLocaleString("en-US");
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T23:59:59");
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

// Deadline urgency colors per the playbook's green/yellow/orange/red coding.
export function deadlineColor(days: number | null): string {
  if (days === null) return "bg-gray-200 text-gray-600";
  if (days < 0) return "bg-gray-800 text-white";
  if (days <= 7) return "bg-red-600 text-white";
  if (days <= 14) return "bg-orange-500 text-white";
  if (days <= 30) return "bg-yellow-400 text-gray-900";
  return "bg-green-600 text-white";
}
