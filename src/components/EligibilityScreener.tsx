"use client";

import { useState } from "react";
import type { EligQuestion, EligVerdict } from "@/lib/eligibility";

const VERDICT_STYLE: Record<string, string> = {
  eligible: "bg-green-100 text-green-900 border-green-300",
  not_eligible: "bg-red-100 text-red-900 border-red-300",
  conditional: "bg-amber-100 text-amber-900 border-amber-300",
};
const VERDICT_LABEL: Record<string, string> = {
  eligible: "✅ ELIGIBLE — confirm with the program officer, then write",
  not_eligible: "⛔ NOT ELIGIBLE — do not spend writing hours here",
  conditional: "⚠️ CONDITIONAL — resolve the open items below first",
};
const STATUS_STYLE: Record<string, string> = {
  met: "bg-green-100 text-green-800",
  not_met: "bg-red-100 text-red-800",
  needs_verification: "bg-amber-100 text-amber-800",
};

export default function EligibilityScreener({
  opportunityId,
  hasNofo,
  initialQuestions,
  initialAnswers,
  initialVerdict,
}: {
  opportunityId: number;
  hasNofo: boolean;
  initialQuestions: EligQuestion[];
  initialAnswers: Record<string, string>;
  initialVerdict: EligVerdict | null;
}) {
  const [questions, setQuestions] = useState<EligQuestion[]>(initialQuestions);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [verdict, setVerdict] = useState<EligVerdict | null>(initialVerdict);
  const [busy, setBusy] = useState<"questions" | "verdict" | null>(null);
  const [error, setError] = useState("");

  async function call(mode: "questions" | "verdict") {
    setBusy(mode);
    setError("");
    try {
      const res = await fetch("/api/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, opportunityId, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (mode === "questions") {
        setQuestions(data.questions);
        setAnswers({});
        setVerdict(null);
      } else {
        setVerdict(data.verdict);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  const unanswered = questions.filter((q) => !answers[q.id]?.trim()).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn" disabled={busy !== null} onClick={() => call("questions")}>
          {busy === "questions"
            ? "Reading the notice…"
            : questions.length
              ? "Regenerate questions"
              : "Generate eligibility questions"}
        </button>
        {!hasNofo && (
          <span className="text-xs text-amber-700">
            No NOFO text saved — questions will be based on this funder&apos;s standard requirements. Paste the notice on
            the opportunity page for precise screening.
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id} className={`card p-4 ${q.knockout ? "border-l-4 border-l-red-400" : ""}`}>
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-gray-400 mt-0.5">{i + 1}.</span>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{q.question}</p>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        q.knockout ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {q.knockout ? "RULES IN/OUT" : "competitiveness"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Why it matters:</span> {q.why}
                  </p>
                  <p className="text-xs text-emerald-800 bg-emerald-50 rounded px-2 py-1">
                    <span className="font-semibold">Where to find it:</span> {q.where_to_find}
                  </p>
                  {q.answer_kind === "yes_no" ? (
                    <div className="flex gap-1.5 pt-1">
                      {["yes", "no", "unsure"].map((v) => (
                        <button
                          key={v}
                          onClick={() => setAnswers({ ...answers, [q.id]: v })}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            answers[q.id] === v
                              ? v === "yes"
                                ? "bg-green-600 text-white border-green-600"
                                : v === "no"
                                  ? "bg-red-600 text-white border-red-600"
                                  : "bg-amber-400 text-gray-900 border-amber-400"
                              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type={q.answer_kind === "number" ? "number" : "text"}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="input mt-1"
                      placeholder={q.answer_kind === "number" ? "Enter the number (or leave blank if unsure)" : "Answer (or leave blank if unsure)"}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button className="btn" disabled={busy !== null} onClick={() => call("verdict")}>
              {busy === "verdict" ? "Evaluating…" : "Get eligibility verdict"}
            </button>
            {unanswered > 0 && (
              <span className="text-xs text-gray-500">
                {unanswered} unanswered — blanks are treated as “unsure” and will make the verdict conditional.
              </span>
            )}
          </div>
        </div>
      )}

      {verdict && (
        <div className={`card border p-4 space-y-3 ${VERDICT_STYLE[verdict.verdict]}`}>
          <h3 className="font-bold">{VERDICT_LABEL[verdict.verdict]}</h3>
          <p className="text-sm">{verdict.summary}</p>
          <div className="bg-white rounded-md divide-y text-gray-900">
            {verdict.items.map((item, i) => (
              <div key={i} className="p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.requirement}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>
                    {item.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{item.reasoning}</p>
                {item.next_step && (
                  <p className="text-xs">
                    <span className="font-semibold">Next step:</span> {item.next_step}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs opacity-80">
            This screen is a decision aid, not a ruling — confirm any borderline requirement with the funder&apos;s
            program officer before committing writing hours.
          </p>
        </div>
      )}
    </div>
  );
}
