import { createOpportunity } from "@/lib/actions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewOpportunity({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | undefined }>;
}) {
  const sp = await searchParams;
  const funders = db().prepare(`SELECT name FROM funders ORDER BY tier, name`).all() as { name: string }[];

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">New Opportunity</h1>
      <form action={createOpportunity} className="card p-5 space-y-4">
        <div>
          <label className="label">Grant / opportunity name</label>
          <input name="name" required className="input" defaultValue={sp.title || ""} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Funder</label>
            <input name="funder_name" className="input" list="funder-list" defaultValue={sp.agency || ""} />
            <datalist id="funder-list">
              {funders.map((f) => (
                <option key={f.name} value={f.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" defaultValue="federal">
              <option value="federal">Federal</option>
              <option value="state">State</option>
              <option value="foundation">Foundation</option>
              <option value="corporate">Corporate</option>
              <option value="healthcare">Healthcare</option>
              <option value="tribal">Tribal partnership</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Amount to request ($)</label>
            <input name="amount" type="number" min="0" className="input" />
          </div>
          <div>
            <label className="label">Application deadline</label>
            <input name="deadline" type="date" className="input" defaultValue={sp.deadline || ""} />
          </div>
          <div>
            <label className="label">LOI deadline (if any)</label>
            <input name="loi_deadline" type="date" className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Opportunity URL</label>
            <input name="url" className="input" defaultValue={sp.url || ""} />
          </div>
          <div>
            <label className="label">Grants.gov number</label>
            <input name="grants_gov_number" className="input" defaultValue={sp.number || ""} />
          </div>
        </div>
        <div>
          <label className="label">Eligibility notes</label>
          <input
            name="eligibility_notes"
            className="input"
            placeholder="e.g. 501(c)(3) eligible; check tribal-org requirement"
          />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={3} className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="renewal" /> This is a renewal of an existing award
        </label>
        <button className="btn">Create opportunity</button>
      </form>
    </div>
  );
}
