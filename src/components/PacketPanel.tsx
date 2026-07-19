"use client";

import { useState } from "react";
import Link from "next/link";
import type { Packet } from "@/lib/packet";

const STATUS_STYLE: Record<string, string> = {
  have_current: "bg-green-100 text-green-800",
  have_issue: "bg-amber-100 text-amber-800",
  missing: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  have_current: "✅ ready",
  have_issue: "⚠️ has issue",
  missing: "❌ missing",
};

export default function PacketPanel({
  opportunityId,
  initialPacket,
}: {
  opportunityId: number;
  initialPacket: Packet | null;
}) {
  const [packet, setPacket] = useState<Packet | null>(initialPacket);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function build() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Packet build failed");
      setPacket(data.packet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Packet build failed");
    } finally {
      setRunning(false);
    }
  }

  const ready = packet?.items.filter((i) => i.status === "have_current").length ?? 0;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">Attachment packet</h2>
        <div className="flex items-center gap-2">
          {packet && (
            <span className="text-xs text-gray-500">
              {ready}/{packet.items.length} ready · built {new Date(packet.builtAt).toLocaleDateString()}
            </span>
          )}
          <button className="btn-secondary" onClick={build} disabled={running}>
            {running ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Matching library…
              </>
            ) : packet ? (
              "Rebuild packet"
            ) : (
              "Build attachment packet"
            )}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        The agent reads the NOFO&apos;s required attachments and matches each one against your{" "}
        <Link href="/library" className="underline">Library</Link> — what&apos;s ready, what has a problem, what&apos;s
        missing and how to get it.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {packet && (
        <>
          <p className="text-sm bg-gray-50 rounded p-2">{packet.summary}</p>
          <div className="divide-y border rounded-md">
            {packet.items.map((item, i) => (
              <div key={i} className="p-2.5 text-sm flex items-start gap-3">
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold mt-0.5 ${STATUS_STYLE[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
                <div className="min-w-0">
                  <div className="font-medium">{item.requirement}</div>
                  {item.doc_id > 0 && (
                    <div className="text-xs text-gray-500">
                      Library: {item.doc_name}
                      {item.status === "have_current" && (
                        <>
                          {" · "}
                          <a href={`/api/documents/${item.doc_id}/download`} className="text-emerald-700 underline">
                            download
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {item.action && <div className="text-xs text-gray-600 mt-0.5">{item.action}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
