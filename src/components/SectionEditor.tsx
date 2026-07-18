"use client";

import { useState } from "react";

export default function SectionEditor({
  opportunityId,
  sectionKey,
  sectionTitle,
  initialContent,
  saveAction,
}: {
  opportunityId: number;
  sectionKey: string;
  sectionTitle: string;
  initialContent: string;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [text, setText] = useState(initialContent);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function runAi(action: string, extra: Record<string, unknown> = {}) {
    setRunning(action);
    setError("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          opportunityId,
          sectionKey,
          sectionTitle,
          text,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setText(data.output);
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setRunning(null);
    }
  }

  async function save() {
    const fd = new FormData();
    fd.set("content", text);
    await saveAction(fd);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const busy = running !== null;
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{sectionTitle}</h3>
        <div className="flex gap-1.5">
          <button className="btn-secondary text-xs" disabled={busy} onClick={() => runAi("draft_section")}>
            {running === "draft_section" ? "Drafting…" : text ? "AI: Revise draft" : "AI: Draft"}
          </button>
          <button className="btn-secondary text-xs" disabled={busy || !text} onClick={() => runAi("improve")}>
            {running === "improve" ? "…" : "AI: Improve"}
          </button>
          <button
            className="btn-secondary text-xs"
            disabled={busy || !text}
            onClick={() => runAi("shorten", { targetWords: 250 })}
          >
            {running === "shorten" ? "…" : "AI: Shorten"}
          </button>
          {sectionKey === "objectives" && (
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => runAi("smart_objectives")}>
              {running === "smart_objectives" ? "…" : "AI: SMART objectives"}
            </button>
          )}
          <button className="btn text-xs" onClick={save} disabled={busy}>
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={text ? Math.min(24, Math.max(6, text.split("\n").length + 2)) : 6}
        className="input font-mono text-xs leading-relaxed"
        placeholder={`Write or AI-draft the ${sectionTitle.toLowerCase()}…`}
      />
    </div>
  );
}
