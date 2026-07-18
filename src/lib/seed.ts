// Seed data distilled from the SquareOne Grant & Funding Playbook (Build.md Sections 3-6).
// Funder priorities, award ranges, and focus areas come straight from the playbook;
// verify current details on each funder's site before applying.

export const SEED_FUNDERS: {
  name: string;
  type: string;
  tier: number;
  focus: string;
  award_range: string;
  projects: string;
  website: string;
}[] = [
  // Federal (Section 4)
  { name: "HRSA (Health Resources & Services Administration)", type: "federal", tier: 1, focus: "Community health, primary care, rural health, telehealth, behavioral health integration, maternal & pediatric care", award_range: "$100K – $5M+", projects: "Community health workers, diabetes prevention, telemedicine, integrated behavioral health, preventive screenings", website: "https://www.hrsa.gov" },
  { name: "ACF (Administration for Children & Families)", type: "federal", tier: 1, focus: "Early childhood, family stability, parent support, economic mobility", award_range: "$150K – $5M", projects: "Parent education, early literacy, school readiness, family resource navigation, home visiting partnerships", website: "https://www.acf.hhs.gov" },
  { name: "USDA Rural Development", type: "federal", tier: 1, focus: "Rural facilities, equipment, community infrastructure (grants + loans)", award_range: "$50K – $10M+", projects: "Clinic expansion, childcare improvements, community center, equipment, accessibility, energy efficiency", website: "https://www.rd.usda.gov" },
  { name: "SAMHSA", type: "federal", tier: 1, focus: "Behavioral health, mental health, substance abuse prevention, trauma, recovery", award_range: "$300K – $5M", projects: "Youth mental health, trauma-informed families, first responder wellness, suicide prevention, peer support", website: "https://www.samhsa.gov" },
  { name: "CDC", type: "federal", tier: 2, focus: "Public health, prevention, chronic disease, healthy lifestyles", award_range: "$150K – $3M", projects: "Diabetes prevention, healthy communities, nutrition, family wellness, preventive screenings", website: "https://www.cdc.gov" },
  { name: "Indian Health Service (IHS)", type: "federal", tier: 2, focus: "Native health — NOTE: many programs require tribal org / UIO status; verify eligibility per opportunity", award_range: "Varies", projects: "Native wellness, diabetes prevention, maternal health, behavioral health (partner with tribes)", website: "https://www.ihs.gov" },
  { name: "U.S. Department of Education", type: "federal", tier: 2, focus: "Education, youth, school readiness, community learning", award_range: "Varies", projects: "Early childhood, after-school, STEM, parent engagement, literacy", website: "https://www.ed.gov" },
  { name: "U.S. Department of Labor", type: "federal", tier: 2, focus: "Workforce, employment, training", award_range: "Varies", projects: "Healthcare workforce, medical assistants, community health workers, childcare workforce", website: "https://www.dol.gov" },
  { name: "NIH", type: "federal", tier: 3, focus: "Research — pursue only via university/medical school partnerships", award_range: "Varies", projects: "Research partnerships", website: "https://www.nih.gov" },

  // Oklahoma foundations (Section 5)
  { name: "Oklahoma City Community Foundation", type: "foundation", tier: 1, focus: "Community health, children, education, capacity building", award_range: "$10K – $500K+", projects: "Family wellness, early childhood, preventive healthcare, parent education", website: "https://www.occf.org" },
  { name: "Tulsa Community Foundation", type: "foundation", tier: 1, focus: "Education, healthcare, youth, families, community development", award_range: "$5K – $500K+", projects: "Family wellness initiatives, healthcare innovation, childhood development", website: "https://tulsacf.org" },
  { name: "Sarkeys Foundation", type: "foundation", tier: 1, focus: "Healthcare, education, community organizations, capital projects", award_range: "Varies", projects: "Medical expansion, facility improvements, community health initiatives", website: "https://sarkeys.org" },
  { name: "Kirkpatrick Foundation", type: "foundation", tier: 2, focus: "Community well-being, education, health", award_range: "Varies", projects: "Healthy communities, community engagement, wellness education", website: "https://kirkpatrickfoundation.com" },
  { name: "Inasmuch Foundation", type: "foundation", tier: 2, focus: "Community development, healthcare, family services, education", award_range: "Varies", projects: "Healthcare access, parent support, community outreach", website: "https://inasmuchfoundation.org" },
  { name: "George Kaiser Family Foundation", type: "foundation", tier: 2, focus: "Early childhood, education, community health, economic opportunity (highly competitive; pursue via partnership)", award_range: "Varies", projects: "Early childhood collaborations in NE Oklahoma", website: "https://www.gkff.org" },

  // National foundations (Section 5)
  { name: "Robert Wood Johnson Foundation", type: "foundation", tier: 1, focus: "Building healthier communities, health equity", award_range: "$100K – multi-M", projects: "Preventive health, community wellness, family health, integrated care", website: "https://www.rwjf.org" },
  { name: "W.K. Kellogg Foundation", type: "foundation", tier: 1, focus: "Children, families, racial equity, community systems", award_range: "Varies", projects: "Early childhood, parent engagement, family resilience, Native family wellness", website: "https://www.wkkf.org" },
  { name: "The Kresge Foundation", type: "foundation", tier: 2, focus: "Community health, infrastructure, equity, economic mobility", award_range: "Varies", projects: "Community health infrastructure", website: "https://kresge.org" },
  { name: "Annie E. Casey Foundation", type: "foundation", tier: 2, focus: "Outcomes for children and families", award_range: "Varies", projects: "Parent engagement, child development, family support", website: "https://www.aecf.org" },

  // Healthcare funders (Section 5)
  { name: "Blue Cross Blue Shield of Oklahoma Community Programs", type: "healthcare", tier: 1, focus: "Community health, prevention", award_range: "Varies", projects: "Diabetes prevention, healthy lifestyles, community screenings, physical activity", website: "https://www.bcbsok.com" },
  { name: "CVS Health Foundation", type: "healthcare", tier: 2, focus: "Community health, chronic disease, access to care", award_range: "Varies", projects: "Access to care, chronic disease prevention", website: "https://www.cvshealth.com" },
  { name: "UnitedHealthcare Community Grants", type: "healthcare", tier: 2, focus: "Community wellness, health equity, preventive medicine", award_range: "Varies", projects: "Community wellness, preventive medicine", website: "https://www.uhc.com" },
  { name: "American Heart Association", type: "healthcare", tier: 1, focus: "Heart health, community education", award_range: "Varies", projects: "Fitness, nutrition, blood pressure, healthy families", website: "https://www.heart.org" },
  { name: "American Diabetes Association", type: "healthcare", tier: 1, focus: "Diabetes prevention and education", award_range: "Varies", projects: "Diabetes prevention, youth wellness, nutrition education, exercise initiatives", website: "https://diabetes.org" },

  // Oklahoma state agencies (Section 6)
  { name: "Oklahoma State Department of Health (OSDH)", type: "state", tier: 1, focus: "Prevention, chronic disease, maternal health, community health, health equity", award_range: "$25K – $750K+", projects: "Community health workers, diabetes education, obesity prevention, maternal health, mobile health", website: "https://oklahoma.gov/health.html" },
  { name: "Oklahoma Human Services (OKDHS)", type: "state", tier: 1, focus: "Childcare, family stability, child development, workforce participation", award_range: "Varies", projects: "Early childhood expansion, parent education, family engagement, workforce childcare", website: "https://oklahoma.gov/okdhs.html" },
  { name: "Oklahoma Dept. of Mental Health & Substance Abuse Services (ODMHSAS)", type: "state", tier: 1, focus: "Behavioral health, trauma, prevention, recovery", award_range: "Varies", projects: "Youth mental health, trauma-informed families, first responder behavioral health, suicide prevention", website: "https://oklahoma.gov/odmhsas.html" },
  { name: "Oklahoma Health Care Authority (OHCA)", type: "state", tier: 2, focus: "Medicaid, care coordination, preventive healthcare, value-based care", award_range: "Varies", projects: "Care coordination, chronic disease management, telehealth, population health", website: "https://oklahoma.gov/ohca.html" },
  { name: "Oklahoma Department of Commerce", type: "state", tier: 2, focus: "Community development, workforce, rural investment", award_range: "Varies", projects: "Campus expansion, workforce development, healthcare employment", website: "https://oklahoma.gov/commerce.html" },
  { name: "Oklahoma State Department of Education (OSDE)", type: "state", tier: 2, focus: "School readiness, literacy, parent engagement, early childhood", award_range: "Varies", projects: "Kindergarten readiness, family literacy, summer learning, STEM", website: "https://sde.ok.gov" },

  // Corporate prospects (Section 5)
  { name: "BancFirst / BOK Financial / Devon / Williams / Paycom / Love's / QuikTrip / PSO / OG&E (corporate giving)", type: "corporate", tier: 2, focus: "Oklahoma corporate community investment — confirm current giving priorities and windows before applying", award_range: "$2.5K – $25K+ sponsorships", projects: "Sponsorship packages: Bronze $2.5K / Silver $5K / Gold $10K / Platinum $25K+", website: "" },

  // Tribal partnerships (Section 5)
  { name: "Tribal partnerships (Cherokee, Muscogee, Choctaw, Chickasaw, Osage & other OK nations)", type: "tribal", tier: 1, focus: "Collaboration-first: wellness, diabetes prevention, behavioral health, youth, early childhood, cultural programming. Eligibility varies by tribe — Native-led does NOT equal tribal-organization status", award_range: "$100K – $1M/yr potential", projects: "Joint programming based on geographic service area and tribal priorities", website: "" },
];

// Grant-readiness checklist (Section 4 registrations + master documents).
// These are the prerequisites without which no software raises a dollar.
export const SEED_READINESS: { item: string; category: string; detail: string }[] = [
  { item: "UEI (Unique Entity Identifier)", category: "Federal registration", detail: "Obtain/verify at SAM.gov. Required for all federal applications." },
  { item: "SAM.gov registration ACTIVE", category: "Federal registration", detail: "Must be active with banking info, IRS docs, authorized administrator. Review monthly." },
  { item: "Grants.gov account & workspace", category: "Federal registration", detail: "Primary federal application portal. Requires active SAM registration." },
  { item: "IRS 501(c)(3) determination letter", category: "Core documents", detail: "On file and available as PDF." },
  { item: "Most recent Form 990", category: "Core documents", detail: "Current filing available as PDF." },
  { item: "Audit or financial statements", category: "Core documents", detail: "Most recent audit (or reviewed/compiled financials) available." },
  { item: "Board roster with affiliations", category: "Core documents", detail: "Current board list with titles and community affiliations." },
  { item: "Articles of incorporation & bylaws", category: "Core documents", detail: "Current copies on file." },
  { item: "Annual operating budget", category: "Core documents", detail: "Board-approved current-year budget." },
  { item: "Strategic plan", category: "Core documents", detail: "Current strategic plan document." },
  { item: "Insurance certificates", category: "Core documents", detail: "General liability and other required coverage certificates." },
  { item: "W-9", category: "Core documents", detail: "Signed current W-9." },
  { item: "Conflict of interest & financial controls policies", category: "Policies", detail: "Board-adopted policies — commonly required attachments." },
  { item: "VERIFIED program statistics", category: "Data", detail: "Real numbers: patients served, children enrolled, counties served, outcomes. The playbook forbids invented statistics — proposals cannot go out without these." },
  { item: "Organization profile completed in this app", category: "Data", detail: "Fill in the Profile page — the AI agents draft from it." },
];

// Standard attachment library (Section 4 master documents).
export const SEED_DOCUMENTS: { name: string; category: string }[] = [
  { name: "IRS Determination Letter", category: "Legal" },
  { name: "Articles of Incorporation", category: "Legal" },
  { name: "Bylaws", category: "Legal" },
  { name: "Board Roster", category: "Governance" },
  { name: "Organizational Chart", category: "Governance" },
  { name: "Strategic Plan", category: "Governance" },
  { name: "Annual Budget", category: "Financial" },
  { name: "Most Recent Audit", category: "Financial" },
  { name: "Form 990", category: "Financial" },
  { name: "Financial Statements", category: "Financial" },
  { name: "W-9", category: "Financial" },
  { name: "UEI Confirmation", category: "Federal" },
  { name: "SAM Registration Proof", category: "Federal" },
  { name: "Insurance Certificates", category: "Legal" },
  { name: "Staff Résumés / Job Descriptions", category: "Program" },
  { name: "Letters of Support", category: "Program" },
  { name: "Community Needs Assessment", category: "Program" },
  { name: "Logic Model (master)", category: "Program" },
  { name: "Facility Photos / Campus Map", category: "Program" },
  { name: "Conflict of Interest Policy", category: "Policies" },
];

// Narrative library skeletons seeded from Section 3 (the master narrative).
export const SEED_NARRATIVES: { category: string; title: string; content: string }[] = [
  {
    category: "Mission & Vision",
    title: "Mission Statement",
    content:
      "SquareOne Compassion exists to strengthen families by removing barriers to health, education, wellness, and community connection through integrated, compassionate services that improve quality of life for every generation.",
  },
  {
    category: "Mission & Vision",
    title: "Vision Statement",
    content:
      "To become Oklahoma's leading Native-led family wellness campus where healthcare, education, fitness, prevention, and community engagement work together to create healthier children, stronger families, and more resilient communities.",
  },
  {
    category: "Organization Description",
    title: "Standard Description (100 words)",
    content:
      "SquareOne Compassion is an Oklahoma-based 501(c)(3) nonprofit organization dedicated to strengthening families through integrated healthcare, early childhood education, wellness, and community engagement. By operating multiple complementary programs on a unified campus, SquareOne reduces barriers to care while improving long-term health and educational outcomes. The organization emphasizes prevention, collaboration, and measurable impact through primary care, early learning, fitness, and community programming. Native-led leadership, experienced nonprofit management, and an integrated service model position SquareOne to develop innovative partnerships that improve quality of life for children, families, and communities throughout Oklahoma.",
  },
  {
    category: "Organization Description",
    title: "Standard Description (250 words) — NEEDS VERIFIED DATA",
    content:
      "[PLACEHOLDER — expand the 100-word version with verified service-area data, annual participant counts, and outcomes before external use. Do not invent statistics.]",
  },
  {
    category: "Key Messages",
    title: "Seven Key Messages (use in every proposal)",
    content:
      "1. SquareOne provides integrated family services rather than isolated programs.\n2. Prevention is more effective and less expensive than crisis intervention.\n3. Existing infrastructure allows funding to produce immediate impact.\n4. Native leadership strengthens community relationships and cultural understanding.\n5. Partnerships multiply impact and improve sustainability.\n6. Grant funding expands proven programs instead of creating temporary initiatives.\n7. Long-term success is measured through healthier families, stronger communities, and sustainable organizational growth.",
  },
  {
    category: "Program Descriptions",
    title: "SquareOne Medical Center",
    content:
      "The Medical Center delivers accessible primary healthcare for children and adults with a focus on prevention before crisis: routine primary care, preventive screenings, chronic disease management, pediatric and adult healthcare, wellness visits, and community health education. The clinic integrates medical care with other campus programs, allowing providers to refer families to fitness, nutrition, education, and community programming.",
  },
  {
    category: "Program Descriptions",
    title: "SquareOne Early Learning Center",
    content:
      "The Early Learning Center provides high-quality early childhood education in a safe, nurturing environment designed to prepare children for long-term academic success. Priorities: kindergarten readiness, social-emotional development, parent engagement, early literacy, healthy childhood development, and workforce support for parents.",
  },
  {
    category: "Program Descriptions",
    title: "SquareOne Interactive (Fitness & Wellness)",
    content:
      "SquareOne Interactive promotes physical wellness through recreation, fitness, movement, and community engagement — youth fitness, adult fitness, senior wellness, speed and agility training, and family wellness activities. Proposals should emphasize measurable health outcomes rather than recreation alone.",
  },
  {
    category: "Program Descriptions",
    title: "Community Event Center",
    content:
      "The Event Center provides flexible community space supporting education, collaboration, and outreach: parenting education, health fairs, workforce training, Native cultural events, community meetings, youth leadership, nutrition education, and family resource events. In grant applications, present this as a community gathering and education facility, not a commercial rental venue.",
  },
  {
    category: "Templates",
    title: "SMART Objective Template",
    content:
      "By the end of the project period, [population] will achieve [measurable result], as measured by [evaluation method], within [timeframe].",
  },
  {
    category: "Cautions",
    title: "Native Leadership & Eligibility (read before every federal application)",
    content:
      "SquareOne is Native-led — a significant organizational strength for cultural understanding, relationship-building, and community trust. However, being Native-led does NOT automatically satisfy statutory definitions (Federally Recognized Tribe, Tribal Organization, Tribal Consortium, Urban Indian Organization). Never imply eligibility for tribal-specific programs unless statutory requirements are met; verify eligibility independently for each opportunity.",
  },
];

export const SEED_PROFILE = {
  name: "SquareOne Compassion",
  legal_status: "Oklahoma nonprofit corporation, IRS 501(c)(3)",
  mission:
    "SquareOne Compassion exists to strengthen families by removing barriers to health, education, wellness, and community connection through integrated, compassionate services that improve quality of life for every generation.",
  vision:
    "To become Oklahoma's leading Native-led family wellness campus where healthcare, education, fitness, prevention, and community engagement work together to create healthier children, stronger families, and more resilient communities.",
  programs:
    "SquareOne Medical Center (primary care), SquareOne Early Learning Center (early childhood education), SquareOne Interactive (fitness & wellness), Community Event Center (community education & gathering).",
  service_area: "Northeastern Oklahoma",
  populations:
    "Children, parents, grandparents, caregivers, working families, low-income households, rural residents, Native American families, individuals seeking preventive healthcare.",
  leadership:
    "Matthew Riley Blair, President — nonprofit leadership, organizational strategy, ministry, technology entrepreneurship, AI product development; ~20 years as volunteer firefighter and fire chaplain (Spencer FD, Berryhill FD).",
  stats:
    "[NEEDS VERIFIED DATA: annual patients served, childcare enrollment, counties served, outcome metrics — do not submit proposals citing statistics until these are filled in with real numbers]",
  ein: "",
  uei: "",
};
