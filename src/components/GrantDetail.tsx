"use client";

import Link from "next/link";
import { deadlineColor } from "@/lib/stages";
import { LANE_LABEL } from "@/lib/targeting";

// Shared pieces for the grant lists: grade chip styles, deadline parsing, and
// the right-docked detail panel used by both the scout lists and discovery.

export const GRADE_STYLE: Record<string, string> = {
  strong_fit: "bg-green-100 text-green-800",
  possible_fit: "bg-blue-100 text-blue-800",
  unlikely: "bg-gray-100 text-gray-600",
  not_eligible: "bg-red-100 text-red-700",
};
export const GRADE_LABEL: Record<string, string> = {
  strong_fit: "strong fit",
  possible_fit: "possible fit",
  unlikely: "unlikely",
  not_eligible: "not eligible",
};

// Shared column template so headers and rows line up across every list.
export const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_9rem_8rem_5.5rem_8rem] gap-3 items-center";

// Parse a deadline for sorting/windows: MM/DD/YYYY, YYYY-MM-DD, or
// "Month D, YYYY" anywhere in the text. Unparseable ("Rolling", "") sorts last.
export function deadlineTime(s: string): number {
  const str = (s || "").trim();
  if (str) {
    let m = str.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (m) {
      const t = Date.parse(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
      if (!Number.isNaN(t)) return t;
    }
    m = str.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (m) {
      const t = Date.parse(m[0]);
      if (!Number.isNaN(t)) return t;
    }
    m = str.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
    if (m) {
      const t = Date.parse(`${m[1]} ${m[2]}, ${m[3]}`);
      if (!Number.isNaN(t)) return t;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

export function daysFromText(s: string): number | null {
  const t = deadlineTime(s);
  if (t === Number.MAX_SAFE_INTEGER) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

export type Detail = {
  id: string;
  title: string;
  sub: string;
  url: string;
  number?: string;
  status?: string;
  deadlineText: string;
  days: number | null;
  grade?: string;
  reason?: string;
  lane?: string;
  keyword?: string;
  details?: string;
  amount?: string;
  nextStep?: string;
  isNew: boolean;
  pipelineHref: string;
  dismissPayload: { key?: string; number?: string; source?: string; title: string };
  watchUrl?: string;
};

export function DetailPanel({
  detail,
  onClose,
  onDismiss,
  onWatch,
  watched,
}: {
  detail: Detail | null;
  onClose: () => void;
  onDismiss: (d: Detail) => void;
  onWatch?: (d: Detail) => void;
  watched?: boolean;
}) {
  if (!detail) return null;
  return (
    <aside className="no-print fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-white border-l border-gray-200 shadow-2xl overflow-y-auto">
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {detail.isNew && (
                <span className="rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-bold">NEW</span>
              )}
              {detail.grade && (
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${GRADE_STYLE[detail.grade]}`}>
                  {GRADE_LABEL[detail.grade]}
                </span>
              )}
              {detail.lane && (
                <span className="rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px] font-semibold">
                  {LANE_LABEL[detail.lane] ?? detail.lane}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold leading-snug">{detail.title}</h2>
            <p className="text-sm text-gray-500">{detail.sub}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded border border-gray-200 px-2 py-1 text-sm text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Deadline</div>
            <div>
              {detail.deadlineText}
              {detail.days !== null && (
                <span className={`ml-2 rounded px-2 py-0.5 text-[10px] font-bold ${deadlineColor(detail.days)}`}>
                  {detail.days < 0 ? "passed" : `${detail.days} days left`}
                </span>
              )}
            </div>
          </div>
          {detail.amount && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Amount</div>
              <div>{detail.amount}</div>
            </div>
          )}
          {detail.number && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Opportunity #</div>
              <div className="font-mono text-xs">{detail.number}{detail.status ? ` · ${detail.status}` : ""}</div>
            </div>
          )}
          {detail.keyword && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Matched keyword</div>
              <div>“{detail.keyword}”</div>
            </div>
          )}
        </div>

        {detail.details && <p className="text-sm text-gray-700">{detail.details}</p>}
        {detail.reason && (
          <div className="rounded bg-gray-50 border border-gray-100 p-3 text-sm">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Why this grade</div>
            {detail.reason}
          </div>
        )}
        {detail.nextStep && (
          <div className="rounded bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900">
            <div className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold mb-0.5">Next step</div>
            {detail.nextStep}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          {detail.url && (
            <a href={detail.url} target="_blank" rel="noreferrer" className="btn text-sm">
              Open the notice ↗
            </a>
          )}
          <Link href={detail.pipelineHref} className="btn-secondary text-sm">
            + Add to pipeline
          </Link>
          {detail.watchUrl && onWatch && (
            <button onClick={() => onWatch(detail)} disabled={watched} className="btn-secondary text-sm disabled:text-emerald-700">
              {watched ? "✓ watching" : "+ Watch this page"}
            </button>
          )}
          <button
            onClick={() => onDismiss(detail)}
            className="btn-secondary text-sm text-red-600"
          >
            Dismiss forever
          </button>
        </div>
      </div>
    </aside>
  );
}
