import path from "path";
import { SEED_FUNDERS, SEED_READINESS, SEED_DOCUMENTS, SEED_NARRATIVES, SEED_PROFILE } from "./seed";
import { DEFAULT_EXCLUDES } from "./targeting";
import { PROPOSAL_SECTIONS } from "./stages";

// Async database layer with two interchangeable backends:
//
//  - LOCAL (default): better-sqlite3 against data/grant-copilot.db — used on a
//    laptop, Codespace, or any host with a persistent disk.
//  - REMOTE: Turso (hosted SQLite) via @libsql/client/web when
//    TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set — used on Vercel and other
//    serverless hosts, whose filesystems are wiped on every deploy.
//
// Both speak the same SQLite dialect, so every query in the app is written
// once. All access goes through q.get / q.all / q.run (async).

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

type Params = unknown[] | Record<string, unknown>;
export type RunResult = { lastInsertRowid: number };

type Backend = {
  get<T>(sql: string, params?: Params): Promise<T | undefined>;
  all<T>(sql: string, params?: Params): Promise<T[]>;
  run(sql: string, params?: Params): Promise<RunResult>;
  batch(sql: string): Promise<void>; // multi-statement DDL
};

function remoteConfigured(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

// ---- local backend (better-sqlite3) ----

function localBackend(): Backend {
  if (process.env.VERCEL) {
    throw new Error(
      "Running on Vercel without a cloud database — Vercel has no persistent disk. " +
        "Create a free Turso database and set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN " +
        "in the Vercel project's environment variables (see GRANT_COPILOT.md → Deploying to Vercel)."
    );
  }
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const fs = require("fs") as typeof import("fs");
  /* eslint-enable @typescript-eslint/no-require-imports */
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new Database(path.join(DATA_DIR, "grant-copilot.db"));
  d.pragma("journal_mode = WAL");
  return {
    async get<T>(sql: string, params: Params = []) {
      const stmt = d.prepare(sql);
      return (Array.isArray(params) ? stmt.get(...params) : stmt.get(params)) as T | undefined;
    },
    async all<T>(sql: string, params: Params = []) {
      const stmt = d.prepare(sql);
      return (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) as T[];
    },
    async run(sql: string, params: Params = []) {
      const stmt = d.prepare(sql);
      const r = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
      return { lastInsertRowid: Number(r.lastInsertRowid) };
    },
    async batch(sql: string) {
      d.exec(sql);
    },
  };
}

// ---- remote backend (Turso over HTTP — no native code, serverless-safe) ----

function remoteBackend(): Backend {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createClient } = require("@libsql/client/web") as typeof import("@libsql/client/web");
  /* eslint-enable @typescript-eslint/no-require-imports */
  // Turso hands out libsql:// URLs, which the web client opens over a
  // WebSocket — unavailable in some serverless runtimes. Rewriting to
  // https:// makes it use plain HTTP fetch, which works everywhere.
  const url = process.env.TURSO_DATABASE_URL!.replace(/^libsql:\/\//, "https://");
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const toArgs = (params: Params) =>
    Array.isArray(params)
      ? (params as (string | number | null)[])
      : (params as Record<string, string | number | null>);
  const toRow = <T>(r: Record<string, unknown>): T => r as T;
  return {
    async get<T>(sql: string, params: Params = []) {
      const rs = await client.execute({ sql, args: toArgs(params) });
      return rs.rows[0] ? toRow<T>(rs.rows[0] as unknown as Record<string, unknown>) : undefined;
    },
    async all<T>(sql: string, params: Params = []) {
      const rs = await client.execute({ sql, args: toArgs(params) });
      return rs.rows.map((r) => toRow<T>(r as unknown as Record<string, unknown>));
    },
    async run(sql: string, params: Params = []) {
      const rs = await client.execute({ sql, args: toArgs(params) });
      return { lastInsertRowid: rs.lastInsertRowid ? Number(rs.lastInsertRowid) : 0 };
    },
    async batch(sql: string) {
      await client.executeMultiple(sql);
    },
  };
}

// ---- initialization: migrate (+ seed if empty) exactly once per process ----

let backend: Backend | null = null;
let ready: Promise<void> | null = null;

function raw(): Backend {
  if (!backend) backend = remoteConfigured() ? remoteBackend() : localBackend();
  return backend;
}

async function init(): Promise<void> {
  const b = raw();
  await migrate(b);
  const existing = await b.get<{ id: number }>(`SELECT id FROM org_profile WHERE id=1`);
  if (!existing) await seed(b);
}

async function withReady<T>(fn: (b: Backend) => Promise<T>): Promise<T> {
  if (!ready) ready = init().catch((e) => { ready = null; throw e; });
  await ready;
  return fn(raw());
}

export const q = {
  get: <T>(sql: string, params?: Params) => withReady((b) => b.get<T>(sql, params)),
  all: <T>(sql: string, params?: Params) => withReady((b) => b.all<T>(sql, params)),
  run: (sql: string, params?: Params) => withReady((b) => b.run(sql, params)),
};

// ---- schema ----

async function migrate(b: Backend) {
  await b.batch(`
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
  CREATE TABLE IF NOT EXISTS opportunity_budgets (
    opportunity_id INTEGER PRIMARY KEY,
    budget TEXT DEFAULT '',
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
  CREATE TABLE IF NOT EXISTS application_forms (
    opportunity_id INTEGER PRIMARY KEY,
    url TEXT DEFAULT '',
    title TEXT DEFAULT '',
    fields TEXT DEFAULT '[]',
    answers TEXT DEFAULT '{}',
    fetched_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  `);

  // Column migrations for databases created before these columns existed.
  // "ADD COLUMN, ignore the duplicate-column error" works identically on both
  // backends, unlike PRAGMA table_info over HTTP.
  const addColumn = async (sql: string) => {
    try {
      await b.run(sql);
    } catch {
      /* column already exists */
    }
  };
  await addColumn(`ALTER TABLE documents ADD COLUMN content_text TEXT DEFAULT ''`);
  await addColumn(`ALTER TABLE documents ADD COLUMN file_name TEXT DEFAULT ''`);
  await addColumn(`ALTER TABLE opportunities ADD COLUMN sf424_json TEXT DEFAULT ''`);

  // Default scout keywords (idempotent — safe on existing databases).
  await b.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('scout_keywords', ?)`, [
    [
      "community health",
      "early childhood education",
      "rural health",
      "behavioral health",
      "diabetes prevention",
      "family support services",
      "childcare facilities",
      "youth development",
    ].join("\n"),
  ]);

  // Starter watch list for the state/foundation page watcher (Sections 5-6 funders).
  // One-time: re-running it after a source's URL has been re-pointed (v8) would
  // re-insert the OLD url as a duplicate row, since name is not unique but url is.
  const flagBase = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_base_sources_once'`);
  if (!flagBase) {
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
  for (const s of sources) {
    await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`, s);
  }
  await b.run(`INSERT INTO settings (key, value) VALUES ('seed_base_sources_once', 'done')`);
  }

  // One-time keyword upgrade for existing databases: add Native-focused keywords.
  const flag = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_native_keywords'`);
  if (!flag) {
    await addKeywords(b, ["Native American families", "tribal health", "American Indian communities"]);
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_native_keywords', 'done')`);
  }

  // One-time keyword upgrade v3: program-specific phrases that match how federal
  // notices are actually worded (existing user keywords are preserved).
  const flag3 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_keywords_v3'`);
  if (!flag3) {
    await addKeywords(b, [
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
    ]);
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_keywords_v3', 'done')`);
  }

  // One-time upgrade v4: food-security and outdoor-recreation lanes
  // (food distribution / commercial kitchen; playground, splashpad, walking track).
  const flag4 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v4_food_rec'`);
  if (!flag4) {
    await addKeywords(b, [
      "food security",
      "food access",
      "community food projects",
      "summer food service",
      "farm to school",
      "outdoor recreation",
      "physical activity",
      "playground",
    ]);
    const newSources: [string, string, string][] = [
      ["KABOOM! — playground grants", "https://kaboom.org/grants", "foundation"],
      ["AARP Community Challenge (walkability/parks quick-builds)", "https://www.aarp.org/livable-communities/community-challenge/", "foundation"],
      ["T-Mobile Hometown Grants", "https://www.t-mobile.com/brand/hometown-grants", "foundation"],
      ["Community Food Bank of Eastern Oklahoma", "https://okfoodbank.org/", "foundation"],
      ["Oklahoma Tourism & Recreation — grants (LWCF)", "https://www.travelok.com/grants", "state"],
    ];
    for (const s of newSources) {
      await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`, s);
    }
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
    for (const f of newFunders) {
      await b.run(
        `INSERT INTO funders (name, type, tier, focus, award_range, projects, website) VALUES (@name, @type, @tier, @focus, @award_range, @projects, @website)`,
        f
      );
    }
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v4_food_rec', 'done')`);
  }

  // One-time upgrade v5 (dashboard audit): corporate giving programs, TSET, and
  // the big Tulsa family foundations — funder types the team was finding by
  // hand that the scout had no source for.
  const flag5 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v5_corporate_tset'`);
  if (!flag5) {
    const v5Sources: [string, string, string][] = [
      ["TSET — Oklahoma Tobacco Settlement Endowment Trust (funding)", "https://tset.ok.gov/funding-opportunities/", "state"],
      ["Walmart & Sam's Club — Local Community Grants (Spark Good)", "https://walmart.org/how-we-give/local-community-grants", "corporate"],
      ["Lowe's Hometowns — community impact", "https://corporate.lowes.com/our-responsibilities/lowes-hometowns", "corporate"],
      ["Home Depot Foundation", "https://corporate.homedepot.com/foundation", "corporate"],
      ["Cox Charities", "https://www.coxcharities.org/", "corporate"],
      ["Dollar General Literacy Foundation — grants", "https://www.dgliteracy.org/grant-programs/", "foundation"],
      ["George Kaiser Family Foundation", "https://www.gkff.org/", "foundation"],
      ["Zarrow Family Foundations", "https://zarrow.com/", "foundation"],
      ["Hardesty Family Foundation", "https://www.hardestyfamilyfoundation.org/", "foundation"],
    ];
    for (const s of v5Sources) {
      await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`, s);
    }
    const v5Funders = [
      { name: "TSET (Oklahoma Tobacco Settlement Endowment Trust)", type: "state", tier: 1, focus: "Health-focused Oklahoma funder: physical activity, nutrition, healthy built environment (parks, walking trails), tobacco-free community wellness", award_range: "$10K – $1M+ (program-dependent)", projects: "Walking track restoration, splashpad, fitness programming, nutrition education — TSET Healthy Living / built-environment funding is squarely on-mission", website: "https://tset.ok.gov" },
      { name: "Walmart & Sam's Club Local Community Grants (Spark Good)", type: "corporate", tier: 2, focus: "Quick-turn $250–$5,000 grants from each local Walmart and Sam's Club facility; quarterly open application cycles via Walmart.org Spark Good", award_range: "$250 – $5K per facility", projects: "Food distribution supplies, youth programming, community events — small fast wins; apply to every nearby store separately", website: "https://walmart.org/how-we-give/local-community-grants" },
      { name: "Lowe's Hometowns", type: "corporate", tier: 2, focus: "Community space renovation and improvement projects (annual cycle + store-level support)", award_range: "Up to $100K (flagship projects)", projects: "Community center improvements, outdoor recreation buildout on the campus", website: "https://corporate.lowes.com/our-responsibilities/lowes-hometowns" },
      { name: "Home Depot Foundation", type: "corporate", tier: 3, focus: "Community improvement, veteran housing, disaster relief; Team Depot volunteer builds", award_range: "Product + volunteer builds; grants vary", projects: "Playground/track build support with volunteer labor", website: "https://corporate.homedepot.com/foundation" },
      { name: "Cox Charities (Oklahoma)", type: "corporate", tier: 2, focus: "Youth, education, and community nonprofit grants in Cox service areas", award_range: "$2.5K – $10K", projects: "Early learning programming, youth development", website: "https://www.coxcharities.org" },
      { name: "Dollar General Literacy Foundation", type: "foundation", tier: 2, focus: "Early childhood literacy, family literacy, adult education", award_range: "$3K – $10K", projects: "Early Learning Center literacy programming and family literacy nights", website: "https://www.dgliteracy.org" },
      { name: "George Kaiser Family Foundation", type: "foundation", tier: 1, focus: "One of Tulsa's largest funders: early childhood education, health, community wellbeing, two-generation family support", award_range: "Varies (relationship-driven)", projects: "Early Learning Center expansion, whole-family model — build the relationship; often invitation-based", website: "https://www.gkff.org" },
      { name: "Anne & Henry Zarrow Foundation", type: "foundation", tier: 1, focus: "Tulsa-area health, human services, social justice, basic needs", award_range: "$10K – $250K", projects: "Medical center operations, food security, family services", website: "https://zarrow.com" },
      { name: "Hardesty Family Foundation", type: "foundation", tier: 2, focus: "Tulsa-area youth, education, parks and recreation, community facilities", award_range: "$10K – $100K", projects: "Playground, splashpad, and walking track on the 10 acres", website: "https://www.hardestyfamilyfoundation.org" },
    ];
    for (const f of v5Funders) {
      const exists = await b.get<{ id: number }>(`SELECT id FROM funders WHERE name=?`, [f.name]);
      if (!exists) {
        await b.run(
          `INSERT INTO funders (name, type, tier, focus, award_range, projects, website) VALUES (@name, @type, @tier, @focus, @award_range, @projects, @website)`,
          f
        );
      }
    }
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v5_corporate_tset', 'done')`);
  }

  // One-time upgrade v6: Instrumentl's free Oklahoma grant-listing pages
  // (user-requested). These are server-rendered aggregator pages listing real
  // grants with funder, amount, and due date — one page per program lane.
  const flag6 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v6_instrumentl'`);
  if (!flag6) {
    const v6Sources: [string, string, string][] = [
      ["Instrumentl — OK community health grants", "https://www.instrumentl.com/browse-grants/oklahoma/community-health-grants", "aggregator"],
      ["Instrumentl — OK mental health grants", "https://www.instrumentl.com/browse-grants/oklahoma/mental-health-grants", "aggregator"],
      ["Instrumentl — OK early childhood grants", "https://www.instrumentl.com/browse-grants/oklahoma/early-childhood-development-grants", "aggregator"],
      ["Instrumentl — OK child care center grants", "https://www.instrumentl.com/browse-grants/oklahoma/grants-for-nonprofit-child-care-centers", "aggregator"],
      ["Instrumentl — OK food grants", "https://www.instrumentl.com/browse-grants/oklahoma/food-grants-for-nonprofits", "aggregator"],
      ["Instrumentl — OK playground grants", "https://www.instrumentl.com/browse-grants/oklahoma/playground-grants-for-nonprofits", "aggregator"],
      ["Instrumentl — OK recreation grants", "https://www.instrumentl.com/browse-grants/oklahoma/recreation-grants-for-nonprofits", "aggregator"],
      ["Instrumentl — OK Native American grants", "https://www.instrumentl.com/browse-grants/oklahoma/grants-for-native-americans", "native"],
    ];
    for (const s of v6Sources) {
      await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`, s);
    }
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v6_instrumentl', 'done')`);
  }

  // One-time upgrade v7 (Instrumentl head-to-head test): four more Instrumentl
  // Oklahoma pages that carry funders the first eight missed (Chapman, Bernsen,
  // Mabee, Cox Foundation, BOK), plus funder records for the strong fits the
  // team's own Instrumentl research surfaced.
  const flag7 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v7_instrumentl_gaps'`);
  if (!flag7) {
    const v7Sources: [string, string, string][] = [
      ["Instrumentl — OK corporate grants", "https://www.instrumentl.com/browse-grants/oklahoma/corporate-grants-for-nonprofits", "aggregator"],
      ["Instrumentl — OK children's grants", "https://www.instrumentl.com/browse-grants/oklahoma/grants-for-children", "aggregator"],
      ["Instrumentl — OK healthcare program grants", "https://www.instrumentl.com/browse-grants/oklahoma/grants-for-nonprofit-healthcare-programs", "aggregator"],
      ["Instrumentl — OK public health grants", "https://www.instrumentl.com/browse-grants/oklahoma/grants-for-public-health", "aggregator"],
    ];
    for (const s of v7Sources) {
      await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`, s);
    }
    const v7Funders = [
      { name: "Mary K. Chapman Foundation", type: "foundation", tier: 1, focus: "Tulsa funder of health, human services, and education", award_range: "$1K – $10M", projects: "Medical center, Early Learning Center — start with the eligibility assessment in their grant portal (grantinterface.com, key: chapmanfoundation)", website: "" },
      { name: "Ardmore Institute of Health", type: "foundation", tier: 1, focus: "Primary care, whole-person care, obesity care, food-as-medicine, underserved communities", award_range: "Unspecified", projects: "Clinic + fitness center + food programs are a direct match. LOIs are invitation-gated — contact AIH before the cycle to request an invitation", website: "https://ardmoreinstitute.org" },
      { name: "Grace & Franklin Bernsen Foundation", type: "foundation", tier: 1, focus: "Tulsa-area nonprofits only", award_range: "Unspecified", projects: "Rolling — check guidelines page for board meeting dates", website: "https://www.bernsen.org" },
      { name: "J.E. & L.E. Mabee Foundation", type: "foundation", tier: 1, focus: "Capital projects: construction, renovation, major equipment — challenge grants (~20% of cost after 40% raised elsewhere); no operating support", award_range: "Up to $2M", projects: "Food distribution buildout, outdoor recreation construction — quarterly deadlines (Mar/Jun/Sep/Dec 1)", website: "https://www.mabeefoundation.com" },
      { name: "Quest Diagnostics Foundation", type: "corporate", tier: 2, focus: "Community health and care-access programs with measurable outcomes", award_range: "$10K", projects: "Medical center community health programs — annual Healthy Communities Champions cycle", website: "https://www.questdiagnostics.com/our-company/foundation" },
      { name: "GoodRx Helps", type: "corporate", tier: 2, focus: "Healthcare access and education for under-resourced groups", award_range: "Up to $250K", projects: "Clinic access programs — note: reportedly requires ~$250K+ operating budget", website: "" },
      { name: "Telligen Community Initiative", type: "foundation", tier: 2, focus: "Social drivers of health — Oklahoma is an eligible state", award_range: "Up to $150K", projects: "Whole-family model (health + food + learning) as social-drivers programming; short pre-application", website: "" },
      { name: "Tulsa Area United Way", type: "foundation", tier: 2, focus: "Social Innovations grants for new approaches (not ongoing operations)", award_range: "$40K", projects: "A new cross-program pilot (e.g. clinic ↔ Early Learning Center referral loop)", website: "https://tauw.org" },
      { name: "Delta Dental of Oklahoma Foundation", type: "healthcare", tier: 2, focus: "Free/low-cost dental care, dental education, oral health statewide", award_range: "Unspecified", projects: "Oral-health screenings at the clinic and Early Learning Center", website: "https://www.deltadentalok.org" },
      { name: "ONEOK Foundation", type: "corporate", tier: 2, focus: "Tulsa-based: safety and education where employees live and work", award_range: "Unspecified", projects: "Lead with the Early Learning Center", website: "https://www.oneok.com" },
      { name: "BOKF Foundation (Bank of Oklahoma)", type: "corporate", tier: 2, focus: "Tulsa-headquartered bank — natural local ask", award_range: "Unspecified", projects: "Ask a BOK banker or community-relations contact for the request form", website: "" },
      { name: "Costco Wholesale Charitable", type: "corporate", tier: 3, focus: "Children, education, health & human services where Costco has warehouses", award_range: "Unspecified", projects: "Simple online form", website: "" },
      { name: "The Molina Foundation", type: "foundation", tier: 3, focus: "Book Buddies: donated children's books (in-kind)", award_range: "In-kind", projects: "Low-effort win for the Early Learning Center", website: "" },
    ];
    for (const f of v7Funders) {
      const exists = await b.get<{ id: number }>(`SELECT id FROM funders WHERE name=?`, [f.name]);
      if (!exists) {
        await b.run(
          `INSERT INTO funders (name, type, tier, focus, award_range, projects, website) VALUES (@name, @type, @tier, @focus, @award_range, @projects, @website)`,
          f
        );
      }
    }
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v7_instrumentl_gaps', 'done')`);
  }

  // One-time upgrade v8: re-point the watched pages the status report flagged
  // as 404/thin (sites reorganized, or the original best-guess URL was wrong)
  // to researched current URLs, and watch OSDH's Rural Health Transformation
  // Program funding page (an official page; discovery's top lead).
  // Clean up duplicate rows the old always-on base seed may have created for
  // seed-managed source names (runs every init; idempotent; keeps the oldest
  // row, which is the one v8's re-point updates). Scoped to seed names so
  // user-added sources are never touched.
  try {
    await b.run(
      `DELETE FROM scout_sources WHERE name IN (
         'Sarkeys Foundation — grants', 'Tulsa Community Foundation — grants',
         'Lowe''s Hometowns — community impact', 'Blue Cross Blue Shield of Oklahoma — community',
         'ODMHSAS — procurement & funding', 'Oklahoma Dept. of Commerce — community funding',
         'Oklahoma State Dept. of Health — grants & procurement',
         'Oklahoma Tourism & Recreation — grants (LWCF)',
         'Oklahoma Human Services — procurement & grants', 'Zarrow Family Foundations'
       ) AND id NOT IN (SELECT MIN(id) FROM scout_sources GROUP BY name)`
    );
  } catch {
    /* best-effort cleanup */
  }

  const flag8 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v8_url_fixes'`);
  if (!flag8) {
    const repoints: [string, string][] = [
      ["Sarkeys Foundation — grants", "https://sarkeys.org/grant-guidelines/"],
      ["Tulsa Community Foundation — grants", "https://tulsacf.org/nonprofits/"],
      ["Lowe's Hometowns — community impact", "https://www.lowes.com/hometowns"],
      ["Blue Cross Blue Shield of Oklahoma — community", "https://www.bcbsok.com/about-us/community-giving"],
      ["ODMHSAS — procurement & funding", "https://oklahoma.gov/odmhsas/about/public-information/grant-and-solicitations.html"],
      ["Oklahoma Dept. of Commerce — community funding", "https://www.okcommerce.gov/community-development/community-development-block-grant-programs/"],
      ["Oklahoma State Dept. of Health — grants & procurement", "https://oklahoma.gov/health/about-us/procurement/bid-opportunities.html"],
      ["Oklahoma Tourism & Recreation — grants (LWCF)", "https://otrd.travelok.com/grants-overview/"],
      ["Oklahoma Human Services — procurement & grants", "https://oklahoma.gov/okdhs.html"],
      ["Zarrow Family Foundations", "https://zarrow.org/"],
    ];
    for (const [name, url] of repoints) {
      // scout_sources.url is UNIQUE — if the team already added or re-pointed
      // a source to this URL, the UPDATE would throw and, uncaught, take the
      // whole app down at startup (migrate runs before every page). Skip the
      // conflicting row instead: the goal state already exists.
      try {
        await b.run(`UPDATE scout_sources SET url=?, last_hash='' WHERE name=?`, [url, name]);
      } catch {
        /* URL already on another row — keep theirs */
      }
    }
    await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, ?)`, [
      "OSDH — Rural Health Transformation Program funding",
      "https://oklahoma.gov/health/rhtpfunding",
      "state",
    ]);
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v8_url_fixes', 'done')`);
  }

  // One-time upgrade v9 (targeting overhaul): REPLACE the keyword list with
  // phrases matching the organization's actual service lanes — the old broad
  // list ("childcare facilities", "youth development") pulled in marine-mammal
  // and foreign-embassy noise via loose matching — and seed the editable
  // exclude-word list.
  const flag9 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v9_targeting'`);
  if (!flag9) {
    const laneKeywords = [
      "early childhood education",
      "child care center",
      "school readiness",
      "primary care",
      "community health",
      "behavioral health",
      "diabetes prevention",
      "underserved children",
      "family support services",
      "maternal and child health",
      "playground",
      "outdoor recreation",
      "physical activity",
      "youth sports",
      "food pantry",
      "food insecurity",
      "food distribution",
      "community facilities",
      "Native American families",
      "tribal health",
    ].join("\n");
    await b.run(
      `INSERT INTO settings (key, value) VALUES ('scout_keywords', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [laneKeywords]
    );
    await b.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('scout_exclude', ?)`, [
      DEFAULT_EXCLUDES.join("\n"),
    ]);
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v9_targeting', 'done')`);
  }

  // v10 — connector prospecting sweep (Candid/Kindora/Granted, Nov 2026):
  // 12 new Tulsa-area funders, watch pages for their grant cycles, and the
  // deadline-urgent leads as pipeline prospects. Every insert is deduped by
  // normalized name (or UNIQUE url) so rows created earlier — including by
  // the CSV importer on production — are never duplicated or overwritten,
  // and each insert is individually guarded so one bad row can't take the
  // site down (the v8 lesson).
  const flag10 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v10_prospects'`);
  if (!flag10) {
    const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
    const funderKeys = new Set((await b.all<{ name: string }>(`SELECT name FROM funders`)).map((f) => nameKey(f.name)));
    const newFunders: [string, number, string, string, string, string, string][] = [
      // name, tier, focus, award_range, projects, website, notes
      ["William K. Warren Foundation", 1,
        "Health care, health education, mental health, community wellness — Tulsa / NE Oklahoma",
        "Varies", "Medical center services, health education, family wellness",
        "https://www.williamkwarrenfoundation.org/grant-request",
        "Rolling; applications by MAIL only (no email/online). Major Tulsa health funder. Found via connector sweep Nov 2026."],
      ["Coretz Family Foundation", 1,
        "Food insecurity, health, economic mobility, education — Tulsa",
        "Varies", "Food distribution, medical access, family programs",
        "https://coretzfamilyfoundation.org/applications/",
        "Quarterly board deadlines (2026 cycle: Feb 27 / May 22 / Aug 21 / Oct 23) — verify next deadline on site."],
      ["Ruth Nelson Family Foundation", 1,
        "Youth development, general operating, capital, capacity building — Tulsa County",
        "Varies", "Youth sports development, general operations",
        "https://rnfftulsa.org/apply/process/",
        "Rolling LOI via grantinterface portal; prefers City of Tulsa, serves Tulsa County."],
      ["Oklahoma Partnership for School Readiness Foundation", 1,
        "School readiness, early childhood systems — Oklahoma statewide",
        "$400 – varies", "Early learning center programs, classroom materials",
        "https://opsr.submittable.com/submit",
        "Rolling 'Clearinghouse' implementation funding + annual Kathy Cronemiller classroom grants ($400–800, due Aug)."],
      ["Kaleidoscope Foundation", 1,
        "Crisis/respite child care, food provision, youth life skills — names Greater Tulsa",
        "Varies", "Child care, food distribution, youth development",
        "https://kaleidoscope-foundation.org/applications/",
        "Michigan-based but grant program explicitly serves Greater Tulsa. Application by mail; listed deadline Aug 15, 2027."],
      ["David E. & Cassie L. Temple Foundation", 1,
        "General grantmaking — Tulsa / Oklahoma",
        "Varies", "General operations",
        "https://templeok.org/grant-information/",
        "Board reviews proposals at year-end; current cycle closes Dec 31, 2026."],
      ["All Kids Play", 1,
        "Youth sports: registration, equipment, facility improvements — national",
        "Varies", "Sports facilities, youth sports programs",
        "https://allkidsplay.org/youth-sports-grants/",
        "Nationwide exact-fit for the youth-sports lane; rolling."],
      ["Chapman Trusts (J.A. & Leta M / Leta McFarlin Memorial)", 2,
        "Major Tulsa charitable trusts related to Mary K. Chapman Foundation (~$72M/yr combined giving)",
        "Varies", "",
        "https://chapmantrusts.org",
        "Relationship/990 research; the open H.A. & Mary K. Chapman application cycle (grantinterface) closes Mar 1, 2027."],
      ["William S. Smith Charitable Trust", 2,
        "Tulsa — roughly $7.9M/yr in grants",
        "Varies", "", "",
        "No website; 990-driven outreach. Found via connector sweep Nov 2026."],
      ["Sanford P. & Irene F. Burnstein Foundation", 2,
        "Tulsa family foundation (~$12M/yr giving)",
        "Varies", "",
        "https://burnsteinfoundation.com/",
        "Focus areas unverified — check 990s before approach."],
      ["Gelvin Foundation", 2,
        "Equipment & special program needs within 30 miles of Tulsa or Eufaula",
        "Up to $3,000", "Equipment, small capital items",
        "https://www.gelvinfoundation.org/grant",
        "Quarterly: proposals due Feb/May/Aug/Oct 10. Small but easy repeat wins."],
      ["Explorer Pipeline Partner Agency Program (via TCF)", 2,
        "Tulsa / Rogers / Wagoner counties — multi-year partner support + volunteers",
        "Varies", "",
        "https://tulsacf.org/explorer-pipeline-partner-agency-application/",
        "Annual cycle; last closed Aug 31 — watch for the next one."],
    ];
    for (const [name, tier, focus, award, projects, website, notes] of newFunders) {
      try {
        if (!funderKeys.has(nameKey(name))) {
          await b.run(
            `INSERT INTO funders (name, type, tier, focus, award_range, projects, website, notes) VALUES (?, 'foundation', ?, ?, ?, ?, ?, ?)`,
            [name, tier, focus, award, projects, website, notes]
          );
        }
      } catch { /* one bad row never blocks startup */ }
    }

    const newWatch: [string, string][] = [
      ["William K. Warren Foundation — grant request", "https://www.williamkwarrenfoundation.org/grant-request"],
      ["Coretz Family Foundation — applications", "https://coretzfamilyfoundation.org/applications/"],
      ["Ruth Nelson Family Foundation — apply", "https://rnfftulsa.org/apply/process/"],
      ["OPSR — school readiness funding", "https://opsr.submittable.com/submit"],
      ["Temple Foundation — grant information", "https://templeok.org/grant-information/"],
      ["Kaleidoscope Foundation — applications", "https://kaleidoscope-foundation.org/applications/"],
      ["All Kids Play — youth sports grants", "https://allkidsplay.org/youth-sports-grants/"],
      ["Explorer Pipeline (TCF) — partner agency", "https://tulsacf.org/explorer-pipeline-partner-agency-application/"],
      ["Chapman Trusts — foundation portal", "https://chapmantrusts.org"],
      ["GKFF — Accelerator Grants", "https://www.gkff.org/accelerator-grants"],
    ];
    for (const [name, url] of newWatch) {
      try {
        await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, 'foundation')`, [name, url]);
      } catch { /* ignore */ }
    }

    const oppKeys = new Set((await b.all<{ name: string }>(`SELECT name FROM opportunities`)).map((o) => nameKey(o.name)));
    const newOpps: [string, string, string, string, string, string, string][] = [
      // name, funder_name, stage, outcome, deadline (YYYY-MM-DD or ''), url, notes
      ["OCCF Access to Health Care Grant", "Oklahoma City Community Foundation", "prospect", "", "2026-12-10",
        "https://occf.org/communitygrants/health/",
        "Up to $30,000 for expanding health care access for underserved Oklahomans. VERIFY Tulsa-area orgs qualify — OCCF leans central Oklahoma. Found via connector sweep."],
      ["LWCF Outdoor Recreation Grant (Oklahoma)", "Oklahoma Tourism & Recreation Department", "prospect", "", "2026-12-15",
        "https://otrd.travelok.com/land-and-water-conservation-fund",
        "50/50 matching grant for playground / sports-field / outdoor recreation development. Typically local governments + eligible entities — verify nonprofit eligibility or partner with Tulsa County."],
      ["Temple Foundation Year-End Grant", "David E. & Cassie L. Temple Foundation", "prospect", "", "2026-12-31",
        "https://templeok.org/grant-proposal-summary",
        "General grantmaking, Tulsa/OK; board reviews proposals at year-end."],
      ["GKFF Accelerator Grant", "George Kaiser Family Foundation", "awarded", "awarded", "",
        "https://www.gkffai.org/accelerator",
        "ALREADY RECEIVED — recorded as awarded. [VERIFY: award amount — enter it on the opportunity so the dashboard totals are right.]"],
      ["Chapman Foundation General Grant", "H.A. & Mary K. Chapman Foundation", "prospect", "", "2027-03-01",
        "https://www.grantinterface.com/Home/Logon?urlkey=chapmanfoundation",
        "$1K–$10M range; general operations, capital, early childhood, healthcare, parks, feeding programs."],
    ];
    for (const [name, funder, stage, outcome, deadline, url, notes] of newOpps) {
      try {
        if (!oppKeys.has(nameKey(name))) {
          await b.run(
            `INSERT INTO opportunities (name, funder_name, type, stage, outcome, deadline, url, notes) VALUES (?, ?, 'foundation', ?, ?, ?, ?, ?)`,
            [name, funder, stage, outcome, deadline, url, notes]
          );
        }
      } catch { /* ignore */ }
    }
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v10_prospects', 'done')`);
  }

  // v11 — Candid library exports + peer-funder analysis (Nov 2026): funders
  // proven by 990 grants to SquareOne's closest Tulsa peers (Crossover
  // Community Impact, Crosstown Learning Center, Neighbors Along the Line,
  // Tulsa Educare), plus Tulsa grantmakers from the Foundation Directory
  // early-learning/health exports. Name-deduped inserts; contact emails are
  // only filled on existing rows that have none.
  const flag11 = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='seed_v11_candid_library'`);
  if (!flag11) {
    const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
    const funderKeys = new Set((await b.all<{ name: string }>(`SELECT name FROM funders`)).map((f) => nameKey(f.name)));
    // name, tier, focus, award_range, website, notes, contact_name, contact_email
    const newFunders: [string, number, string, string, string, string, string, string][] = [
      ["Ascension St. John — community investment", 1,
        "Health system community benefit: clinics, food access, basic needs — Tulsa",
        "$15K – $1M+", "",
        "EIN 73-0579286. 990 grants: $2.1M to Crossover Community Impact (incl. start-up of a 2nd clinic site for Medicaid-funded care), $430K to Neighbors Along the Line (clinic, food pantry, basic needs). No open application — approach via community benefit / mission office.", "", ""],
      ["Morningcrest Healthcare Foundation", 1,
        "Tulsa healthcare philanthropy",
        "$100K – $400K", "",
        "EIN 04-3815973, ~$107M assets. $400K to Crossover: community center + FreshRx Food-as-Medicine expansion — our medical + food lanes exactly.", "", ""],
      ["Mervin Bovaird Foundation", 1,
        "General support for Tulsa community nonprofits",
        "$10K – $20K", "",
        "EIN 73-6102163, ~$46M assets. Funds ALL THREE studied peers (Crossover, Crosstown, Neighbors Along the Line) $20K general support each.", "", ""],
      ["The Robinson Foundation", 1,
        "Tulsa community support, scholarships",
        "$25K typical", "https://www.robinsonfdn.org/",
        "EIN 73-1014526. $100K to Crossover, $30K to Neighbors Along the Line.", "", ""],
      ["Hille Family Charitable Foundation", 1,
        "General operating for Tulsa nonprofits incl. early learning",
        "$5K – $30K", "https://hillefoundation.org",
        "EIN 73-1521975, ~$48M assets. $90K general operating to Crosstown Learning Center; also funds Neighbors Along the Line.", "", ""],
      ["Broadhurst Foundation", 1,
        "Early learning, education — Tulsa",
        "to $100K", "",
        "EIN 73-6061115. $100K to Crosstown for 'highest-quality early learning and care'.", "", ""],
      ["Sharna & Irvin Frank Foundation", 1,
        "Operations support — Tulsa health & human services",
        "$10K – $12.5K/yr", "https://www.sifrankfoundation.org",
        "EIN 73-1503704. Repeat gen-ops: $50K to Neighbors Along the Line, $30K to Crosstown.", "", ""],
      ["Flint Family Foundation", 1,
        "General operations — Tulsa",
        "$12.5K – $25K", "https://www.flintfamilyfoundation.org",
        "EIN 30-0582777, ~$29M assets. $25K operations to both Crosstown and Neighbors Along the Line.", "", ""],
      ["Steadfast Foundation (Tulsa)", 1,
        "General fund support — Tulsa",
        "~$39K avg", "",
        "EIN 85-2579258. $156K general-fund grants to Crossover through FY2025 — actively giving now.", "", ""],
      ["Charles & Marion Weber Foundation", 1,
        "Tulsa charitable support", "$16K avg", "",
        "EIN 20-7338204. $65K to Neighbors Along the Line.", "", ""],
      ["Welch Family Foundation", 1,
        "Services for those in need — Tulsa", "$10K avg", "",
        "EIN 73-1502461. $31K to Neighbors Along the Line.", "", ""],
      ["Stuart Family Foundation (Tulsa)", 1,
        "General fund — Tulsa", "$10K typical", "",
        "EIN 23-7052187. Funds both Crosstown and Neighbors Along the Line.", "", ""],
      ["Ralph & Frances McGill Foundation", 1,
        "Program services — Tulsa (administered by Trust Company of Oklahoma)",
        "$5K – $6K", "https://www.trustok.com/nonprofit-foundations/",
        "EIN 73-1590898. Funds both Crosstown and Neighbors Along the Line. Trust Co. of OK portal lists guidelines for several client foundations.", "", ""],
      ["The Goatcher Foundation", 2,
        "General operations — Tulsa", "$7K avg", "https://www.goatcherfoundation.org/",
        "EIN 20-0116479. $21K to Neighbors Along the Line.", "", ""],
      ["Charles W. Harris Foundation", 2,
        "Community programs — Tulsa", "$6K avg", "",
        "EIN 26-4536771. $17.5K to Neighbors Along the Line.", "", ""],
      ["CAP Tulsa (Community Action Project of Tulsa County)", 1,
        "PARTNERSHIP target — the region's early-childhood hub, re-grants ECE funding",
        "varies", "https://www.captulsa.org",
        "EIN 73-1019247. Re-granted $661K to Crosstown and $26M to Tulsa Educare for early childhood programs. Pursue partnership/subaward, not an application.",
        "Karen Tilkin (Executive Director)", "karen.tilkin@captulsa.org"],
      ["Charles & Lynn Schusterman Family Philanthropies", 2,
        "Education, young people, Tulsa civic — invite-leaning",
        "varies", "https://www.schusterman.org",
        "EIN 73-1312965, ~$3B. Major Tulsa funder; mostly invited — build the relationship first.", "", "scardin@schusterman.org"],
      ["Maxine & Jack Zarrow Family Foundation", 2,
        "Health, basic needs, social services — Tulsa metro",
        "varies", "https://zarrow.org/",
        "EIN 31-6640903. Separate Zarrow entity, same application portal and grants contact as Anne & Henry Zarrow.",
        "Laura Blais (Grants Manager)", "grants@zarrow.org"],
      ["Jess L. & Miriam B. Stevens Foundation", 2,
        "Education, medical, welfare of needy persons — Tulsa", "varies", "",
        "EIN 73-1557364. From Candid early-learning grantmakers export; small grant to Crosstown on record.", "", ""],
      ["Robert S. & Helen Grey Trippet Foundation", 2,
        "Tulsa private grantmaking", "varies", "",
        "EIN 73-1390841. From Candid early-learning grantmakers export.", "", ""],
      ["Wegener Foundation", 2,
        "Social services, at-risk children and youth — OKC/statewide", "varies", "",
        "EIN 73-6095407. From Candid export: gives primarily to organizations serving at-risk children and youth.", "", ""],
      ["Mike & Susan Burkhart Foundation", 2,
        "Child welfare — Tulsa", "varies", "",
        "EIN 20-2372810. From Candid early-learning grantmakers export.", "", ""],
      ["Clyde & Anita Becker Foundation", 2,
        "Education, health, human services — Tulsa", "varies", "",
        "EIN 20-5106028. From Candid early-learning grantmakers export.", "", ""],
      ["Fulton & Susie Collins Foundation", 2,
        "Tulsa private grantmaking", "varies", "",
        "EIN 73-1273053. From Candid export.", "", ""],
      ["J & S Boyce Family Foundation", 2,
        "Broken Arrow / Tulsa County grantmaking", "varies", "",
        "EIN 87-2387496. From Candid early-learning grantmakers export.", "", ""],
      ["Harold A. & Edna L. White Foundation", 2,
        "Tulsa family foundation", "~$213K/yr total giving", "",
        "EIN 73-1582836. Local scope per IRS records.", "", ""],
      ["Joseph & Virginia Dibert Foundation Trust", 2,
        "Tulsa family foundation", "~$200K/yr total giving", "",
        "EIN 20-7230041.", "", ""],
      ["SendMe Foundation", 2,
        "Porter, OK (Wagoner County) regional giving", "~$129K/yr total giving", "",
        "EIN 26-2355547.", "", ""],
      ["Charles & Peggy Stephenson Family Foundation", 2,
        "Child welfare, education — Tulsa", "varies", "",
        "EIN 73-6301100. From Candid early-learning grantmakers export.", "", ""],
    ];
    for (const [name, tier, focus, award, website, notes, cname, cemail] of newFunders) {
      try {
        if (!funderKeys.has(nameKey(name))) {
          await b.run(
            `INSERT INTO funders (name, type, tier, focus, award_range, website, notes, contact_name, contact_email) VALUES (?, 'foundation', ?, ?, ?, ?, ?, ?, ?)`,
            [name, tier, focus, award, website, notes, cname, cemail]
          );
        }
      } catch { /* one bad row never blocks startup */ }
    }

    // Fill contacts on existing funders ONLY where none is recorded.
    const contactFills: [string, string, string][] = [
      ["Anne & Henry Zarrow Foundation", "Laura Blais (Grants Manager)", "grants@zarrow.org"],
      ["Tulsa Community Foundation", "Phil Lakin Jr. (CEO)", "info@tulsacf.org"],
      ["Tulsa Area United Way", "", "tauw@tulsaunitedway.org"],
      ["Oklahoma City Community Foundation", "", "info@occf.org"],
    ];
    for (const [fname, cname, cemail] of contactFills) {
      try {
        await b.run(
          `UPDATE funders SET contact_name = CASE WHEN contact_name IS NULL OR contact_name='' THEN ? ELSE contact_name END,
                              contact_email = CASE WHEN contact_email IS NULL OR contact_email='' THEN ? ELSE contact_email END
           WHERE name = ?`,
          [cname, cemail, fname]
        );
      } catch { /* ignore */ }
    }

    const newWatch: [string, string][] = [
      ["Hille Family Charitable Foundation", "https://hillefoundation.org"],
      ["Flint Family Foundation", "https://www.flintfamilyfoundation.org"],
      ["Robinson Foundation", "https://www.robinsonfdn.org/"],
      ["Sharna & Irvin Frank Foundation", "https://www.sifrankfoundation.org"],
      ["Goatcher Foundation", "https://www.goatcherfoundation.org/"],
      ["Delta Dental of Oklahoma Foundation", "https://www.ddokfoundation.org"],
      ["Trust Company of Oklahoma — client foundations", "https://www.trustok.com/nonprofit-foundations/"],
    ];
    for (const [name, url] of newWatch) {
      try {
        await b.run(`INSERT OR IGNORE INTO scout_sources (name, url, kind) VALUES (?, ?, 'foundation')`, [name, url]);
      } catch { /* ignore */ }
    }
    await b.run(`INSERT INTO settings (key, value) VALUES ('seed_v11_candid_library', 'done')`);
  }
}

async function addKeywords(b: Backend, keywords: string[]) {
  const row = await b.get<{ value: string }>(`SELECT value FROM settings WHERE key='scout_keywords'`);
  const current = (row?.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  for (const kw of keywords) {
    if (!current.some((c) => c.toLowerCase() === kw.toLowerCase())) current.push(kw);
  }
  await b.run(
    `INSERT INTO settings (key, value) VALUES ('scout_keywords', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [current.join("\n")]
  );
}

async function seed(b: Backend) {
  await b.run(
    `INSERT INTO org_profile (id, name, legal_status, mission, vision, programs, service_area, populations, leadership, stats, ein, uei)
     VALUES (1, @name, @legal_status, @mission, @vision, @programs, @service_area, @populations, @leadership, @stats, @ein, @uei)`,
    SEED_PROFILE as unknown as Record<string, unknown>
  );
  for (const f of SEED_FUNDERS) {
    await b.run(
      `INSERT INTO funders (name, type, tier, focus, award_range, projects, website)
       VALUES (@name, @type, @tier, @focus, @award_range, @projects, @website)`,
      f as unknown as Record<string, unknown>
    );
  }
  for (const r of SEED_READINESS) {
    await b.run(`INSERT INTO readiness (item, category, detail) VALUES (@item, @category, @detail)`, r as unknown as Record<string, unknown>);
  }
  for (const doc of SEED_DOCUMENTS) {
    await b.run(`INSERT INTO documents (name, category) VALUES (@name, @category)`, doc as unknown as Record<string, unknown>);
  }
  for (const n of SEED_NARRATIVES) {
    await b.run(`INSERT INTO narratives (category, title, content) VALUES (@category, @title, @content)`, n as unknown as Record<string, unknown>);
  }
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

export async function ensureProposalSections(opportunityId: number) {
  for (const s of PROPOSAL_SECTIONS) {
    await q.run(`INSERT OR IGNORE INTO proposal_sections (opportunity_id, section_key) VALUES (?, ?)`, [
      opportunityId,
      s.key,
    ]);
  }
}
