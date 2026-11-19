"use client";

import { useState } from "react";
import type { AppForm, AppField, AppAnswer } from "@/lib/appform";

const TYPE_LABEL: Record<string, string> = {
  text: "short answer",
  textarea: "narrative",
  select: "choose one",
  radio: "choose one",
  checkbox: "check all that apply",
  date: "date",
  number: "number",
  file: "attachment",
};

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-green-100 text-green-800",
  verify: "bg-amber-100 text-amber-800",
  attach: "bg-blue-100 text-blue-800",
};
const STATUS_LABEL: Record<string, string> = {
  ready: "ready to paste",
  verify: "needs your check",
  attach: "attachment",
};

export default function ApplicationFiller({
  opportunityId,
  initialForm,
  defaultUrl,
  aiReady,
}: {
  opportunityId: number;
  initialForm: AppForm | null;
  defaultUrl: string;
  aiReady: boolean;
}) {
  const [form, setForm] = useState<AppForm | null>(initialForm);
  const [url, setUrl] = useState(initialForm?.url || defaultUrl || "");
  const [reading, setReading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [copied, setCopied] = useState("");

  const api = `/api/opportunities/${opportunityId}/appform`;

  async function post(body: unknown): Promise<{ form?: AppForm; ok?: boolean; error?: string }> {
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: { form?: AppForm; ok?: boolean; error?: string } = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("The server took too long — try again (hosting limits long requests).");
    }
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function read() {
    setReading(true);
    setError("");
    try {
      const data = await post({ action: "read", url });
      if (data.form) setForm(data.form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the application");
    } finally {
      setReading(false);
    }
  }

  async function answerAll() {
    setAnswering(true);
    setError("");
    try {
      const data = await post({ action: "answer" });
      if (data.form) setForm(data.form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft the answers");
    } finally {
      setAnswering(false);
    }
  }

  function setAnswer(key: string, patch: Partial<AppAnswer>) {
    setForm((f) => {
      if (!f) return f;
      const prev = f.answers[key] ?? { answer: "", status: "verify" as const };
      return { ...f, answers: { ...f.answers, [key]: { ...prev, ...patch } } };
    });
    setSavedAt("");
  }

  async function saveEdits() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      await post({ action: "save", answers: form.answers });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1500);
    } catch {
      /* clipboard unavailable — user can select manually */
    }
  }

  const questions = form?.fields.filter((f) => f.type !== "file") ?? [];
  const attachments = form?.fields.filter((f) => f.type === "file") ?? [];
  const answered = form ? Object.keys(form.answers).length : 0;

  const renderAnswer = (f: AppField) => {
    const a = form?.answers[f.key];
    return (
      <div className="mt-2 space-y-1">
        {a && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[a.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABEL[a.status] ?? a.status}
            </span>
            {a.note && <span className="text-xs text-amber-700">{a.note}</span>}
            <button onClick={() => copy(f.key, a.answer)} className="btn-secondary text-xs ml-auto">
              {copied === f.key ? "✓ copied" : "copy"}
            </button>
          </div>
        )}
        <textarea
          value={a?.answer ?? ""}
          onChange={(e) => setAnswer(f.key, { answer: e.target.value })}
          placeholder={answered ? "" : "Run “Answer everything” to draft this, or type your own answer."}
          rows={Math.min(14, Math.max(f.type === "textarea" ? 6 : 1, Math.ceil((a?.answer.length ?? 0) / 90)))}
          className="input font-sans text-sm w-full"
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="label">Application page link</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://funder.org/grant-application"
              className="input font-mono text-xs"
            />
          </div>
          <button className="btn-secondary" onClick={read} disabled={reading || answering || !aiReady} title={aiReady ? "" : "Set ANTHROPIC_API_KEY to enable"}>
            {reading && <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin mr-1" />}
            {reading ? "Reading the form…" : form ? "Re-read the application" : "Read the application"}
          </button>
          {form && (
            <button className="btn" onClick={answerAll} disabled={reading || answering || !aiReady}>
              {answering && <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" />}
              {answering ? "Drafting answers…" : answered ? "✨ Re-answer everything" : "✨ Answer everything"}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {form && (
          <p className="text-xs text-gray-500" suppressHydrationWarning>
            “{form.title}” — {form.fields.length} questions ({attachments.length} attachments) read{" "}
            {new Date(form.fetchedAt).toLocaleString()}. {answered > 0 && `${answered} drafted answers.`}
          </p>
        )}
      </div>

      {form && questions.length > 0 && (
        <div className="card divide-y">
          {questions.map((f, i) => (
            <div key={f.key} className="p-4">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-mono">{i + 1}.</span>
                <span className="text-sm font-medium">{f.label}</span>
                {f.required && <span className="text-red-500 text-xs">required</span>}
                <span className="rounded bg-gray-100 text-gray-500 px-1.5 py-0.5 text-[10px]">{TYPE_LABEL[f.type] ?? f.type}</span>
                {f.maxLength ? <span className="text-[10px] text-gray-400">max {f.maxLength} chars</span> : null}
              </div>
              {f.choices && f.choices.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">Options: {f.choices.join(" · ")}</p>
              )}
              {f.instructions && (
                <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap border-l-2 border-gray-200 pl-2">{f.instructions}</p>
              )}
              {renderAnswer(f)}
            </div>
          ))}
        </div>
      )}

      {form && attachments.length > 0 && (
        <div className="card divide-y">
          <h2 className="p-4 pb-2 font-bold text-sm">Required attachments ({attachments.length})</h2>
          {attachments.map((f) => (
            <div key={f.key} className="p-4">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium">{f.label}</span>
                {f.required && <span className="text-red-500 text-xs">required</span>}
              </div>
              {f.instructions && <p className="text-xs text-gray-500 mt-1">{f.instructions}</p>}
              {renderAnswer(f)}
            </div>
          ))}
        </div>
      )}

      {form && answered > 0 && (
        <div className="no-print sticky bottom-4 flex items-center gap-3">
          <button className="btn" onClick={saveEdits} disabled={saving}>
            {saving ? "Saving…" : "Save edits"}
          </button>
          {savedAt && <span className="text-xs text-gray-500">Saved {savedAt}</span>}
          <span className="text-xs text-gray-400">
            Answers are drafts — verify every [VERIFY] placeholder before pasting into the real form.
          </span>
        </div>
      )}
    </div>
  );
}
