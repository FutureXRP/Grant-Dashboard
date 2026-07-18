# SquareOne Compassion — Grant System Build Plan

**What this is:** A concrete engineering and rollout plan distilled from all four playbook files (`Build.md`, `Build2.md`, `Build3.md`, `Build4.md` — Sections 1–25). It answers one question: *what exactly do we build* to get the full grant writing system, the dashboard, the PDF/document engine, and the AI agents.

---

## 1. What the four documents actually specify

The playbook is one continuous 25-section operating manual:

| File | Sections | Contents |
|------|----------|----------|
| Build.md | 1–12 | Org profile, **dashboard spec (Sec 2)**, master narrative (Sec 3), federal/foundation/state funder databases (Sec 4–6), **grant department + AI workflow (Sec 7)**, **narrative library (Sec 8)**, outcomes/data (Sec 9–10), financial compliance (Sec 11), board governance (Sec 12) |
| Build2.md | 13–17 | Communications, fundraising/donor CRM, HR/volunteers, **technology & AI governance (Sec 16)**, program design/logic models (Sec 17) |
| Build3.md | 18–22 | Partnerships/MOUs, facilities/assets, emergency management, legal/risk/compliance, **pipeline math & forecasting (Sec 22)** |
| Build4.md | 23–25 | SOP library, **master templates/forms + AI Prompt Library (Sec 24, Appendix J)**, five-year roadmap & grant-readiness scoring (Sec 25) |

Four deliverables fall out of this: **(A)** the Grant Operations Dashboard, **(B)** the AI-assisted Grant Writing System, **(C)** the Document/PDF engine, **(D)** the AI agents. Everything below is organized around those.

---

## 2. Technology stack (per Section 2)

- **Database:** Supabase (PostgreSQL) — the playbook's first choice
- **Frontend:** Next.js + React + Tailwind CSS
- **Auth:** Supabase Auth (or Clerk) with role-based permissions — 8 roles specified: Administrator, Executive Director, Grant Writer, Finance, Program Director, Board Member, Read Only, Volunteer
- **AI:** Claude API (plus optional OpenAI/Gemini) behind a server-side service layer
- **PDF generation:** headless-Chromium HTML→PDF (Puppeteer/Playwright) or `@react-pdf/renderer` for templated documents
- **Hosting:** Vercel (app) + Supabase (data/storage/auth); nightly backups, audit log, version history (Sec 2 backup requirements)

---

## 3. Data model (the core entities the playbook requires)

From Sections 2, 5–8, 11, 18, 22:

1. **Opportunity (Grant)** — name, agency, program, NOFO/application URLs, funding type (Federal/State/Foundation/Corporate/Tribal/Healthcare/Education/Research/Capital), min/max/typical award, match %, indirect allowed, multi-year, LOI required, eligible org types, eligibility score (Excellent→Not Eligible), probability score (1–100), recommended SquareOne program(s), required documents, assigned staff, deadline(s)
2. **PipelineStage** — the 10 stages of Sec 22: Prospect → Qualified → Relationship Development → Proposal Development → Submitted → Under Review → Awarded → Implementation → Reporting → Renewal/Closeout, each with a **forecast probability** (10 / 20 / 35 / 50 / 60 / 75 / 90 / 100%)
3. **Funder (Organization)** — agency/foundation/corporate/tribal profile, priority tier (1–3), interests, award ranges, relationship goal
4. **Contact** — org, title, phone, email, LinkedIn, notes, last contact, next follow-up, relationship strength (Cold → Champion)
5. **Document** — single-copy library: name, version, date, **expiration**, owner, status, used-in-grants; covers the ~20 standard attachments (IRS letter, 990, audit, SAM/UEI, board roster, bylaws, policies…)
6. **OrgProfile** — reusable facts: mission, vision, programs, counties, statistics, board, budget, patients/children served (Sec 3; placeholders must be filled with **verified** data — the playbook explicitly forbids invented statistics)
7. **Proposal** — per-opportunity workspace: narrative sections, budget, attachments, status, review scores, submission confirmation, lessons learned
8. **NarrativeAsset** — the Sec 8 library: 20 categories (exec summaries at 4 lengths, needs statements, capacity narratives at 4 lengths, program descriptions, budget-narrative blurbs, sustainability, evaluation language…), with metadata (version, approved-by, reading level, word count, tags, funding types) and version states Draft → Internal Review → Executive Review → Final → Archived
9. **Task** — auto-generated per grant (read NOFO, call program officer, collect letters, board approval, submit, thank-you, schedule report…)
10. **CalendarEvent / Deadline** — LOIs, applications, reports, site visits, renewals, SAM/UEI renewals
11. **Award (post-award)** — budget vs. spent, burn rate, reporting calendar, risk level (Green/Yellow/Orange/Red), closeout & record-retention dates (Sec 11)
12. **Partnership / MOU** — Sec 18 partnership database with MOU status and referral tracking
13. **QualificationScore** — Sec 7 weighted scorecard (8 criteria, ≥75/100 to proceed) and Sec 4/5 scoring matrices
14. **LessonLearned** — per-submission outcome, reviewer feedback, reusable winning language tagged by topic
15. **PromptTemplate** — the versioned AI prompt library (Sec 24 Appendix J), reviewed semiannually
16. **User / Role / AuditLog**

---

## 4. Deliverable A — The Grant Operations Dashboard

**Main dashboard (Sec 2 spec):** stat tiles — Open Opportunities, Estimated Funding, Due This Month, Submitted, Awarded, Declined, Average Probability, Pipeline Value — plus:
- **Funding funnel** (Prospects → … → Closed)
- **Funding-by-source** chart (Federal/State/Foundation/Corporate/Tribal/…)
- **Upcoming deadlines** table with green/yellow/orange/red urgency coding
- **Monthly calendar** (LOIs, applications, reports, site visits, board reviews)

**Pipeline module (Sec 22):** kanban across the 10 stages; **probability-weighted forecast** (sum of amount × stage probability) that must be shown against the annual revenue target; diversification metrics (largest grant %, largest funder %); Conservative/Expected/Growth scenarios.

**Left navigation (Sec 2):** Dashboard, Funding Pipeline, Grant Calendar, Foundations, Federal/State/Tribal/Healthcare/Education/Wellness Grants, Capital Campaigns, Corporate Giving, Documents, Proposal Library, Templates, Contacts, Organizations, AI Grant Writer, Tasks, Reporting, Administration.

**Secondary dashboards** (phased in later — the playbook names ~10, all the same shape: ~10 metrics + KPI targets + trends):
- **Executive dashboard** (board meetings): pipeline value, pending, awarded, major deadlines, top risks, strategic priorities
- **Board grant dashboard** (quarterly, trend-focused)
- Reporting/analytics: submissions, win rate, avg award, funding by program/agency/year/staff
- Later: compliance, financial, program, partnership, facilities, workforce, communications dashboards (Secs 9, 11, 18, 19, 23)

**Notification engine (Sec 2):** deadline reminders at 180/90/60/30/14/7/3 days + 24 hours; missed-deadline, award, reporting-due, document-expiration, SAM/UEI-renewal alerts. Implement as scheduled jobs (Supabase cron/edge functions) + email.

---

## 5. Deliverable B — The Grant Writing System

The proposal workspace, wired to the narrative library and the AI agents:

1. **Intake & qualification:** create opportunity within 24h of discovery (Sec 7); run the weighted scorecard; ≥75/100 → Executive Review (Proceed/Hold/Decline)
2. **Proposal workspace:** section-by-section editor (Executive Summary, Need, Program Design, Objectives, Evaluation, Sustainability, Budget Narrative, Logic Model, Work Plan), each section seedable from the narrative library
3. **The 10-stage development SOP** (Sec 7) drives status: Discovery → Qualification → Executive Review → Program Design → Budget → Narrative → **AI Review** → Internal Review (Finance/Program/Executive/Compliance sign-offs) → Submission → Post-Submission
4. **Review rubric:** 5 scored areas (1–10) with the Sec 7 quality gates (compliance 100%, budget accuracy 100%…)
5. **Submission checklist** (Sec 7/24) enforced before status can move to Submitted; capture confirmation number; auto-archive; auto-schedule follow-up and reporting reminders
6. **Proposal Library:** every submission becomes searchable with keywords, outcomes, and lessons learned — this is the "grant memory" the playbook keeps returning to
7. **Federal timeline templating:** auto-generate the 120/90/75/60/30/14/7-day milestone plan (Sec 7) or the 7-week production schedule (Sec 22) when a deadline is set

---

## 6. Deliverable C — PDFs & the document engine

Two distinct jobs:

**(1) Document library** (store + track): single-copy storage in Supabase Storage, versioning, expiration alerts, "used in grants" links. Seed with the ~20 standard federal attachments list.

**(2) PDF generation** (produce): HTML templates rendered to PDF for:
- **Proposal package export** — assembled narrative + budget narrative + logic model + work plan, formatted to funder page limits
- **Letter library (Sec 8)** — 10 letters: LOI, cover, support, MOU, partnership, tribal partnership, corporate sponsorship, legislative, thank-you, award acceptance — merge-filled from org profile + funder + contact
- **Board/executive packets** — dashboard snapshot, pipeline, deadlines, risks (Sec 12/25 scorecards)
- **Forms & checklists (Sec 24, Appendices A–I)** — ~90 named templates (board agenda/minutes, grant readiness checklist, logic model worksheet, budget worksheets, incident forms, MOU template, after-action review…). Build the 10–15 grant-critical ones first; the rest are a template-data problem, not new engineering
- **Annual impact report** layout (Sec 9/13)

---

## 7. Deliverable D — The AI agents

The playbook specifies these very concretely (Secs 2, 7, 8, 24). Build them as server-side Claude-powered services, each with its prompt stored in the versioned **Prompt Library** (Appendix J structure — 10 categories, semiannual review):

| Agent | Source | What it does |
|-------|--------|--------------|
| **1. NOFO Analyzer** | Sec 4 & 7 (verbatim prompt) | Paste/upload a NOFO → eligibility, required partners/registrations/attachments, scoring criteria, compliance risks, suggested narrative outline, probability estimate → produces the executive briefing + compliance checklist |
| **2. Needs-Data Assistant** | Sec 7 stage 2, Sec 10 | Identifies what community data a proposal needs, maps it to the community-data database and cited public sources, flags gaps — never invents statistics |
| **3. Narrative Drafter** | Sec 7 stage 3 | Drafts sections from the org profile + narrative library, tailored to the NOFO |
| **4. Red Team Reviewer** | Sec 7 stage 4, Sec 8 | Simulates a federal reviewer; scores against the published criteria; outputs a reviewer report with revisions |
| **5. Compliance Checker** | Sec 8 prompt 4 | Builds a requirements checklist from the NOFO and diffs the draft against it; highlights missing requirements |
| **6. Editor/Optimizer** | Sec 7 stage 5 | Clarity, transitions, reading level, word/page-limit compliance |
| **7. AI Grant Writer toolbar** | Sec 2 (15 functions) | In-editor actions: improve exec summary, rewrite need statement, expand/shorten, generate SMART objectives, evaluation plan, sustainability plan, budget narrative, timeline, work plan, logic model, outcome measures |

**Governance guardrails (Sec 16 — build these in, not on):** every AI output goes through the AI Review Checklist (accuracy, confidentiality, bias, citations, approval) before use; AI never submits applications, invents statistics, or bypasses the human sign-off stages; prompt library is version-controlled.

---

## 8. Seed data (day-one content, straight from the playbook)

- **Funder database:** ~10 federal agencies with award ranges/priority stars/project concepts (Sec 4), ~25 Oklahoma + national + healthcare foundations (Sec 5), corporate prospects, 22 Oklahoma tribal governments, ~10 Oklahoma state agencies with dashboard fields (Sec 6)
- **Org profile:** Section 3 verbatim (mission, vision, 100-word description, program descriptions, key messages) — with the 250/500-word descriptions flagged as **"needs verified data"** per the playbook's own warning
- **Narrative library:** Section 8's template skeletons
- **Prompt library:** Appendix J prompts
- **Checklist/form templates:** Section 24 appendices

---

## 9. Build order

**Phase 1 — Core pipeline & dashboard (MVP)**
Supabase schema + auth/roles → Opportunity CRUD → 10-stage pipeline kanban with probability-weighted forecast → main dashboard tiles/funnel/deadlines → seed funder database. *This alone replaces the spreadsheet-and-memory approach the playbook warns against.*

**Phase 2 — Documents, contacts & automation**
Document library with versioning/expiration → contacts + relationship strength → org profile → auto-generated tasks → calendar → notification engine (deadline ladder + expirations + SAM/UEI).

**Phase 3 — Grant writing system + AI agents**
Proposal workspace → narrative library → NOFO Analyzer, Drafter, Red Team, Compliance Checker, toolbar → review/sign-off workflow → prompt library.

**Phase 4 — PDF engine**
Proposal export, letter library, board packet, top-priority Sec 24 forms; then the long tail of templates.

**Phase 5 — Post-award & governance**
Award/compliance module (budgets, burn rate, reporting calendar, risk colors) → executive/board dashboards & scorecards → lessons-learned knowledge base → partnership/MOU tracking → annual grant-readiness scoring (Sec 25's 15-category 0–100 assessment).

**Later / integrations (Sec 2 list):** Grants.gov & SAM.gov lookups, QuickBooks, Microsoft 365/Google Workspace, DocuSign, GIS mapping (Sec 10), Power BI/Tableau, predictive analytics.

---

## 10. Not software — but required for the system to matter

The playbook is explicit that these are operational prerequisites, tracked *in* the system but done by people:

1. **Federal registrations:** active UEI + SAM.gov + Grants.gov accounts (Sec 4) — nothing federal can be submitted without them
2. **Verified organizational data:** real patient/enrollment/outcome numbers to replace Section 3's placeholders — the playbook repeatedly forbids invented statistics
3. **Master document collection:** gather the ~20 standard attachments (IRS letter, audit, 990, board roster, policies…) into the library
4. **Roles & review discipline:** someone must own each pipeline stage and sign-off (President approval, finance/program/compliance review)
5. **Eligibility care:** Native-led ≠ tribal-organization eligibility (Secs 1, 3, 4) — the eligibility field per opportunity exists precisely to enforce this check
