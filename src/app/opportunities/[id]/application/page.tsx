import Link from "next/link";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { loadForm } from "@/lib/appform";
import { aiConfigured } from "@/lib/ai";
import ApplicationFiller from "@/components/ApplicationFiller";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const opp = await q.get<{ id: number; name: string; funder_name: string; url: string }>(
    `SELECT id, name, funder_name, url FROM opportunities WHERE id=?`,
    [id]
  );
  if (!opp) notFound();
  const form = await loadForm(id);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="no-print">
        <Link href={`/opportunities/${id}`} className="text-sm text-gray-500 hover:underline">
          ← {opp.name}
        </Link>
        <h1 className="text-2xl font-bold">Application filler — {opp.name}</h1>
        <p className="text-sm text-gray-500">{opp.funder_name}</p>
      </div>
      <p className="no-print text-sm text-gray-600 max-w-3xl">
        Paste the link to the funder&apos;s online application. The AI reads every question on it (including forms
        embedded from services like Wufoo or JotForm), then drafts a paste-ready answer to each one from your org
        profile, Library, drafted proposal sections, and budget. Review, edit, and copy each answer into the real
        form — a person always makes the final submission.
      </p>
      <ApplicationFiller opportunityId={id} initialForm={form} defaultUrl={opp.url} aiReady={aiConfigured()} />
    </div>
  );
}
