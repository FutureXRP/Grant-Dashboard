# Grant Copilot

A lean grant pipeline, writing workspace, and AI copilot for SquareOne Compassion — built from the
Grant & Funding Playbook (`Build.md`–`Build4.md`), deliberately scoped to the pieces that actually
raise money: more quality applications, never-missed deadlines, reusable narratives, and AI-assisted
writing. Everything else in the playbook stays what it is — a strategy manual, not software.

---

## What it does

| Page | What it's for | Revenue lever |
|------|---------------|---------------|
| **Dashboard** | Stat tiles (active opportunities, pipeline value, probability-weighted forecast, awarded), color-coded deadline list, funnel, reports-due, readiness warning | Never miss a deadline or report |
| **Pipeline** | Kanban across the playbook's 10 stages (Prospect → Closed) with the Section 22 probability weights (10%→100%); weighted forecast = Σ amount × stage % | Discipline: see where the money actually is |
| **Discover** | Live keyword search of the free Grants.gov API (posted + forecasted federal opportunities) with one-click "Add to pipeline" | Find federal money without a paid subscription |
| **Opportunity detail** | Full record, stage buttons, the Section 7 **qualification scorecard** (8 weighted criteria, ≥75/100 to proceed — auto-advances Prospect→Qualified), auto-generated task checklist, NOFO paste box, AI panel | Don't waste writing hours on low-probability grants |
| **Proposal workspace** | 10 standard sections (Executive Summary → Work Plan), each with AI Draft / Improve / Shorten / SMART-objectives buttons; red-team and compliance agents on the side | Cut proposal time from weeks to days → more shots on goal |
| **Export** | Print-styled proposal package + merge-filled letters (LOI, letter-of-support template, thank-you). "Download PDF" = browser print-to-PDF — zero dependencies | Professional deliverables in one click |
| **Funders** | The playbook's funder database seeded in: 9 federal agencies, 6 OK + 4 national foundations, 5 healthcare funders, 6 state agencies, corporate + tribal entries — with tiers, award ranges, project fits, and relationship tracking (cold → champion) | Relationship-driven fundraising |
| **Library** | Attachment tracker (the ~20 standard federal attachments with status + expiration alerts) and the narrative library (mission, program descriptions, key messages, SMART template — seeded from Section 3) | Reuse approved language; never scramble for a 990 |
| **Readiness** | The prerequisite checklist: SAM.gov/UEI/Grants.gov registrations, core documents, policies, **verified statistics**. Dashboard shows a warning until it's green | Federal money is unavailable without these |
| **Org Profile** | The single source of truth the AI drafts from — mission, programs, populations, leadership, and a verified-statistics field | Consistent story in every proposal |

## The AI agents

All agents run server-side through the Anthropic API (`claude-opus-4-8` by default) and share two
hard guardrails baked into every prompt:

1. **Never invent statistics.** Missing data becomes a `[VERIFY: …]` placeholder and is listed at
   the end of the draft. The compliance checker flags remaining placeholders as blockers.
2. **Native-led ≠ tribal eligibility.** The agents never imply eligibility for tribal-specific
   programs and flag the statutory check whenever it's relevant.

| Agent | Where | What it does |
|-------|-------|--------------|
| **Grant Scout** | Scout page (+ cron) | Every morning, two sweeps: **(1) Federal** — searches Grants.gov across your keyword list (including Native-focused keywords); **(2) Page watch** — fetches every watched Oklahoma-agency, foundation, and Native-funder grants page (starter list of 15, fully editable), detects changes since yesterday, and AI-extracts any announced opportunity. Everything is graded against your org profile — strong fit / possible fit / unlikely / **not eligible** — with a one-line reason, deduped against everything already seen (NEW badges). The graders know the ANA nuance: programs open to "Native nonprofit organizations" are potential fits, not auto-rejects. Automate with one cron line (shown on the page): `0 7 * * * curl -s -X POST http://localhost:3000/api/scout`. Sources that error (sites reorganize) are flagged in the report for re-pointing. |
| **Eligibility Screener** | Eligibility screen (per opportunity) | Reads the NOFO and interviews *you*: the specific facts that rule you in or out (status, classifications, enrollment numbers, designations), each tagged knockout vs. competitiveness and with **exactly where to find the answer** — which document, which website, who to call. Your answers produce a structured verdict: Eligible / Not eligible / Conditional, requirement by requirement, with next steps for anything unverified. The verdict badges the opportunity across the app. |
| **Packet Builder** | Opportunity page | Matches the NOFO's required attachments against the Library — every requirement graded ready / has-issue / missing, with download links for matched files and exact instructions for gaps. The Library itself now holds real content: upload the actual file for each item (stored in `data/uploads/`, downloadable anytime) or type the information in (UEI numbers, rosters) — either auto-marks the item current. |
| **NOFO Analyzer** | Opportunity page | Paste the funding notice → eligibility, required registrations/partners/attachments, scoring criteria, project concepts, budget guidance, timeline, compliance risks, narrative outline, honest probability |
| **Section Drafter** | Each proposal section | Drafts from the org profile + narrative library, tailored to the NOFO; revises rather than overwrites an existing draft |
| **Improve / Shorten** | Each section | Tightens prose without adding claims; shortens to a target word count |
| **SMART Objectives** | Objectives section | Generates objectives on the playbook's template, with `[VERIFY]` placeholders instead of made-up targets |
| **Red-Team Reviewer** | Opportunity + proposal pages | Scores the full draft like a skeptical federal reviewer against the published criteria; quotes weak passages; names the three highest-impact fixes |
| **Compliance Checker** | Opportunity + proposal pages | Builds a requirements checklist from the NOFO and diffs the draft against it (met / partial / missing) |

Every AI output is a draft for human review — the app never submits anything.

## Running it

```bash
# 1. Install (Node 18.18+ required)
npm install

# 2. Configure the AI (optional but recommended)
cp .env.example .env.local     # then paste your Anthropic API key

# 3. Run
npm run dev                    # development, http://localhost:3000
# or
npm run build && npm start     # production
```

- **Storage:** a single SQLite file at `data/grant-copilot.db` plus uploaded documents in
  `data/uploads/` (both created on first run; gitignored). Back it up by copying the `data/`
  folder. No database server, no accounts to configure.
- **Without an API key** everything works except the AI buttons, which explain what's missing.
- **Grants.gov search** calls the free public API directly — no key needed. (It's unreachable from
  some locked-down networks; the page reports the error rather than failing silently.)
- **Deployment:** run it on any small Node host (a $5 VPS, an office machine, Render/Railway with a
  persistent disk for `data/`). It has **no login system** — keep it on a private network, behind
  your host's authentication, or on one trusted machine. Don't expose it to the open internet as-is.

## Troubleshooting

**"Cannot find native binding … npm has a bug related to optional dependencies" (build error on globals.css)**
This is a known npm bug ([npm/cli#4828](https://github.com/npm/cli/issues/4828)): npm skips the
platform-specific native packages Tailwind needs, usually because `package-lock.json` was generated
on a different OS than yours. Fix — from the project folder, with the dev server stopped:

```bash
rm -rf node_modules package-lock.json     # Windows PowerShell: Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
npm run dev
```

Your `.env.local` and the `data/` folder are not touched by this.

**"Could not locate the bindings file" mentioning better_sqlite3**
Same family of problem, for the database driver. Run `npm rebuild better-sqlite3`, or use the full
fix above.

**AI buttons return "ANTHROPIC_API_KEY is not set"**
The key goes in `.env.local` in the project root (see Running it above) — then restart the app; the
key is only read at startup.

## What was deliberately left out (and why)

From the 25-section playbook, this build skips: HR/volunteer/facilities/emergency-management
modules, the 10 department dashboards, SOP libraries, maturity models, board-governance software,
donor CRM, and ~90 form templates. None of those produce grant revenue, and most are organizational
practices, not software. The playbook remains the operating manual; this app is the tool for the
part of it that pays.

Sensible next steps *if the core proves useful*: reminder emails for the deadline ladder
(180/90/60/30/14/7/3 days), post-award budget-vs-spent tracking, a simple login for multi-user
hosting, and file uploads attached to the document tracker.

## Two things the software can't do

1. **Registrations:** SAM.gov, UEI, and Grants.gov accounts must exist and stay active — the
   Readiness page tracks them, but a human has to do them.
2. **Verified data:** the profile's statistics field and the "NEEDS VERIFIED DATA" narratives must
   be filled with real, sourced numbers before anything is submitted. The AI will refuse to invent
   them — that's a feature.
