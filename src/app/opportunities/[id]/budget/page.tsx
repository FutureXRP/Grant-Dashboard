import Link from "next/link";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { getBudget } from "@/lib/budget";
import BudgetBuilder from "@/components/BudgetBuilder";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const opp = await q.get<{ id: number; name: string; funder_name: string; nofo_text: string }>(
    `SELECT id, name, funder_name, nofo_text FROM opportunities WHERE id=?`,
    [id]
  );
  if (!opp) notFound();
  const budget = await getBudget(id);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <div>
          <Link href={`/opportunities/${id}`} className="text-sm text-gray-500 hover:underline">
            ← {opp.name}
          </Link>
          <h1 className="text-2xl font-bold">Budget — {opp.name}</h1>
          <p className="text-sm text-gray-500">{opp.funder_name}</p>
        </div>
        <PrintButton />
      </div>
      <p className="no-print text-sm text-gray-600 max-w-3xl">
        Build the budget in the standard federal object-class categories. Personnel lines: qty = FTE, rate = annual
        salary — the requested amount computes itself (qty × rate − match). ✨ can propose the line-item structure
        from the NOFO (your real numbers always come from you) and write the budget-justification narrative from the
        amounts you enter — saved straight into the proposal&apos;s Budget Narrative section.
        {!opp.nofo_text && (
          <span className="text-amber-700"> No NOFO text is saved yet — paste it on the opportunity page first for program-specific suggestions.</span>
        )}
      </p>
      <BudgetBuilder opportunityId={id} initialBudget={budget} />
    </div>
  );
}
