import Link from "next/link";
import { notFound } from "next/navigation";
import { db, ensureProposalSections } from "@/lib/db";
import { PROPOSAL_SECTIONS } from "@/lib/stages";
import { saveSection } from "@/lib/actions";
import SectionEditor from "@/components/SectionEditor";
import AiPanel from "@/components/AiPanel";

export const dynamic = "force-dynamic";

export default async function ProposalWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const d = db();
  const opp = d.prepare(`SELECT id, name, funder_name, nofo_text FROM opportunities WHERE id=?`).get(id) as
    | { id: number; name: string; funder_name: string; nofo_text: string }
    | undefined;
  if (!opp) notFound();
  ensureProposalSections(id);
  const rows = d
    .prepare(`SELECT section_key, content FROM proposal_sections WHERE opportunity_id=?`)
    .all(id) as { section_key: string; content: string }[];
  const contentByKey = Object.fromEntries(rows.map((r) => [r.section_key, r.content]));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proposal — {opp.name}</h1>
          <p className="text-sm text-gray-500">
            {opp.funder_name} ·{" "}
            <Link href={`/opportunities/${id}`} className="underline">back to opportunity</Link>
            {" · "}
            <Link href={`/opportunities/${id}/export`} className="underline">export / PDF</Link>
          </p>
        </div>
      </div>

      {!opp.nofo_text && (
        <div className="card p-3 bg-amber-50 border-amber-300 text-sm text-amber-900">
          No NOFO text saved yet — the AI drafts will be generic. Paste the funding notice on the{" "}
          <Link href={`/opportunities/${id}`} className="underline font-medium">opportunity page</Link> first.
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          {PROPOSAL_SECTIONS.map((s) => (
            <SectionEditor
              key={s.key}
              opportunityId={id}
              sectionKey={s.key}
              sectionTitle={s.title}
              initialContent={contentByKey[s.key] ?? ""}
              saveAction={saveSection.bind(null, id, s.key)}
            />
          ))}
        </div>
        <div className="space-y-4">
          <AiPanel
            opportunityId={id}
            actions={[
              { action: "red_team", label: "Red-team the full draft" },
              { action: "compliance_check", label: "Compliance check" },
            ]}
          />
          <div className="card p-4 text-xs text-gray-600 space-y-2">
            <h3 className="font-semibold text-sm text-gray-800">Before submitting</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li>Every [VERIFY: …] placeholder replaced with a real, sourced number</li>
              <li>Budget totals match the budget narrative</li>
              <li>All required attachments collected (see Library)</li>
              <li>Internal review + sign-off complete</li>
              <li>Submitted with time to spare; confirmation number saved in Notes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
