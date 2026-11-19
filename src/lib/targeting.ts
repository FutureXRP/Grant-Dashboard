// The single source of truth for WHAT SQUAREONE PURSUES, injected into every
// AI prompt that finds or grades grants (federal grading, page-watch
// extraction, deep discovery). One targeting rule, stated once:
//   (A) the grant is open to nonprofits in our geography and funds one of our
//       service lanes OR general operations; or
//   (B) the grant is nationwide/open-geography and matches a service lane
//       exactly.
// Everything else is noise.

export const TARGETING = `# Targeting rule — what this organization pursues
GEOGRAPHY: the organization is in the Oakhurst community of Tulsa County, northeastern Oklahoma. A grant qualifies geographically if it is open to nonprofits in Tulsa County, northeastern Oklahoma, Oklahoma statewide, or nationwide/any-geography. Programs restricted to other states, counties, cities, or countries DO NOT qualify.

SERVICE LANES (the only program areas that count as a fit):
1. Early learning / child care center — early childhood education, school readiness, child care facilities
2. Primary care clinic — community health, preventive care, chronic disease (incl. diabetes), behavioral/mental health services delivered in primary care
3. Underserved children & families — basic needs, family support, two-generation programs
4. Playgrounds & outdoor recreation — playground, splash pad, walking track, parks, community outdoor spaces
5. Youth sports development & sports facilities — youth athletics, sports programming, recreation/fitness facilities
6. Family entertainment & community recreation — fitness center, community event center, family programming
7. Food security — food pantry, food distribution, community kitchen, meal programs, food insecurity
8. General operating support for community-serving nonprofits

THE RULE: strong_fit or possible_fit ONLY when (A) the grant is geographically open to us AND funds a service lane or general operations, or (B) the grant is nationwide AND matches a service lane exactly. Local/state grants get the benefit of the doubt on service breadth; nationwide grants do not — they must name our kind of work.

NEVER A FIT (grade not_eligible, or simply do not report): work outside the US or overseas/mission programs; research grants for universities, hospitals, or laboratories (NIH research project/center/fellowship awards and the like); individual fellowships or scholarships; government-agency-only programs; marine/wildlife/fisheries/agriculture-production programs; arts-only programs; housing development; workforce programs unrelated to our lanes; anything restricted to a geography that excludes Tulsa County, Oklahoma.

TRIBAL NUANCE (unchanged): the org is Native-led WITHOUT statutory tribal status. Programs open to "Native nonprofit organizations" (e.g. ACF/ANA) qualify; programs restricted to federally recognized tribes/tribal governments do not.

DEADLINES: never report an opportunity whose application window has closed. If a closed program recurs annually and the next cycle is expected within about a year, you may report it with the deadline field set to e.g. "next cycle expected spring 2027" — never put the past date in the deadline field.`;

// Deterministic noise filter for Grants.gov results, applied BEFORE any AI
// grading — kills the obvious junk that loose keyword matching lets through
// ("childcare facilities" matching marine-mammal facilities). User-editable on
// the Scout page (settings key 'scout_exclude'); matching is case-insensitive
// substring against title + agency.
export const DEFAULT_EXCLUDES = [
  "marine",
  "mammal",
  "fisheries",
  "wildlife",
  "aquaculture",
  "embassy",
  "u.s. mission",
  "public diplomacy",
  "clinical trial",
  "dissertation",
  "postdoctoral",
  "fellowship",
  "synchrotron",
  "laboratory-based",
  "research specialist",
  "dislocated worker",
  "cooperative agreement with institutions of higher education",
];

export function isExcluded(title: string, agency: string, excludes: string[]): boolean {
  const hay = `${title} ${agency}`.toLowerCase();
  return excludes.some((e) => e && hay.includes(e.toLowerCase()));
}

// Grants.gov titles arrive with raw HTML entities ("&ndash;", "&nbsp;").
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
