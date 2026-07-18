"use client";

import { useState } from "react";

export default function AiPanel({
  opportunityId,
  actions,
}: {
  opportunityId: number;
  actions: { action: string; label: string; hint?: string }[];
}) {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(action: string) {
    setRunning(action);
    setError("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, opportunityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setOutput(data.output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">AI Copilot</h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.action}
            onClick={() => run(a.action)}
            disabled={running !== null}
            className="btn-secondary"
            title={a.hint}
          >
            {running === a.action ? "Working…" : a.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {running && (
        <p className="text-sm text-gray-500 animate-pulse">
          The agent is reading the NOFO and your organization profile — long analyses can take a couple of minutes…
        </p>
      )}
      {output && (
        <div className="border rounded-md bg-gray-50 p-3 max-h-[32rem] overflow-y-auto">
          <div className="flex justify-end mb-1">
            <button className="btn-secondary text-xs" onClick={() => navigator.clipboard.writeText(output)}>
              Copy
            </button>
          </div>
          <div className="prose-output">{output}</div>
        </div>
      )}
    </div>
  );
}
