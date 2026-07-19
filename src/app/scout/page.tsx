import { revalidatePath } from "next/cache";
import { latestReport, getKeywords, setKeywords, listSources, addSource, updateSource, deleteSource, toggleSource, listDismissed } from "@/lib/scout";
import ScoutPanel from "@/components/ScoutPanel";

export const dynamic = "force-dynamic";

async function saveKeywordsAction(formData: FormData) {
  "use server";
  setKeywords(String(formData.get("keywords") || ""));
  revalidatePath("/scout");
}

async function addSourceAction(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  const url = String(formData.get("url") || "").trim();
  if (name && url) addSource(name, url, String(formData.get("kind") || "state"));
  revalidatePath("/scout");
}

async function editSourceAction(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const url = String(formData.get("url") || "").trim();
  if (id && name && url) updateSource(id, name, url);
  revalidatePath("/scout");
}

async function deleteSourceAction(formData: FormData) {
  "use server";
  deleteSource(Number(formData.get("id")));
  revalidatePath("/scout");
}

async function toggleSourceAction(formData: FormData) {
  "use server";
  toggleSource(Number(formData.get("id")));
  revalidatePath("/scout");
}

export default function ScoutPage() {
  const report = latestReport();
  const keywords = getKeywords().join("\n");
  const sources = listSources();
  const dismissed = listDismissed();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Grant Scout</h1>
      <p className="text-sm text-gray-600 max-w-3xl">
        Every run: (1) sweeps Grants.gov across your keywords for federal opportunities — including Native-focused
        programs like ANA that accept Native nonprofit organizations; (2) fetches every watched Oklahoma-agency,
        foundation, and Native-funder page, detects changes, and extracts + grades any opportunity announced there.
        Everything is graded against your organization profile with a one-line reason.
      </p>
      <ScoutPanel
        initialReport={report}
        initialKeywords={keywords}
        sources={sources}
        initialDismissed={dismissed}
        saveKeywords={saveKeywordsAction}
        addSource={addSourceAction}
        editSource={editSourceAction}
        deleteSource={deleteSourceAction}
        toggleSource={toggleSourceAction}
      />
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
