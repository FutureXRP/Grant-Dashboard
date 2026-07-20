import { db } from "./db";

// SF-424 (Application for Federal Assistance) support.
//
// The official Grants.gov PDFs are Adobe XFA forms that can't be filled
// programmatically, and Workspace webforms require typing values in anyway —
// so the app produces a completed, print-styled preparation copy: every
// numbered SF-424 item with the org's real answer, ready to transcribe or
// attach. Identity fields (EIN, UEI, address, districts, authorized rep) are
// entered once and reused for every application; per-grant fields live with
// the opportunity.

// One-time organizational identity — the fields that are identical on every
// federal application. Stored as JSON in settings under 'federal_identity'.
export type FederalIdentity = {
  legal_name: string;
  ein: string;
  uei: string;
  street: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  org_unit: string;
  applicant_type: string; // SF-424 item 9 code + label
  congressional_district: string;
  contact_name: string;
  contact_title: string;
  contact_phone: string;
  contact_email: string;
  auth_rep_name: string;
  auth_rep_title: string;
  auth_rep_phone: string;
  auth_rep_email: string;
  eo12372: string; // item 19 answer
  federal_debt: string; // item 20 answer
};

export const IDENTITY_FIELDS: { key: keyof FederalIdentity; label: string; hint?: string }[] = [
  { key: "legal_name", label: "Legal name (exactly as registered with IRS/SAM)" },
  { key: "ein", label: "EIN / TIN" },
  { key: "uei", label: "UEI (from SAM.gov)" },
  { key: "street", label: "Street address" },
  { key: "city", label: "City" },
  { key: "county", label: "County" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP + 4" },
  { key: "org_unit", label: "Department / division (if any)" },
  {
    key: "applicant_type",
    label: "Type of applicant (SF-424 item 9)",
    hint: "For a 501(c)(3) that is not a college: “M: Nonprofit with 501C3 IRS Status (Other than Institution of Higher Education)”",
  },
  {
    key: "congressional_district",
    label: "Congressional district (e.g. OK-001)",
    hint: "Look yours up at house.gov/representatives/find-your-representative",
  },
  { key: "contact_name", label: "Contact person — name" },
  { key: "contact_title", label: "Contact person — title" },
  { key: "contact_phone", label: "Contact person — phone" },
  { key: "contact_email", label: "Contact person — email" },
  { key: "auth_rep_name", label: "Authorized representative — name", hint: "The person legally authorized to sign for the organization (usually President/ED)" },
  { key: "auth_rep_title", label: "Authorized representative — title" },
  { key: "auth_rep_phone", label: "Authorized representative — phone" },
  { key: "auth_rep_email", label: "Authorized representative — email" },
  {
    key: "eo12372",
    label: "Item 19 — E.O. 12372 state review",
    hint: "Oklahoma does not participate in the E.O. 12372 intergovernmental review process for most programs — the usual answer is “Program is not covered by E.O. 12372.” Verify in the NOFO.",
  },
  {
    key: "federal_debt",
    label: "Item 20 — delinquent on any federal debt?",
    hint: "“No” unless the organization is delinquent on federal debt — if Yes, an explanation must be attached.",
  },
];

const EMPTY_IDENTITY: FederalIdentity = {
  legal_name: "", ein: "", uei: "", street: "", city: "", county: "", state: "Oklahoma", zip: "",
  org_unit: "", applicant_type: "M: Nonprofit with 501C3 IRS Status (Other than Institution of Higher Education)",
  congressional_district: "", contact_name: "", contact_title: "", contact_phone: "", contact_email: "",
  auth_rep_name: "", auth_rep_title: "", auth_rep_phone: "", auth_rep_email: "",
  eo12372: "Program is not covered by E.O. 12372.", federal_debt: "No",
};

export function getFederalIdentity(): FederalIdentity {
  const row = db().prepare(`SELECT value FROM settings WHERE key='federal_identity'`).get() as
    | { value: string }
    | undefined;
  let saved: Partial<FederalIdentity> = {};
  try {
    saved = row?.value ? (JSON.parse(row.value) as Partial<FederalIdentity>) : {};
  } catch {
    saved = {};
  }
  // Prefill legal name / EIN / UEI from the org profile the first time.
  const profile = db().prepare(`SELECT name, ein, uei FROM org_profile WHERE id=1`).get() as
    | { name: string; ein: string; uei: string }
    | undefined;
  return {
    ...EMPTY_IDENTITY,
    legal_name: profile?.name ?? "",
    ein: profile?.ein ?? "",
    uei: profile?.uei ?? "",
    ...Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== "" && v != null)),
  } as FederalIdentity;
}

export function saveFederalIdentity(identity: FederalIdentity) {
  db()
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('federal_identity', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    )
    .run(JSON.stringify(identity));
}

// Per-opportunity SF-424 values — the items that change with each application.
export type Sf424Data = {
  submission_type: string; // item 1
  application_type: string; // item 2
  federal_agency: string; // item 10
  assistance_listing: string; // item 11 (CFDA / Assistance Listing number + title)
  opportunity_number: string; // item 12
  opportunity_title: string; // item 12
  competition_id: string; // item 13
  areas_affected: string; // item 14
  project_title: string; // item 15
  district_project: string; // item 16b
  start_date: string; // item 17a
  end_date: string; // item 17b
  fund_federal: string; // item 18a
  fund_applicant: string; // item 18b
  fund_state: string; // item 18c
  fund_local: string; // item 18d
  fund_other: string; // item 18e
  fund_income: string; // item 18f
};

export const SF424_FIELDS: (keyof Sf424Data)[] = [
  "submission_type", "application_type", "federal_agency", "assistance_listing",
  "opportunity_number", "opportunity_title", "competition_id", "areas_affected",
  "project_title", "district_project", "start_date", "end_date",
  "fund_federal", "fund_applicant", "fund_state", "fund_local", "fund_other", "fund_income",
];

type OppRow = {
  id: number;
  name: string;
  funder_name: string;
  amount: number;
  grants_gov_number: string;
  sf424_json: string;
};

// Saved values merged over sensible defaults drawn from the opportunity.
export function getSf424(opp: OppRow, identity: FederalIdentity): Sf424Data {
  let saved: Partial<Sf424Data> = {};
  try {
    saved = opp.sf424_json ? (JSON.parse(opp.sf424_json) as Partial<Sf424Data>) : {};
  } catch {
    saved = {};
  }
  const defaults: Sf424Data = {
    submission_type: "Application",
    application_type: "New",
    federal_agency: opp.funder_name || "",
    assistance_listing: "",
    opportunity_number: opp.grants_gov_number || "",
    opportunity_title: opp.name || "",
    competition_id: "",
    areas_affected: "",
    project_title: opp.name || "",
    district_project: identity.congressional_district || "",
    start_date: "",
    end_date: "",
    fund_federal: opp.amount ? String(opp.amount) : "",
    fund_applicant: "0",
    fund_state: "0",
    fund_local: "0",
    fund_other: "0",
    fund_income: "0",
  };
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== "" && v != null)),
  } as Sf424Data;
}

export function saveSf424(oppId: number, data: Sf424Data) {
  db().prepare(`UPDATE opportunities SET sf424_json=?, updated_at=datetime('now') WHERE id=?`).run(
    JSON.stringify(data),
    oppId
  );
}

export function sf424Total(data: Sf424Data): number {
  return (
    ["fund_federal", "fund_applicant", "fund_state", "fund_local", "fund_other", "fund_income"] as const
  ).reduce((sum, k) => sum + (Number(String(data[k]).replace(/[^0-9.-]/g, "")) || 0), 0);
}
