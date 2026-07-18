import { db } from "@/lib/db";
import { saveProfile } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Profile = {
  name: string; legal_status: string; mission: string; vision: string; programs: string;
  service_area: string; populations: string; leadership: string; stats: string; ein: string; uei: string;
};

export default function ProfilePage() {
  const p = db().prepare(`SELECT * FROM org_profile WHERE id=1`).get() as Profile;

  const field = (name: keyof Profile, label: string, rows = 2, hint?: string) => (
    <div>
      <label className="label">{label}</label>
      {rows === 1 ? (
        <input name={name} defaultValue={p[name]} className="input" />
      ) : (
        <textarea name={name} rows={rows} defaultValue={p[name]} className="input" />
      )}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Organization profile</h1>
      <p className="text-sm text-gray-600">
        The AI agents draft every proposal from this profile plus the narrative library. Keep it accurate — and fill in
        the verified statistics field with <em>real numbers only</em>.
      </p>
      <form action={saveProfile} className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {field("name", "Organization name", 1)}
          {field("legal_status", "Legal status", 1)}
        </div>
        {field("mission", "Mission", 3)}
        {field("vision", "Vision", 3)}
        {field("programs", "Programs", 3)}
        <div className="grid grid-cols-2 gap-4">
          {field("service_area", "Service area", 1)}
          <div className="grid grid-cols-2 gap-3">
            {field("ein", "EIN", 1)}
            {field("uei", "UEI", 1)}
          </div>
        </div>
        {field("populations", "Populations served", 3)}
        {field("leadership", "Leadership", 3)}
        {field(
          "stats",
          "VERIFIED statistics",
          4,
          "Annual patients served, children enrolled, counties, outcomes — with sources. The AI will never invent numbers; anything missing here becomes a [VERIFY] placeholder in drafts."
        )}
        <button className="btn">Save profile</button>
      </form>
    </div>
  );
}
