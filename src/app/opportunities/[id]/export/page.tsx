import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PROPOSAL_SECTIONS, fmtMoney } from "@/lib/stages";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Printable proposal package + merge letters. "Download PDF" = the browser's
// print-to-PDF on a print-styled page — zero dependencies, works everywhere.
export default async function ExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ letter?: string }>;
}) {
  const { id: idStr } = await params;
  const { letter } = await searchParams;
  const id = Number(idStr);
  const d = db();
  const opp = d.prepare(`SELECT * FROM opportunities WHERE id=?`).get(id) as
    | { id: number; name: string; funder_name: string; amount: number; deadline: string }
    | undefined;
  if (!opp) notFound();
  const profile = d.prepare(`SELECT * FROM org_profile WHERE id=1`).get() as {
    name: string; legal_status: string; mission: string; service_area: string; leadership: string;
  };
  const sections = d
    .prepare(`SELECT section_key, content FROM proposal_sections WHERE opportunity_id=? AND content != ''`)
    .all(id) as { section_key: string; content: string }[];
  const byKey = Object.fromEntries(sections.map((s) => [s.section_key, s.content]));
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Link href={`/opportunities/${id}/export`} className={!letter ? "btn" : "btn-secondary"}>
            Proposal package
          </Link>
          <Link href={`/opportunities/${id}/export?letter=loi`} className={letter === "loi" ? "btn" : "btn-secondary"}>
            Letter of Inquiry
          </Link>
          <Link href={`/opportunities/${id}/export?letter=support`} className={letter === "support" ? "btn" : "btn-secondary"}>
            Letter of Support (template)
          </Link>
          <Link href={`/opportunities/${id}/export?letter=thankyou`} className={letter === "thankyou" ? "btn" : "btn-secondary"}>
            Thank-You Letter
          </Link>
        </div>
        <PrintButton />
      </div>
      <p className="no-print text-xs text-gray-500">
        “Download PDF” opens the print dialog — choose “Save as PDF”. The page is print-styled (navigation hidden, clean margins).
      </p>

      <div className="card p-10 print:shadow-none print:border-0">
        {!letter ? (
          <article>
            <header className="mb-8 border-b pb-6">
              <h1 className="text-2xl font-bold">{opp.name}</h1>
              <p className="text-gray-600 mt-1">
                Proposal submitted by {profile.name} ({profile.legal_status})
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Funder: {opp.funder_name || "—"} · Request: {fmtMoney(opp.amount)} · Deadline: {opp.deadline || "—"} · Prepared {today}
              </p>
            </header>
            {PROPOSAL_SECTIONS.filter((s) => byKey[s.key]).map((s) => (
              <section key={s.key} className="mb-6">
                <h2 className="text-lg font-bold mb-2">{s.title}</h2>
                <div className="prose-output">{byKey[s.key]}</div>
              </section>
            ))}
            {sections.length === 0 && (
              <p className="text-gray-500">No proposal sections drafted yet — use the proposal workspace first.</p>
            )}
          </article>
        ) : (
          <article className="prose-output text-sm leading-relaxed">
            <p className="mb-6">{today}</p>
            <p className="mb-6">
              {opp.funder_name || "[Funder name]"}
              <br />
              [Contact name / title]
              <br />
              [Address]
            </p>
            <p className="mb-4">Dear [Name],</p>
            {letter === "loi" && (
              <>
                <p className="mb-4">
                  On behalf of {profile.name}, I am writing to inquire about funding through {opp.name}. We respectfully
                  request consideration for a grant of {fmtMoney(opp.amount)} to support our work in {profile.service_area}.
                </p>
                <p className="mb-4">{profile.mission}</p>
                <p className="mb-4">
                  [One paragraph on the specific project this funding would support, drawn from the proposal&apos;s executive
                  summary — and one verified statistic demonstrating need.]
                </p>
                <p className="mb-4">
                  We would welcome the opportunity to submit a full proposal and to discuss how this investment aligns with
                  your priorities. Thank you for your consideration.
                </p>
              </>
            )}
            {letter === "support" && (
              <>
                <p className="mb-4">
                  [PARTNER ORGANIZATION writes this letter — this is a fill-in template to send them.]
                </p>
                <p className="mb-4">
                  I am pleased to write in support of {profile.name}&apos;s application for {opp.name}. [Partner org] has
                  worked with {profile.name} on [describe the relationship and shared work].
                </p>
                <p className="mb-4">
                  [One paragraph on why the partner believes the project will succeed, and any commitments — referrals,
                  space, staff time — the partner is making.]
                </p>
                <p className="mb-4">We fully support this application and its goals for our community.</p>
              </>
            )}
            {letter === "thankyou" && (
              <>
                <p className="mb-4">
                  On behalf of {profile.name}, thank you for your generous award through {opp.name}. This investment
                  directly strengthens families in {profile.service_area}.
                </p>
                <p className="mb-4">
                  [One specific sentence on what the funding will do first, and when the funder can expect the first
                  progress update.]
                </p>
                <p className="mb-4">We are grateful for your partnership and look forward to reporting on the results.</p>
              </>
            )}
            <p className="mt-8">
              Sincerely,
              <br />
              <br />
              {profile.leadership.split("—")[0].trim() || "[Name]"}
              <br />
              {profile.name}
            </p>
          </article>
        )}
      </div>
    </div>
  );
}
