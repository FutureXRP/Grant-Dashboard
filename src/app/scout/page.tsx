import { revalidatePath } from "next/cache";
import { latestReport, getKeywords, setKeywords } from "@/lib/scout";
import ScoutPanel from "@/components/ScoutPanel";

export const dynamic = "force-dynamic";

async function saveKeywords(formData: FormData) {
  "use server";
  setKeywords(String(formData.get("keywords") || ""));
  revalidatePath("/scout");
}

export default function ScoutPage() {
  const report = latestReport();
  const keywords = getKeywords().join("\n");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Grant Scout</h1>
      <p className="text-sm text-gray-600 max-w-3xl">
        Sweeps Grants.gov across all your keywords, dedupes against everything already seen, and has the AI grade each
        open opportunity against your organization profile — <span className="font-medium">strong fit / possible fit /
        unlikely / not eligible</span> — with a one-line reason. Federal only: foundations don&apos;t have a free search
        API, so keep working the Funder database for those.
      </p>
      <ScoutPanel initialReport={report} initialKeywords={keywords} saveKeywords={saveKeywords} />
      <div className="card p-4 text-xs text-gray-600 space-y-2 max-w-3xl">
        <h3 className="font-semibold text-sm text-gray-800">Run it automatically every morning</h3>
        <p>The scout runs whenever something POSTs to <code className="bg-gray-100 px-1 rounded">/api/scout</code>. On the machine hosting the app:</p>
        <pre className="bg-gray-100 rounded p-2 overflow-x-auto">crontab -e   # then add (7:00 AM daily):
0 7 * * * curl -s -X POST http://localhost:3000/api/scout &gt; /dev/null</pre>
        <p>
          (Windows: Task Scheduler → daily → <code className="bg-gray-100 px-1 rounded">curl -s -X POST http://localhost:3000/api/scout</code>.)
          Each run is saved, so the report is waiting here with the NEW badges when you open the app.
        </p>
      </div>
    </div>
  );
}
