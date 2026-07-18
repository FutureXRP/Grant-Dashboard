import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getScreen } from "@/lib/eligibility";
import EligibilityScreener from "@/components/EligibilityScreener";

export const dynamic = "force-dynamic";

export default async function EligibilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const opp = db()
    .prepare(`SELECT id, name, funder_name, nofo_text FROM opportunities WHERE id=?`)
    .get(id) as { id: number; name: string; funder_name: string; nofo_text: string } | undefined;
  if (!opp) notFound();
  const screen = getScreen(id);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Eligibility screen — {opp.name}</h1>
        <p className="text-sm text-gray-500">
          {opp.funder_name} ·{" "}
          <Link href={`/opportunities/${id}`} className="underline">back to opportunity</Link>
        </p>
      </div>
      <p className="text-sm text-gray-600">
        The screener reads the funding notice, asks you the specific facts that rule you <em>in or out</em> — status,
        classifications, enrollment numbers, designations — and tells you exactly where each answer lives (which
        document, which website, who to call). Answer what you know; leave blanks for what you don&apos;t. Do this{" "}
        <span className="font-semibold">before</span> anyone spends an hour writing.
      </p>
      <EligibilityScreener
        opportunityId={id}
        hasNofo={Boolean(opp.nofo_text)}
        initialQuestions={screen.questions}
        initialAnswers={screen.answers}
        initialVerdict={screen.verdict}
      />
    </div>
  );
}
