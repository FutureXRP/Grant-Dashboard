"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, DEFAULT_TASKS, ensureProposalSections } from "./db";
import { qualTotal, QUAL_CRITERIA } from "./stages";

export async function createOpportunity(formData: FormData) {
  const d = db();
  const res = d
    .prepare(
      `INSERT INTO opportunities (name, funder_name, type, amount, deadline, loi_deadline, url, grants_gov_number, eligibility_notes, notes, renewal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(formData.get("name") || "Untitled opportunity"),
      String(formData.get("funder_name") || ""),
      String(formData.get("type") || "federal"),
      Number(formData.get("amount") || 0),
      String(formData.get("deadline") || ""),
      String(formData.get("loi_deadline") || ""),
      String(formData.get("url") || ""),
      String(formData.get("grants_gov_number") || ""),
      String(formData.get("eligibility_notes") || ""),
      String(formData.get("notes") || ""),
      formData.get("renewal") ? 1 : 0
    );
  const id = Number(res.lastInsertRowid);
  const insTask = d.prepare(`INSERT INTO tasks (opportunity_id, title) VALUES (?, ?)`);
  for (const t of DEFAULT_TASKS) insTask.run(id, t);
  ensureProposalSections(id);
  revalidatePath("/");
  redirect(`/opportunities/${id}`);
}

export async function updateOpportunity(id: number, formData: FormData) {
  const d = db();
  d.prepare(
    `UPDATE opportunities SET name=?, funder_name=?, type=?, amount=?, deadline=?, loi_deadline=?, report_due=?, url=?, eligibility_notes=?, notes=?, renewal=?, awarded_amount=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    String(formData.get("name") || "Untitled"),
    String(formData.get("funder_name") || ""),
    String(formData.get("type") || "federal"),
    Number(formData.get("amount") || 0),
    String(formData.get("deadline") || ""),
    String(formData.get("loi_deadline") || ""),
    String(formData.get("report_due") || ""),
    String(formData.get("url") || ""),
    String(formData.get("eligibility_notes") || ""),
    String(formData.get("notes") || ""),
    formData.get("renewal") ? 1 : 0,
    Number(formData.get("awarded_amount") || 0),
    id
  );
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/");
}

export async function setStage(id: number, stage: string) {
  db()
    .prepare(`UPDATE opportunities SET stage=?, updated_at=datetime('now') WHERE id=?`)
    .run(stage, id);
  revalidatePath("/pipeline");
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/");
}

export async function deleteOpportunity(id: number) {
  const d = db();
  d.prepare(`DELETE FROM opportunities WHERE id=?`).run(id);
  d.prepare(`DELETE FROM tasks WHERE opportunity_id=?`).run(id);
  d.prepare(`DELETE FROM proposal_sections WHERE opportunity_id=?`).run(id);
  revalidatePath("/");
  redirect("/pipeline");
}

export async function saveQualScores(id: number, formData: FormData) {
  const scores: Record<string, number> = {};
  for (const c of QUAL_CRITERIA) {
    scores[c.key] = Math.max(0, Math.min(10, Number(formData.get(c.key) || 0)));
  }
  const d = db();
  d.prepare(`UPDATE opportunities SET qual_scores=?, updated_at=datetime('now') WHERE id=?`).run(
    JSON.stringify(scores),
    id
  );
  // Auto-advance prospect -> qualified when the scorecard clears the bar.
  const total = qualTotal(scores);
  const row = d.prepare(`SELECT stage FROM opportunities WHERE id=?`).get(id) as { stage: string };
  if (total >= 75 && row.stage === "prospect") {
    d.prepare(`UPDATE opportunities SET stage='qualified' WHERE id=?`).run(id);
  }
  revalidatePath(`/opportunities/${id}`);
}

export async function saveNofoText(id: number, formData: FormData) {
  db()
    .prepare(`UPDATE opportunities SET nofo_text=?, updated_at=datetime('now') WHERE id=?`)
    .run(String(formData.get("nofo_text") || ""), id);
  revalidatePath(`/opportunities/${id}`);
}

export async function toggleTask(taskId: number, oppId: number) {
  db().prepare(`UPDATE tasks SET done = 1 - done WHERE id=?`).run(taskId);
  revalidatePath(`/opportunities/${oppId}`);
}

export async function addTask(oppId: number, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  if (title) {
    db().prepare(`INSERT INTO tasks (opportunity_id, title, due) VALUES (?, ?, ?)`).run(
      oppId,
      title,
      String(formData.get("due") || "")
    );
  }
  revalidatePath(`/opportunities/${oppId}`);
}

export async function saveSection(oppId: number, sectionKey: string, formData: FormData) {
  db()
    .prepare(
      `INSERT INTO proposal_sections (opportunity_id, section_key, content, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(opportunity_id, section_key) DO UPDATE SET content=excluded.content, updated_at=datetime('now')`
    )
    .run(oppId, sectionKey, String(formData.get("content") || ""));
  revalidatePath(`/opportunities/${oppId}/proposal`);
}

export async function setReadiness(id: number, status: string) {
  db().prepare(`UPDATE readiness SET status=? WHERE id=?`).run(status, id);
  revalidatePath("/readiness");
  revalidatePath("/");
}

export async function updateDocument(id: number, formData: FormData) {
  db()
    .prepare(`UPDATE documents SET status=?, expires=?, notes=?, updated_at=datetime('now') WHERE id=?`)
    .run(
      String(formData.get("status") || "missing"),
      String(formData.get("expires") || ""),
      String(formData.get("notes") || ""),
      id
    );
  revalidatePath("/library");
}

export async function saveNarrative(id: number | null, formData: FormData) {
  const d = db();
  if (id) {
    d.prepare(`UPDATE narratives SET category=?, title=?, content=?, updated_at=datetime('now') WHERE id=?`).run(
      String(formData.get("category") || "General"),
      String(formData.get("title") || "Untitled"),
      String(formData.get("content") || ""),
      id
    );
  } else {
    d.prepare(`INSERT INTO narratives (category, title, content) VALUES (?, ?, ?)`).run(
      String(formData.get("category") || "General"),
      String(formData.get("title") || "Untitled"),
      String(formData.get("content") || "")
    );
  }
  revalidatePath("/library");
}

export async function saveProfile(formData: FormData) {
  db()
    .prepare(
      `UPDATE org_profile SET name=?, legal_status=?, mission=?, vision=?, programs=?, service_area=?, populations=?, leadership=?, stats=?, ein=?, uei=? WHERE id=1`
    )
    .run(
      String(formData.get("name") || ""),
      String(formData.get("legal_status") || ""),
      String(formData.get("mission") || ""),
      String(formData.get("vision") || ""),
      String(formData.get("programs") || ""),
      String(formData.get("service_area") || ""),
      String(formData.get("populations") || ""),
      String(formData.get("leadership") || ""),
      String(formData.get("stats") || ""),
      String(formData.get("ein") || ""),
      String(formData.get("uei") || "")
    );
  revalidatePath("/profile");
}

export async function updateFunderNotes(id: number, formData: FormData) {
  db()
    .prepare(
      `UPDATE funders SET notes=?, contact_name=?, contact_email=?, relationship=?, last_contact=?, next_followup=? WHERE id=?`
    )
    .run(
      String(formData.get("notes") || ""),
      String(formData.get("contact_name") || ""),
      String(formData.get("contact_email") || ""),
      String(formData.get("relationship") || "cold"),
      String(formData.get("last_contact") || ""),
      String(formData.get("next_followup") || ""),
      id
    );
  revalidatePath("/funders");
}
