"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function DocUpload({ docId, currentFile }: { docId: number; currentFile: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("id", String(docId));
      form.set("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <input ref={inputRef} type="file" className="text-xs" onChange={upload} disabled={busy} />
        {busy && <span className="text-gray-500 animate-pulse">Uploading…</span>}
        {currentFile && !busy && (
          <span className="text-gray-500">
            On file:{" "}
            <a href={`/api/documents/${docId}/download`} className="text-emerald-700 underline">
              {currentFile}
            </a>
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
