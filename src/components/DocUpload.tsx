"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function DocUpload({ docId, currentFile }: { docId: number; currentFile: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setDone(false);
    try {
      const form = new FormData();
      form.set("id", String(docId));
      form.set("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (inputRef.current) inputRef.current.value = "";
      setDone(true);
      setTimeout(() => setDone(false), 3000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Hidden native input; the visible control is a real button. */}
      <input ref={inputRef} type="file" className="hidden" onChange={upload} disabled={busy} />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="btn"
        >
          {busy ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Uploading…
            </>
          ) : (
            <>📎 {currentFile ? "Replace file" : "Upload file"}</>
          )}
        </button>
        {done && <span className="text-sm font-semibold text-emerald-700">Uploaded ✓</span>}
        {currentFile ? (
          <span className="text-sm text-gray-600">
            On file:{" "}
            <a href={`/api/documents/${docId}/download`} className="text-emerald-700 underline font-medium">
              {currentFile}
            </a>
          </span>
        ) : (
          !busy && <span className="text-sm text-gray-400">No file uploaded yet</span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
