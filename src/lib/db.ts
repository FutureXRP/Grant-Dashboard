import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SEED_FUNDERS, SEED_READINESS, SEED_DOCUMENTS, SEED_NARRATIVES, SEED_PROFILE } from "./seed";
import { PROPOSAL_SECTIONS } from "./stages";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "grant-copilot.db");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = !fs.existsSync(DB_PATH);
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  if (fresh) seed(_db);
  return _db;
}

function migrate(d: Database.Database) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS org_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT, legal_status TEXT, mission TEXT, vision TEXT, programs TEXT,
    service_area TEXT, populations TEXT, leadership TEXT, stats TEXT,
    ein TEXT, uei TEXT
  );
  CREATE TABLE IF NOT EXISTS funders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, type TEXT NOT NULL, tier INTEGER DEFAULT 2,
    focus TEXT DEFAULT '', award_range TEXT DEFAULT '', projects TEXT DEFAULT '',
    website TEXT DEFAULT '', notes TEXT DEFAULT '',
    contact_name TEXT DEFAULT '', contact_email TEXT DEFAULT '',
    relationship TEXT DEFAULT 'cold', last_contact TEXT DEFAULT '', next_followup TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    funder_name TEXT DEFAULT '',
    type TEXT DEFAULT 'federal',
    stage TEXT DEFAULT 'prospect',
    amount INTEGER DEFAULT 0,
    deadline TEXT DEFAULT '',
    loi_deadline TEXT DEFAULT '',
    report_due TEXT DEFAULT '',
    renewal INTEGER DEFAULT 0,
    url TEXT DEFAULT '',
    grants_gov_number TEXT DEFAULT '',
    eligibility_notes TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    nofo_text TEXT DEFAULT '',
    qual_scores TEXT DEFAULT '{}',
    outcome TEXT DEFAULT '',
    awarded_amount INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS proposal_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER NOT NULL,
    section_key TEXT NOT NULL,
    content TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(opportunity_id, section_key)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER,
    title TEXT NOT NULL,
    due TEXT DEFAULT '',
    done INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS narratives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT DEFAULT 'General',
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    status TEXT DEFAULT 'missing',
    expires TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS readiness (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item TEXT NOT NULL,
    category TEXT DEFAULT '',
    detail TEXT DEFAULT '',
    status TEXT DEFAULT 'missing'
  );
  CREATE TABLE IF NOT EXISTS eligibility_screens (
    opportunity_id INTEGER PRIMARY KEY,
    questions TEXT DEFAULT '[]',
    answers TEXT DEFAULT '{}',
    verdict TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER,
    agent TEXT NOT NULL,
    output TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS scout_seen (
    number TEXT PRIMARY KEY,
    first_seen TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scout_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    report TEXT DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS opportunity_packets (
    opportunity_id INTEGER PRIMARY KEY,
    packet TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scout_dismissed (
    key TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    dismissed_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scout_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    kind TEXT DEFAULT 'state',
    enabled INTEGER DEFAULT 1,
    last_hash TEXT DEFAULT '',
    last_checked TEXT DEFAULT ''
  );
  `);
  // Column migrations for existing databases (SQLite has no IF NOT EXISTS for columns).
  const docCols = (d.prepare(`PRAGMA table_info(documents)`).all() as { name: string }[]).map((c) => c.name);
  if (!docCols.includes("content_text")) d.exec(`ALTER TABLE documents ADD COLUMN content_text TEXT DEFAULT ''`);
  if (!docCols.includes("file_name")) d.exec(`ALTER TABLE documents ADD COLUMN file_name TEXT DEFAULT ''`);

  // Default scout keywords (idempotent — safe on existing databases).
  d.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('scout_keywords', ?)`).run(
    [
      "community health",
      "early childhood education",
      "rural health",
      "behavioral health",
      "diabetes prevention",
      "family support services",
      "childcare facilities",
      "youth development",
    ].join("\n")
  );
  // Starter watch list for the state/foundation page watcher (Sections 5-6 funders).
  // These URLs are a best-effort starting point — sites reorganize, so any source
  // that errors in the morning report should be re-pointed via the Scout page.
  const insSource = d.prepare(
    `INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`
  );
  const sources: [string, string, string][] = [
    ["Oklahoma State Dept. of Health — grants & procurement", "https://oklahoma.gov/health/about-us/procurement---grants-management.html", "state"],
    ["ODMHSAS — procurement & funding", "https://oklahoma.gov/odmhsas/about/procurement-and-contracts.html", "state"],
    ["Oklahoma Human Services — procurement & grants", "https://oklahoma.gov/okdhs/about/procurement.html", "state"],
    ["Oklahoma Dept. of Commerce — community funding", "https://oklahoma.gov/commerce/community/community-development.html", "state"],
    ["Oklahoma State Dept. of Education — grants", "https://sde.ok.gov/grants", "state"],
    ["Oklahoma City Community Foundation — grants", "https://www.occf.org/grants/", "foundation"],
    ["Tulsa Community Foundation — grants", "https://tulsacf.org/grants/", "foundation"],
    ["Sarkeys Foundation — grants", "https://sarkeys.org/grants/", "foundation"],
    ["Kirkpatrick Foundation — grants", "https://kirkpatrickfoundation.com/grants", "foundation"],
    ["Inasmuch Foundation — grantmaking", "https://inasmuchfoundation.org/grantmaking", "foundation"],
    ["Blue Cross Blue Shield of Oklahoma — community", "https://www.bcbsok.com/company-info/community-involvement", "foundation"],
    ["ACF Administration for Native Americans (ANA)", "https://acf.gov/ana", "native"],
    ["Indian Health Service — grants", "https://www.ihs.gov/dgm/funding/", "native"],
    ["First Nations Development Institute — grantmaking", "https://www.firstnations.org/grantmaking/", "native"],
    ["Native American Agriculture Fund", "https://nativeamericanagriculturefund.org/", "native"],
  ];
  for (const s of sources) insSource.run(...s);

  // One-time keyword upgrade for existing databases: add Native-focused keywords.
  const flag = d.prepare(`SELECT value FROM settings WHERE key='seed_native_keywords'`).get() as
    | { value: string }
    | undefined;
  if (!flag) {
    const row = d.prepare(`SELECT value FROM settings WHERE key='scout_keywords'`).get() as
      | { value: string }
      | undefined;
    const current = (row?.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
    for (const kw of ["Native American families", "tribal health", "American Indian communities"]) {
      if (!current.some((c) => c.toLowerCase() === kw.toLowerCase())) current.push(kw);
    }
    d.prepare(
      `INSERT INTO settings (key, value) VALUES ('scout_keywords', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).run(current.join("\n"));
    d.prepare(`INSERT INTO settings (key, value) VALUES ('seed_native_keywords', 'done')`).run();
  }

  // One-time keyword upgrade v3: program-specific phrases that match how federal
  // notices are actually worded (existing user keywords are preserved).
  const flag3 = d.prepare(`SELECT value FROM settings WHERE key='seed_keywords_v3'`).get() as
    | { value: string }
    | undefined;
  if (!flag3) {
    const row = d.prepare(`SELECT value FROM settings WHERE key='scout_keywords'`).get() as
      | { value: string }
      | undefined;
    const current = (row?.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
    for (const kw of [
      "maternal and child health",
      "telehealth",
      "community health workers",
      "school readiness",
      "child care",
      "nutrition education",
      "obesity prevention",
      "community facilities",
      "trauma-informed",
      "suicide prevention",
      "fatherhood",
    ]) {
      if (!current.some((c) => c.toLowerCase() === kw.toLowerCase())) current.push(kw);
    }
    d.prepare(
      `INSERT INTO settings (key, value) VALUES ('scout_keywords', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).run(current.join("\n"));
    d.prepare(`INSERT INTO settings (key, value) VALUES ('seed_keywords_v3', 'done')`).run();
  }

  // One-time upgrade v4: food-security and outdoor-recreation lanes
  // (food distribution / commercial kitchen; playground, splashpad, walking track).
  const flag4 = d.prepare(`SELECT value FROM settings WHERE key='seed_v4_food_rec'`).get() as
    | { value: string }
    | undefined;
  if (!flag4) {
    const row = d.prepare(`SELECT value FROM settings WHERE key='scout_keywords'`).get() as
      | { value: string }
      | undefined;
    const current = (row?.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
    for (const kw of [
      "food security",
      "food access",
      "community food projects",
      "summer food service",
      "farm to school",
      "outdoor recreation",
      "physical activity",
      "playground",
    ]) {
      if (!current.some((c) => c.toLowerCase() === kw.toLowerCase())) current.push(kw);
    }
    d.prepare(
      `INSERT INTO settings (key, value) VALUES ('scout_keywords', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).run(current.join("\n"));

    const insSrc = d.prepare(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`);
    const newSources: [string, string, string][] = [
      ["KABOOM! — playground grants", "https://kaboom.org/grants", "foundation"],
      ["AARP Community Challenge (walkability/parks quick-builds)", "https://www.aarp.org/livable-communities/community-challenge/", "foundation"],
      ["T-Mobile Hometown Grants", "https://www.t-mobile.com/brand/hometown-grants", "foundation"],
      ["Community Food Bank of Eastern Oklahoma", "https://okfoodbank.org/", "foundation"],
      ["Oklahoma Tourism & Recreation — grants (LWCF)", "https://www.travelok.com/grants", "state"],
    ];
    for (const s of newSources) insSrc.run(...s);

    const insFunder2 = d.prepare(
      `INSERT INTO funders (name, type, tier, focus, award_range, projects, website) VALUES (@name, @type, @tier, @focus, @award_range, @projects, @website)`
    );
    const newFunders = [
      { name: "Tulsa County CDBG (Oakhurst is unincorporated Tulsa County)", type: "state", tier: 1, focus: "Community Development Block Grants for low/moderate-income areas — public facilities, parks, playgrounds, sidewalks, community centers", award_range: "$50K – $500K", projects: "Playground, splashpad, walking track restoration, food distribution buildout — verify Oakhurst census-tract LMI qualification", website: "https://www.tulsacounty.org" },
      { name: "Land & Water Conservation Fund (via Oklahoma Tourism & Recreation)", type: "state", tier: 2, focus: "Outdoor recreation capital: parks, playgrounds, splash pads, trails — typically 50% match required", award_range: "$75K – $500K (50% match)", projects: "Playground + splashpad + walking track as one outdoor recreation project on the 10 acres", website: "https://www.travelok.com" },
      { name: "USDA Community Food Projects / NIFA", type: "federal", tier: 2, focus: "Community food security: food access, distribution, community kitchens in underserved areas", award_range: "$125K – $400K", projects: "Food distribution center + community kitchen serving Oakhurst families", website: "https://www.nifa.usda.gov" },
      { name: "Community Food Bank of Eastern Oklahoma", type: "foundation", tier: 1, focus: "Partner-agency network for the Tulsa region — food supply, distribution infrastructure, capacity support", award_range: "Partnership + equipment support", projects: "Become a partner agency to source food for the distribution center; ask about capacity/equipment grants", website: "https://okfoodbank.org" },
      { name: "Child & Adult Care Food Program + Summer Food Service (OSDE child nutrition)", type: "state", tier: 1, focus: "Ongoing federal meal REIMBURSEMENT (not a grant): meals/snacks at the Early Learning Center and summer meals for community kids from the kitchen", award_range: "Recurring per-meal reimbursement", projects: "CACFP for enrolled children; SFSP summer meal site once the kitchen is licensed", website: "https://sde.ok.gov" },
      { name: "KABOOM!", type: "foundation", tier: 2, focus: "Playground builds for kids in underserved communities (often with corporate partners + community build days)", award_range: "Equipment + build support", projects: "Oakhurst community playground on the campus acreage", website: "https://kaboom.org" },
      { name: "AARP Community Challenge", type: "foundation", tier: 2, focus: "Quick-turn quality-of-life projects: walkability, parks, public spaces (annual cycle, all ages benefit)", award_range: "$2.5K – $50K", projects: "Walking track restoration as an intergenerational fitness loop", website: "https://www.aarp.org/livable-communities/community-challenge/" },
      { name: "T-Mobile Hometown Grants", type: "corporate", tier: 2, focus: "Small-town community-space projects (towns under 50K)", award_range: "Up to $50K", projects: "Outdoor community space / track / playground elements", website: "https://www.t-mobile.com/brand/hometown-grants" },
    ];
    for (const f of newFunders) insFunder2.run(f);

    d.prepare(`INSERT INTO settings (key, value) VALUES ('seed_v4_food_rec', 'done')`).run();
  }
}

function seed(d: Database.Database) {
  const insProfile = d.prepare(
    `INSERT INTO org_profile (id, name, legal_status, mission, vision, programs, service_area, populations, leadership, stats, ein, uei)
     VALUES (1, @name, @legal_status, @mission, @vision, @programs, @service_area, @populations, @leadership, @stats, @ein, @uei)`
  );
  insProfile.run(SEED_PROFILE);

  const insFunder = d.prepare(
    `INSERT INTO funders (name, type, tier, focus, award_range, projects, website)
     VALUES (@name, @type, @tier, @focus, @award_range, @projects, @website)`
  );
  for (const f of SEED_FUNDERS) insFunder.run(f);

  const insReady = d.prepare(
    `INSERT INTO readiness (item, category, detail) VALUES (@item, @category, @detail)`
  );
  for (const r of SEED_READINESS) insReady.run(r);

  const insDoc = d.prepare(
    `INSERT INTO documents (name, category) VALUES (@name, @category)`
  );
  for (const doc of SEED_DOCUMENTS) insDoc.run(doc);

  const insNarr = d.prepare(
    `INSERT INTO narratives (category, title, content) VALUES (@category, @title, @content)`
  );
  for (const n of SEED_NARRATIVES) insNarr.run(n);
}

// Default tasks generated for every new opportunity (Section 2 task list).
export const DEFAULT_TASKS = [
  "Read the full NOFO / guidelines",
  "Run qualification scorecard (need ≥75 to proceed)",
  "Contact program officer",
  "Confirm eligibility (incl. tribal-status requirements if any)",
  "Collect letters of support",
  "Draft budget & budget narrative",
  "Complete narrative sections",
  "Internal review & sign-off",
  "Board approval (if required)",
  "Submit application & save confirmation number",
  "Send thank-you / follow-up",
  "Calendar reporting deadlines",
];

export function ensureProposalSections(opportunityId: number) {
  const d = db();
  const ins = d.prepare(
    `INSERT OR IGNORE INTO proposal_sections (opportunity_id, section_key) VALUES (?, ?)`
  );
  for (const s of PROPOSAL_SECTIONS) ins.run(opportunityId, s.key);
}
