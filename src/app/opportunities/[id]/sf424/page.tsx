import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getFederalIdentity,
  saveFederalIdentity,
  getSf424,
  saveSf424,
  sf424Total,
  IDENTITY_FIELDS,
  SF424_FIELDS,
  type FederalIdentity,
  type Sf424Data,
} from "@/lib/sf424";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const money = (v: string) => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && v !== ""
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "";
};

export default async function Sf424Page({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const opp = db()
    .prepare(`SELECT id, name, funder_name, amount, grants_gov_number, sf424_json FROM opportunities WHERE id=?`)
    .get(id) as
    | { id: number; name: string; funder_name: string; amount: number; grants_gov_number: string; sf424_json: string }
    | undefined;
  if (!opp) notFound();

  const identity = getFederalIdentity();
  const data = getSf424(opp, identity);
  const total = sf424Total(data);
  const today = new Date().toLocaleDateString("en-US");

  async function saveIdentityAction(formData: FormData) {
    "use server";
    const next = Object.fromEntries(
      IDENTITY_FIELDS.map((f) => [f.key, String(formData.get(f.key) ?? "")])
    ) as FederalIdentity;
    saveFederalIdentity(next);
    revalidatePath(`/opportunities/${id}/sf424`);
  }

  async function saveSf424Action(formData: FormData) {
    "use server";
    const next = Object.fromEntries(
      SF424_FIELDS.map((k) => [k, String(formData.get(k) ?? "")])
    ) as Sf424Data;
    saveSf424(id, next);
    revalidatePath(`/opportunities/${id}/sf424`);
  }

  // A value cell: real data, or a highlighted VERIFY flag when still blank.
  const val = (v: string, verifyLabel = "VERIFY — fill in above") =>
    v ? (
      <span>{v}</span>
    ) : (
      <span className="bg-amber-100 text-amber-800 px-1 rounded text-xs font-semibold">[{verifyLabel}]</span>
    );

  const item = (num: string, label: string, content: React.ReactNode) => (
    <div className="border border-gray-300 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
        {num}. {label}
      </div>
      <div className="text-sm mt-0.5">{content}</div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <div>
          <Link href={`/opportunities/${id}`} className="text-sm text-gray-500 hover:underline">
            ← {opp.name}
          </Link>
          <h1 className="text-2xl font-bold">SF-424 — Application for Federal Assistance</h1>
        </div>
        <PrintButton />
      </div>

      <div className="no-print card p-4 text-xs text-gray-600 space-y-1">
        <p>
          This is a <strong>completed preparation copy</strong> of the SF-424 built from your saved organization
          identity and this grant&apos;s details — every numbered item with your answer, ready to transcribe into
          Grants.gov Workspace (or print/save as PDF for the file). Anything still highlighted{" "}
          <span className="bg-amber-100 text-amber-800 px-1 rounded font-semibold">[VERIFY]</span> needs a value below.
          Final entry and submission always happen in Grants.gov under your account.
        </p>
      </div>

      {/* One-time org identity (shared by every application) */}
      <details className="no-print card">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          Organization identity — entered once, reused on every SF-424 (
          {IDENTITY_FIELDS.filter((f) => identity[f.key]).length}/{IDENTITY_FIELDS.length} filled)
        </summary>
        <form action={saveIdentityAction} className="px-4 pb-4 grid grid-cols-2 gap-3">
          {IDENTITY_FIELDS.map((f) => (
            <div key={f.key} className={f.hint ? "col-span-2" : ""}>
              <label className="label">{f.label}</label>
              <input name={f.key} defaultValue={identity[f.key]} className="input text-sm" />
              {f.hint && <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>}
            </div>
          ))}
          <div className="col-span-2">
            <button className="btn">Save identity</button>
          </div>
        </form>
      </details>

      {/* Per-grant values */}
      <details className="no-print card" open={!opp.sf424_json}>
        <summary className="cursor-pointer p-3 text-sm font-medium">This application&apos;s details</summary>
        <form action={saveSf424Action} className="px-4 pb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">1. Type of submission</label>
            <select name="submission_type" defaultValue={data.submission_type} className="input text-sm">
              <option>Application</option>
              <option>Preapplication</option>
              <option>Changed/Corrected Application</option>
            </select>
          </div>
          <div>
            <label className="label">2. Type of application</label>
            <select name="application_type" defaultValue={data.application_type} className="input text-sm">
              <option>New</option>
              <option>Continuation</option>
              <option>Revision</option>
            </select>
          </div>
          <div>
            <label className="label">10. Federal agency</label>
            <input name="federal_agency" defaultValue={data.federal_agency} className="input text-sm" />
          </div>
          <div>
            <label className="label">11. Assistance Listing (CFDA) number + title</label>
            <input name="assistance_listing" defaultValue={data.assistance_listing} className="input text-sm" placeholder="e.g. 93.612 — Native American Programs" />
          </div>
          <div>
            <label className="label">12. Funding opportunity number</label>
            <input name="opportunity_number" defaultValue={data.opportunity_number} className="input text-sm" />
          </div>
          <div>
            <label className="label">12. Funding opportunity title</label>
            <input name="opportunity_title" defaultValue={data.opportunity_title} className="input text-sm" />
          </div>
          <div>
            <label className="label">13. Competition ID (if any)</label>
            <input name="competition_id" defaultValue={data.competition_id} className="input text-sm" />
          </div>
          <div>
            <label className="label">14. Areas affected by project</label>
            <input name="areas_affected" defaultValue={data.areas_affected} className="input text-sm" placeholder="e.g. Oakhurst community, Tulsa County, Oklahoma" />
          </div>
          <div className="col-span-2">
            <label className="label">15. Descriptive title of project</label>
            <input name="project_title" defaultValue={data.project_title} className="input text-sm" />
          </div>
          <div>
            <label className="label">16b. Congressional district of project</label>
            <input name="district_project" defaultValue={data.district_project} className="input text-sm" placeholder="e.g. OK-001" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">17a. Start date</label>
              <input name="start_date" type="date" defaultValue={data.start_date} className="input text-sm" />
            </div>
            <div>
              <label className="label">17b. End date</label>
              <input name="end_date" type="date" defaultValue={data.end_date} className="input text-sm" />
            </div>
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-3">
            {(
              [
                ["fund_federal", "18a. Federal $"],
                ["fund_applicant", "18b. Applicant $"],
                ["fund_state", "18c. State $"],
                ["fund_local", "18d. Local $"],
                ["fund_other", "18e. Other $"],
                ["fund_income", "18f. Program income $"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input name={k} defaultValue={data[k]} className="input text-sm" inputMode="numeric" />
              </div>
            ))}
          </div>
          <div className="col-span-2">
            <button className="btn">Save application details</button>
          </div>
        </form>
      </details>

      {/* The completed form — print this */}
      <div className="card p-8 print:shadow-none print:border-0 space-y-3">
        <header className="border-b-2 border-gray-800 pb-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">APPLICATION FOR FEDERAL ASSISTANCE — SF-424</h2>
            <span className="text-xs text-gray-500">Preparation copy · {today}</span>
          </div>
          <p className="text-[10px] text-gray-500">
            Values prepared by {identity.legal_name || "the organization"} for entry into Grants.gov Workspace. Not an
            official submission.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-0">
          {item("1", "Type of submission", val(data.submission_type))}
          {item("2", "Type of application", val(data.application_type))}
        </div>
        <div className="grid grid-cols-1 gap-0">
          {item(
            "8a–c",
            "Applicant — legal name / EIN / UEI",
            <div className="space-y-0.5">
              <div>{val(identity.legal_name)}</div>
              <div className="text-xs text-gray-600">EIN: {val(identity.ein)} &nbsp;·&nbsp; UEI: {val(identity.uei)}</div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-0">
          {item(
            "8d",
            "Address",
            <div>
              {val(identity.street)}
              <br />
              {val(identity.city)}, {val(identity.state)} {val(identity.zip)}
              <br />
              <span className="text-xs text-gray-600">County: {val(identity.county)} · USA</span>
            </div>
          )}
          {item(
            "8e–f",
            "Org unit / contact person",
            <div>
              {identity.org_unit && <div className="text-xs text-gray-600">{identity.org_unit}</div>}
              {val(identity.contact_name)} — {val(identity.contact_title)}
              <br />
              <span className="text-xs text-gray-600">
                {val(identity.contact_phone)} · {val(identity.contact_email)}
              </span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-0">
          {item("9", "Type of applicant", val(identity.applicant_type))}
          {item("10", "Name of federal agency", val(data.federal_agency))}
        </div>
        <div className="grid grid-cols-2 gap-0">
          {item("11", "Assistance Listing (CFDA)", val(data.assistance_listing, "VERIFY — from the NOFO cover page"))}
          {item(
            "12",
            "Funding opportunity number & title",
            <div>
              {val(data.opportunity_number)}
              <div className="text-xs text-gray-600">{data.opportunity_title}</div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-0">
          {item("13", "Competition identification", data.competition_id ? <span>{data.competition_id}</span> : <span className="text-gray-400 text-xs">None stated</span>)}
          {item("14", "Areas affected by project", val(data.areas_affected))}
        </div>
        {item("15", "Descriptive title of applicant's project", val(data.project_title))}
        <div className="grid grid-cols-2 gap-0">
          {item(
            "16",
            "Congressional districts (a. applicant / b. project)",
            <span>
              {val(identity.congressional_district)} / {val(data.district_project)}
            </span>
          )}
          {item(
            "17",
            "Proposed project (a. start / b. end)",
            <span>
              {val(data.start_date)} — {val(data.end_date)}
            </span>
          )}
        </div>
        {item(
          "18",
          "Estimated funding",
          <table className="w-full text-xs mt-1">
            <tbody>
              {(
                [
                  ["a. Federal", data.fund_federal],
                  ["b. Applicant", data.fund_applicant],
                  ["c. State", data.fund_state],
                  ["d. Local", data.fund_local],
                  ["e. Other", data.fund_other],
                  ["f. Program income", data.fund_income],
                ] as const
              ).map(([label, v]) => (
                <tr key={label} className="border-b border-gray-100">
                  <td className="py-0.5">{label}</td>
                  <td className="py-0.5 text-right font-mono">{money(v) || <span className="bg-amber-100 text-amber-800 px-1 rounded font-sans font-semibold">[VERIFY]</span>}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-0.5">g. TOTAL</td>
                <td className="py-0.5 text-right font-mono">{money(String(total))}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div className="grid grid-cols-2 gap-0">
          {item("19", "Application subject to state E.O. 12372 review?", val(identity.eo12372))}
          {item("20", "Delinquent on any federal debt?", val(identity.federal_debt))}
        </div>
        {item(
          "21",
          "Authorized representative (certifies the application)",
          <div>
            {val(identity.auth_rep_name)} — {val(identity.auth_rep_title)}
            <br />
            <span className="text-xs text-gray-600">
              {val(identity.auth_rep_phone)} · {val(identity.auth_rep_email)}
            </span>
            <div className="mt-4 grid grid-cols-2 gap-8 text-xs text-gray-500">
              <div className="border-t border-gray-400 pt-1">Signature of authorized representative</div>
              <div className="border-t border-gray-400 pt-1">Date signed</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
