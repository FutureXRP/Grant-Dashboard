import { createClient, SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR } from "./db";

// Document file storage. If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
// files live in a private Supabase Storage bucket (durable, survives the host).
// Otherwise they live on local disk under data/uploads/. Reads fall back to
// local disk so files uploaded before Supabase was configured stay available.

const BUCKET = process.env.SUPABASE_BUCKET || "grant-documents";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let _sb: SupabaseClient | null = null;
let bucketReady = false;

function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const { data } = await sb().storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb().storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Could not create Supabase bucket "${BUCKET}": ${error.message}`);
    }
  }
  bucketReady = true;
}

function localPath(docId: number, fileName: string): string {
  return path.join(UPLOADS_DIR, String(docId), path.basename(fileName));
}

export async function saveDocFile(
  docId: number,
  fileName: string,
  buf: Buffer,
  previousFileName?: string
): Promise<void> {
  if (supabaseConfigured()) {
    await ensureBucket();
    if (previousFileName && previousFileName !== fileName) {
      await sb().storage.from(BUCKET).remove([`${docId}/${previousFileName}`]);
    }
    const { error } = await sb()
      .storage.from(BUCKET)
      .upload(`${docId}/${fileName}`, buf, { upsert: true, contentType: "application/octet-stream" });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return;
  }
  const dir = path.join(UPLOADS_DIR, String(docId));
  fs.mkdirSync(dir, { recursive: true });
  if (previousFileName && previousFileName !== fileName) {
    try {
      fs.unlinkSync(localPath(docId, previousFileName));
    } catch {
      /* previous file already gone */
    }
  }
  fs.writeFileSync(localPath(docId, fileName), buf);
}

export async function readDocFile(docId: number, fileName: string): Promise<Buffer | null> {
  if (supabaseConfigured()) {
    try {
      await ensureBucket();
      const { data } = await sb().storage.from(BUCKET).download(`${docId}/${fileName}`);
      if (data) return Buffer.from(await data.arrayBuffer());
    } catch {
      /* fall through to local disk (pre-Supabase uploads) */
    }
  }
  const p = localPath(docId, fileName);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  return null;
}
