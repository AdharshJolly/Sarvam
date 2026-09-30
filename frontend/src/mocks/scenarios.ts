import type {
  Challenge,
  Claim,
  CitationRef,
  Conflict,
  CoverageCell,
  DimensionRollup,
  Event,
  Origin,
  Passage,
  Plan,
  ReportView,
  Source,
  StopDecision,
} from "@contracts/types";
import {
  type DraftEvent,
  mkCell,
  mkClaim,
  mkEvent,
  mkOrigin,
  mkPassage,
  mkSource,
  sequence,
} from "./builders";

export type ScenarioId = "complete" | "insufficient" | "budget-wrapup" | "failure" | "replay";

export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "complete", label: "Complete (SUFFICIENT_WITH_CAVEATS)" },
  { id: "insufficient", label: "Insufficient (critical slot RED)" },
  { id: "budget-wrapup", label: "Budget wrap-up (challenge skipped)" },
  { id: "failure", label: "Failure (BLOCKED mid-run)" },
  { id: "replay", label: "Replay (recorded)" },
];

export interface Scenario {
  id: ScenarioId;
  label: string;
  runId: string;
  question: string;
  events: Event[];
  passages: Record<string, Passage>;
  report: ReportView | null;
  /** Event id of report.verified; the report is served from that point on. */
  reportAtEvent: number | null;
}

export const CANONICAL_QUESTION =
  "Should a company launch an electric scooter subscription service in Bengaluru in 2027?";

const BUDGET = {
  max_searches: 30,
  max_fetches: 60,
  max_llm_calls: 80,
  max_cost_usd: 2,
  max_wall_seconds_soft: 240,
  max_wall_seconds_hard: 300,
  max_followup_rounds: 1,
};

interface SlotDef {
  id: string;
  name: string;
  description: string;
  critical: boolean;
  attributes: string[];
  primary_ok?: boolean;
  task: string;
  query: string;
}

const DIMS: { id: string; name: string; critical: boolean; slots: SlotDef[] }[] = [
  {
    id: "D1",
    name: "Demand",
    critical: true,
    slots: [
      { id: "D1S1", name: "Market size", description: "Size of the Bengaluru e-scooter rental market", critical: true, attributes: ["market_size"], task: "T1", query: "Bengaluru electric scooter rental market size 2025" },
      { id: "D1S2", name: "Rider willingness to subscribe", description: "Share of commuters open to subscriptions", critical: false, attributes: ["adoption"], task: "T2", query: "Bengaluru commuters shared scooter adoption survey" },
    ],
  },
  {
    id: "D2",
    name: "Pricing",
    critical: true,
    slots: [
      { id: "D2S1", name: "Competitor subscription pricing", description: "Monthly prices charged by existing operators", critical: true, attributes: ["monthly_price"], task: "T3", query: "electric scooter subscription price per month Bengaluru" },
      { id: "D2S2", name: "Rider price sensitivity", description: "What riders say they would pay", critical: false, attributes: ["willingness_to_pay"], task: "T4", query: "Bengaluru scooter rental price sensitivity survey" },
    ],
  },
  {
    id: "D3",
    name: "Regulation",
    critical: true,
    slots: [
      { id: "D3S1", name: "Operating permit rules", description: "Licences needed to operate rentals", critical: true, attributes: ["permit"], primary_ok: true, task: "T5", query: "Karnataka aggregator licence electric scooter rental rules" },
      { id: "D3S2", name: "Parking and zone restrictions", description: "Where scooters may be parked or ridden", critical: false, attributes: ["zones"], task: "T6", query: "Bengaluru scooter parking zone restrictions" },
    ],
  },
  {
    id: "D4",
    name: "Unit economics",
    critical: true,
    slots: [
      { id: "D4S1", name: "Vehicle and battery cost", description: "Capital cost per scooter", critical: true, attributes: ["capex"], task: "T7", query: "electric scooter ex-showroom price battery replacement cost" },
      { id: "D4S2", name: "Charging and maintenance cost", description: "Running cost per scooter", critical: true, attributes: ["opex"], task: "T8", query: "electric scooter fleet charging cost per day" },
    ],
  },
  {
    id: "D5",
    name: "Competition",
    critical: false,
    slots: [
      { id: "D5S1", name: "Incumbent operators", description: "Who operates shared scooters today", critical: false, attributes: ["share"], task: "T9", query: "Bengaluru shared scooter operators market share" },
      { id: "D5S2", name: "Substitutes", description: "Alternatives such as autos and metro", critical: false, attributes: ["substitutes"], task: "T10", query: "Bengaluru last mile alternatives scooter rental" },
    ],
  },
];

function buildPlan(): Plan {
  return {
    budget: BUDGET,
    dimensions: DIMS.map((d) => ({
      id: d.id,
      name: d.name,
      description: "",
      critical: d.critical,
      slots: d.slots.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        critical: s.critical,
        attributes: s.attributes,
        min_independent: 2,
        primary_ok: s.primary_ok ?? false,
        tasks: [{ id: s.task, query: s.query }],
      })),
    })),
  };
}

type Variant = "complete" | "insufficient" | "budget-wrapup" | "failure" | "replay";

interface Data {
  sources: Source[];
  passages: Passage[];
  claims: Claim[];
}

function buildData(runId: string): Data {
  const S = (id: string, host: string, task: string, o: Parameters<typeof mkSource>[4] = {}) =>
    mkSource(runId, id, host, task, o);
  const sources: Source[] = [
    S("S1", "news-a.example.invalid", "T3"),
    S("S2", "news-b.example.invalid", "T3"),
    S("S3", "news-c.example.invalid", "T3"),
    S("S4", "news-d.example.invalid", "T3"),
    S("S5", "scooterblog.example.invalid", "T3", { type: "blog", tier: 3 }),
    S("S6", "ridenow.example.invalid", "T3", { type: "company_primary", tier: 1 }),
    S("S7", "forum-digest.example.invalid", "T3", { published: null }),
    S("S8", "transport.gov.example.invalid", "T5", { type: "regulator", tier: 1, published: "2025-11-02" }),
    S("S9", "paywalled-news.example.invalid", "T1", { status: "SOURCE_UNAVAILABLE", fail: "HTTP 403 Forbidden" }),
    S("S10", "spa-report.example.invalid", "T2", { type: "unknown", tier: 3, status: "SOURCE_EMPTY", fail: "Page requires JavaScript; no text extracted" }),
    S("S11", "marketlens.example.invalid", "T1", { type: "blog", tier: 3, published: "2025-08-20" }),
    S("S12", "economy-daily.example.invalid", "T1", { published: "2022-01-10" }),
    S("S13", "commute-survey.example.invalid", "T2", { type: "blog", tier: 3 }),
    S("S14", "voltride.example.invalid", "T7", { type: "company_primary", tier: 1 }),
    S("S15", "city-desk.example.invalid", "T9"),
    S("S16", "riderpoll.example.invalid", "T4", { type: "blog", tier: 3 }),
    S("S17", "fleetops.example.invalid", "T8", { type: "blog", tier: 3 }),
    S("S18", "energy-weekly.example.invalid", "T8"),
    S("S19", "consumer-report.example.invalid", "T11"),
    S("S20", "voltride-service.example.invalid", "T12", { type: "company_primary", tier: 1 }),
  ];
  const P = (id: string, src: string, idx: number, text: string) => mkPassage(id, src, idx, text);
  const passages: Passage[] = [
    P("P1", "S1", 0, "RideNow, a Bengaluru operator, announced a new plan today. RideNow launches scooter subscription at Rs 1,499 per month for daily commuters. The plan starts next week."),
    P("P2", "S2", 0, "In a statement, RideNow said the plan is open to all riders. RideNow launches scooter subscription at Rs 1,499 per month for daily commuters. Bookings open on the app."),
    P("P3", "S3", 0, "Commuters in the city get a new option. RideNow launches scooter subscription at Rs 1,499 per month for daily commuters. Insurance terms were not disclosed."),
    P("P4", "S4", 0, "A new mobility plan arrives this week. RideNow launches scooter subscription at Rs 1,499 per month for daily commuters, the company said."),
    P("P5", "S5", 0, "We looked at the new plan. According to RideNow's press release the plan costs Rs 1,499 per month, though we could not verify it independently."),
    P("P6", "S6", 0, "Pricing. Monthly plan: Rs 1,799 per month including insurance and battery swaps. Cancel any time with seven days notice."),
    P("P7", "S7", 0, "Forum thread summary. Riders in Bengaluru pay around Rs 1,500 monthly for scooter rentals, according to several posters."),
    P("P8", "S8", 0, "Rule 4. Operators must hold a valid aggregator licence under the Karnataka On-Demand Transportation Technology Aggregators Rules before offering rentals."),
    P("P9", "S11", 0, "Market overview. The Bengaluru e-scooter rental market was worth USD 120 million in 2025, counting only electric scooters offered for rent."),
    P("P10", "S12", 0, "Economy note. Bengaluru shared micro-mobility revenue reached USD 350 million in 2025, including scooters, bikes and e-cycles."),
    P("P11", "S17", 0, "Fleet operations diary. Charging costs about Rs 40 per day per scooter at our depot rate."),
    P("P12", "S18", 0, "Energy report. Energy and swapping costs average Rs 1,200 per month per scooter across the surveyed fleets."),
    P("P13", "S14", 0, "Specifications. The V1 scooter costs Rs 92,000 ex-showroom in Bengaluru, with a 3 kWh removable battery."),
    P("P14", "S15", 0, "City desk analysis. Two operators account for over half of shared scooter trips in the city, according to trip data."),
    P("P15", "S13", 0, "Survey results. Only 1 in 5 commuters has tried a shared scooter, and most were occasional users."),
    P("P16", "S16", 0, "Poll of 400 riders. Survey respondents said they would pay up to Rs 1,200 per month for a subscription."),
    P("P17", "S19", 0, "Consumer report. Monthly rental prices for e-scooters range between Rs 1,400  and Rs 1,800 depending on insurance and battery terms."),
    P("P18", "S20", 0, "Service price list. Battery pack replacement costs Rs 28,000 for the V1 scooter outside warranty."),
    P("P19", "S11", 1, "Outlook. Analysts expect 18% annual growth through 2030 in the rental segment."),
    P("P20", "S8", 1, "Procedure. Permits are issued within 30 days of application, subject to document checks."),
  ];
  const C = (id: string, slot: string, pid: string, text: string, quote: string, o: Parameters<typeof mkClaim>[6] = {}) =>
    mkClaim(runId, id, slot, pid, text, quote, o);
  const price = { entity: "RideNow", attribute: "monthly_price", unit: "INR", period: "month" };
  const claims: Claim[] = [
    C("C1", "D2S1", "P1", "RideNow subscription costs Rs 1,499 per month (news-a).", "subscription at Rs 1,499 per month", { ...price, value: 1499 }),
    C("C2", "D2S1", "P2", "RideNow subscription costs Rs 1,499 per month (news-b).", "subscription at Rs 1,499 per month", { ...price, value: 1499 }),
    C("C3", "D2S1", "P3", "RideNow subscription costs Rs 1,499 per month (news-c).", "subscription at Rs 1,499 per month", { ...price, value: 1499 }),
    C("C4", "D2S1", "P4", "RideNow subscription costs Rs 1,499 per month (news-d).", "subscription at Rs 1,499 per month", { ...price, value: 1499 }),
    C("C5", "D2S1", "P5", "A blog repeats the Rs 1,499 per month price from the press release.", "the plan costs Rs 1,499 per month", { ...price, value: 1499 }),
    C("C6", "D2S1", "P6", "RideNow's own page lists Rs 1,799 per month including insurance.", "Monthly plan: Rs 1,799 per month including insurance", { ...price, value: 1799 }),
    C("C7", "D2S1", "P7", "Forum posters say riders pay about Rs 1,500 monthly.", "pay around Rs 1,500 monthly for scooter rentals", { entity: "riders", attribute: "monthly_price", value: 1500, unit: "INR", period: "month" }),
    C("C8", "D3S1", "P8", "Operators need an aggregator licence before offering rentals.", "Operators must hold a valid aggregator licence"),
    C("C9", "D1S1", "P9", "The Bengaluru e-scooter rental market was worth USD 120 million in 2025.", "worth USD 120 million in 2025", { entity: "e-scooter rental market", attribute: "market_size", value: 120, unit: "USD million", period: "2025" }),
    C("C10", "D1S1", "P10", "Bengaluru shared micro-mobility revenue reached USD 350 million in 2025.", "revenue reached USD 350 million in 2025", { entity: "shared micro-mobility", attribute: "market_size", value: 350, unit: "USD million", period: "2025" }),
    C("C11", "D4S2", "P11", "Charging costs about Rs 40 per day per scooter.", "Charging costs about Rs 40 per day per scooter", { entity: "scooter", attribute: "charging_cost", value: 40, unit: "INR", period: "day" }),
    C("C12", "D4S2", "P12", "Energy and swapping costs average Rs 1,200 per month per scooter.", "average Rs 1,200 per month per scooter", { entity: "scooter", attribute: "charging_cost", value: 1200, unit: "INR", period: "month" }),
    C("C13", "D4S1", "P13", "The V1 scooter costs Rs 92,000 ex-showroom.", "costs Rs 92,000 ex-showroom", { entity: "V1 scooter", attribute: "vehicle_cost", value: 92000, unit: "INR" }),
    C("C14", "D5S1", "P14", "Two operators carry over half of shared scooter trips.", "Two operators account for over half of shared scooter trips"),
    C("C15", "D1S2", "P15", "Only one in five commuters has tried a shared scooter.", "Only 1 in 5 commuters has tried a shared scooter", { attribute: "trial_rate", value: 20, unit: "percent" }),
    C("C16", "D2S2", "P16", "Surveyed riders would pay up to Rs 1,200 per month.", "would pay up to Rs 1,200 per month", { attribute: "willingness_to_pay", value: 1200, unit: "INR", period: "month" }),
    C("C17", "D2S1", "P17", "An independent report lists monthly prices from Rs 1,400 to Rs 1,800.", "range between Rs 1,400 and Rs 1,800", { round: 1, attribute: "monthly_price", unit: "INR", period: "month" }),
    C("C18", "D4S1", "P18", "Battery pack replacement costs Rs 28,000.", "Battery pack replacement costs Rs 28,000", { round: 1, entity: "V1 scooter", attribute: "battery_cost", value: 28000, unit: "INR" }),
    C("C19", "D1S1", "P19", "Analysts expect 18% annual growth through 2030.", "Analysts expect 18% annual growth through 2030", { round: 1, attribute: "growth", value: 18, unit: "percent", period: "annual" }),
    C("C20", "D3S1", "P20", "Permits are issued within 30 days of application.", "Permits are issued within 30 days of application", { round: 1, attribute: "permit_time", value: 30, unit: "days" }),
  ];
  return { sources, passages, claims };
}

function buildOrigins(runId: string): Origin[] {
  const O = (id: string, label: string, m: Parameters<typeof mkOrigin>[3], members: string[]) =>
    mkOrigin(runId, id, label, m, members);
  return [
    O("O1", "RideNow press release", "near_duplicate", ["S1", "S2", "S3", "S4", "S5"]),
    O("O2", "ridenow.example.invalid", "domain", ["S6"]),
    O("O3", "forum-digest.example.invalid", "none", ["S7"]),
    O("O4", "transport.gov.example.invalid", "domain", ["S8"]),
    O("O5", "marketlens.example.invalid", "domain", ["S11"]),
    O("O6", "economy-daily.example.invalid", "domain", ["S12"]),
    O("O7", "commute-survey.example.invalid", "domain", ["S13"]),
    O("O8", "voltride.example.invalid", "domain", ["S14"]),
    O("O14", "voltride-service.example.invalid", "domain", ["S20"]),
    O("O9", "fleetops.example.invalid", "domain", ["S17"]),
    O("O10", "energy-weekly.example.invalid", "domain", ["S18"]),
    O("O11", "city-desk.example.invalid", "domain", ["S15"]),
    O("O12", "riderpoll.example.invalid", "domain", ["S16"]),
    O("O13", "consumer-report.example.invalid", "domain", ["S19"]),
  ];
}

function conflicts(runId: string, explained: boolean): Conflict[] {
  return [
    { id: "X1", run_id: runId, slot_id: "D2S1", claim_a: "C1", claim_b: "C6", delta_pct: 20, kind: "genuine", status: "open", explanation: null },
    {
      id: "X2", run_id: runId, slot_id: "D4S2", claim_a: "C11", claim_b: "C12", delta_pct: 96.7,
      kind: "unit_error", status: explained ? "explained" : "open",
      explanation: explained ? "C11 is per day and C12 is per month: Rs 40 per day is about Rs 1,200 per month. Same figure once units are normalised." : null,
    },
    {
      id: "X3", run_id: runId, slot_id: "D1S1", claim_a: "C9", claim_b: "C10", delta_pct: 191.7,
      kind: "definition", status: explained ? "explained" : "open",
      explanation: explained ? "C10 counts all shared micro-mobility (scooters, bikes, e-cycles); C9 counts e-scooter rentals only." : null,
    },
  ];
}

function rollups(cells: CoverageCell[]): DimensionRollup[] {
  const rank = { RED: 0, AMBER: 1, GREEN: 2 } as const;
  return DIMS.map((d) => {
    const mine = cells.filter((c) => d.slots.some((s) => s.id === c.slot_id));
    const crit = mine.filter((c) => d.slots.find((s) => s.id === c.slot_id)?.critical);
    const pool = crit.length ? crit : mine;
    const worst = pool.reduce((w, c) => (rank[c.state] < rank[w] ? c.state : w), "GREEN" as CoverageCell["state"]);
    const reason =
      worst === "GREEN" ? "All critical slots in this dimension are green." : `${pool.filter((c) => c.state !== "GREEN").length} slot(s) below green.`;
    return { dimension_id: d.id, state: worst, reason };
  });
}

function cellsRound0(r: string): CoverageCell[] {
  return [
    mkCell(r, 0, "D1S1", "AMBER", 2, 2, 1, "2 sources, 2 origins, but the market-size definitions differ and are not yet explained; S9 was unavailable."),
    mkCell(r, 0, "D1S2", "RED", 1, 1, 0, "1 source, 1 origin; S10 returned no content."),
    mkCell(r, 0, "D2S1", "AMBER", 3, 6, 1, "7 sources, 3 origins: 5 pages repeat one press release; 1 open price conflict (Rs 1,499 vs Rs 1,799)."),
    mkCell(r, 0, "D2S2", "RED", 1, 1, 0, "1 source, 1 origin; 2 independent origins needed."),
    mkCell(r, 0, "D3S1", "GREEN", 1, 1, 0, "1 regulator source; this slot accepts a primary source."),
    mkCell(r, 0, "D3S2", "RED", 0, 0, 0, "No sources found for this slot."),
    mkCell(r, 0, "D4S1", "AMBER", 1, 1, 0, "1 source, 1 origin (company page); 2 needed."),
    mkCell(r, 0, "D4S2", "AMBER", 2, 2, 1, "2 origins, but a per-day vs per-month conflict is not yet explained."),
    mkCell(r, 0, "D5S1", "AMBER", 1, 1, 0, "1 source, 1 origin; 2 needed."),
    mkCell(r, 0, "D5S2", "RED", 0, 0, 0, "No sources found for this slot."),
  ];
}

function cellsRound1(r: string, variant: Variant): CoverageCell[] {
  const cells = [
    mkCell(r, 1, "D1S1", "GREEN", 2, 3, 0, "2 origins; the definition conflict is explained (scooters only vs all micro-mobility)."),
    mkCell(r, 1, "D1S2", "RED", 1, 1, 0, "1 source, 1 origin; S10 returned no content."),
    mkCell(r, 1, "D2S1", "AMBER", 4, 7, 1, "8 sources, 4 origins: 5 pages repeat one press release; 1 genuine price conflict remains open."),
    mkCell(r, 1, "D2S2", "RED", 1, 1, 0, "1 source, 1 origin; 2 independent origins needed."),
    mkCell(r, 1, "D3S1", "AMBER", 1, 2, 0, "Challenge H2 found the permit rules may have changed; the regulator page is the only origin."),
    mkCell(r, 1, "D3S2", "RED", 0, 0, 0, "No sources found for this slot."),
    mkCell(r, 1, "D4S1", "GREEN", 2, 2, 0, "2 origins: the manufacturer spec page and a service price list."),
    mkCell(r, 1, "D4S2", "GREEN", 2, 2, 0, "2 origins; the per-day vs per-month conflict is explained."),
    mkCell(r, 1, "D5S1", "AMBER", 1, 1, 0, "1 source, 1 origin; 2 needed."),
    mkCell(r, 1, "D5S2", "RED", 0, 0, 0, "No sources found for this slot."),
  ];
  if (variant === "insufficient") {
    return cells.map((c) =>
      c.slot_id === "D4S2"
        ? { ...c, state: "RED" as const, independent_origins: 1, reason: "Only 1 origin remains after the per-month source was excluded; 2 needed." }
        : c.slot_id === "D1S1"
          ? { ...c, state: "AMBER" as const, reason: "2 origins, but vendor research is the only independent estimate." }
          : c,
    );
  }
  return cells;
}

const CHALLENGE_TEXT: Omit<Challenge, "run_id">[] = [
  {
    id: "H1", round: 1, attack: "The Rs 1,499 monthly price is one press release repeated by five pages, not five confirmations.",
    target_slot: "D2S1", target_claim: "C1", required_evidence: "A price from a source that does not cite the RideNow press release.",
    would_change_if: "An independent listing shows most operators charge above Rs 1,800 per month.", followup_task_ids: ["T13"], outcome: null,
  },
  {
    id: "H2", round: 1, attack: "The regulator's permit rules may have been superseded by a newer draft.",
    target_slot: "D3S1", target_claim: "C8", required_evidence: "A second official source dated after the licence rule.",
    would_change_if: "A newer notification changes the licence category or fee for e-scooter subscriptions.", followup_task_ids: ["T14"], outcome: null,
  },
  {
    id: "H3", round: 1, attack: "The USD 120 million market size may come from a vendor with an interest in a high number.",
    target_slot: "D1S1", target_claim: "C9", required_evidence: "A market estimate from a neutral analyst.",
    would_change_if: "A neutral estimate is less than half of USD 120 million.", followup_task_ids: [], outcome: null,
  },
];

function buildReport(runId: string, variant: Variant): ReportView {
  const insufficient = variant === "insufficient";
  const md = [
    `# ${CANONICAL_QUESTION}`,
    "",
    "## Verdict",
    insufficient
      ? "**Insufficient evidence.** Running costs cannot be established from independent sources. {{certainty:single-origin}}"
      : "**Sufficient with caveats.** Demand and regulation look workable, but competitor pricing contains one unresolved conflict. {{certainty:contested}}",
    "",
    "## Findings",
    "### Market size",
    "- The Bengaluru e-scooter rental market was worth about USD 120 million in 2025 [C9]. {{certainty:supported}}",
    "- Broader shared micro-mobility revenue is larger because it includes bikes and e-cycles [C10]. {{certainty:supported}}",
    "### Pricing",
    "- Five pages report a Rs 1,499 monthly plan, but they repeat one press release [C1][C2][C3][C4][C5]. {{certainty:single-origin}}",
    "- The operator's own page lists Rs 1,799 per month including insurance [C6]. {{certainty:contested}}",
    "- An independent report lists prices from Rs 1,400 to Rs 1,800 [C17]. {{certainty:supported}}",
    "### Regulation",
    "- Operators must hold an aggregator licence [C8]. {{certainty:supported}}",
    "- Permits are issued within 30 days, per one regulator page [C20]. {{certainty:single-origin}}",
    "### Unit economics",
    "- A V1 scooter costs Rs 92,000 and a battery replacement Rs 28,000 [C13][C18]. {{certainty:single-origin}}",
    "- Charging costs Rs 40 per day, about Rs 1,200 per month, once units are normalised [C11][C12]. {{certainty:supported}}",
    "- Break-even is likely within two years at moderate utilisation. {{certainty:assumed}}",
    "",
    "## Evidence summary",
    "| Dimension | State | Note |",
    "|---|---|---|",
    "| Pricing | AMBER | One genuine conflict open |",
    "| Regulation | AMBER | Single regulator origin |",
    "| Unit economics | " + (insufficient ? "RED" : "GREEN") + " | Units normalised |",
  ].join("\n");
  const cited = md.match(/\[C\d+\]/g)?.map((s) => s.slice(1, -1)) ?? [];
  const data = buildData(runId);
  const citations: CitationRef[] = [...new Set(cited)].flatMap((cid) => {
    const c = data.claims.find((x) => x.id === cid);
    const p = c ? data.passages.find((x) => x.id === c.passage_id) : undefined;
    const s = p ? data.sources.find((x) => x.id === p.source_id) : undefined;
    return c && p && s ? [{ claim_id: c.id, passage_id: p.id, source_id: s.id, url: s.url }] : [];
  });
  return {
    run_id: runId,
    version: 1,
    markdown: md,
    certainty_state: insufficient ? "INSUFFICIENT" : "SUFFICIENT_WITH_CAVEATS",
    dropped_sentences: ["Scooter subscriptions will certainly triple demand by 2028."],
    citations,
  };
}

/** Builds the draft event list for a scenario. */
function buildEvents(runId: string, variant: Variant): { drafts: DraftEvent[]; data: Data; hasReport: boolean } {
  const data = buildData(runId);
  const origins = buildOrigins(runId);
  const plan = buildPlan();
  const d: DraftEvent[] = [];
  const push = (e: DraftEvent) => d.push(e);
  const phase = (p: string, reason: string, round = 0) => push(mkEvent("phase.entered", { phase: p, reason }, { round }));
  const round1Ids = new Set(["S19", "S20"]);
  const round1Claims = new Set(["C17", "C18", "C19", "C20"]);
  const mode = variant === "replay" ? "REPLAY" : "LIVE";

  push(mkEvent("run.started", { question: CANONICAL_QUESTION, mode, budget: BUDGET }));
  phase("PLAN", "Breaking the question into 5 dimensions and 10 evidence slots");
  push(mkEvent("plan.created", { plan }, { stepMs: 5200, tokens: 2400, costUsd: 0.021 }));
  phase("DISCOVER", "Searching for each evidence slot");
  for (const dim of DIMS)
    for (const s of dim.slots)
      push(mkEvent("task.started", { task_id: s.task, slot_id: s.id, query_text: s.query, kind: "initial", reason: `Initial search for ${s.name}` }, { stepMs: 900 }));
  for (const s of data.sources.filter((x) => !round1Ids.has(x.id)))
    push(mkEvent("source.found", { source: s }, { stepMs: 300 }));
  phase("ACQUIRE", "Fetching found pages");
  for (const s of data.sources.filter((x) => !round1Ids.has(x.id))) {
    if (s.status === "SOURCE_UNAVAILABLE" || s.status === "SOURCE_EMPTY")
      push(mkEvent("source.failed", { source_id: s.id, failure: s.status, reason: s.fail_reason ?? "" }, { stepMs: 700 }));
    else push(mkEvent("source.fetched", { source_id: s.id, chars: 4200, content_hash: `h-${s.id}` }, { stepMs: 800 }));
  }
  phase("EXTRACT", "Splitting fetched pages into stored passages");
  const passageCount = (sid: string) => data.passages.filter((p) => p.source_id === sid).length;
  for (const s of data.sources.filter((x) => !round1Ids.has(x.id) && x.status === "found"))
    push(mkEvent("passages.created", { source_id: s.id, count: Math.max(1, passageCount(s.id)) }, { stepMs: 120 }));
  phase("CLAIMS", "Extracting quote-checked claims");
  const r0 = data.claims.filter((c) => !round1Claims.has(c.id));
  r0.forEach((c, i) => {
    push(mkEvent("claim.created", { claim: c }, { stepMs: 2100, tokens: 900, costUsd: 0.006 }));
    if (i === 5)
      push(mkEvent("claim.rejected", { slot_id: "D2S1", passage_id: "P6", quote: "Rs 999 per month introductory offer", failure: "CLAIM_REJECTED", reason: "Quote not found in passage P6" }));
    if (i === 8)
      push(mkEvent("claim.rejected", { slot_id: "D1S1", passage_id: "P9", quote: "the market will triple by 2028", failure: "CLAIM_REJECTED", reason: "Quote not found in passage P9" }));
  });
  if (variant === "failure") {
    push(mkEvent("run.failed", { failure: "BLOCKED", message: "The LLM provider rejected further calls (BLOCKED); stored data is still available." }));
    return { drafts: d, data, hasReport: false };
  }
  phase("VERIFY", "Checking that each quote supports its claim");
  const verdicts: Record<string, [string, string]> = {
    C5: ["partial", "Repeats the press release; not an independent confirmation."],
    C7: ["partial", "Loose figure from forum posters."],
    C10: ["partial", "Covers a broader market than e-scooters."],
  };
  for (const c of r0) {
    const v = verdicts[c.id];
    push(mkEvent("claim.verified", { claim_id: c.id, verdict: v?.[0] ?? "supports", rationale: v?.[1] ?? "Quote states the claim." }, { stepMs: 1500, tokens: 500, costUsd: 0.003 }));
  }
  phase("ANALYZE", "Grouping sources by independent origin and checking conflicts");
  for (const o of origins.filter((x) => x.id !== "O13" && x.id !== "O14")) {
    const members = (o.member_source_ids ?? []).filter((m) => !round1Ids.has(m));
    push(mkEvent("origin.updated", { origin: { ...o, member_source_ids: members } }));
  }
  const cs0 = conflicts(runId, false);
  for (const c of cs0) push(mkEvent("conflict.detected", { conflict: c }, { stepMs: 1800, tokens: 700, costUsd: 0.004 }));
  const c0 = cellsRound0(runId);
  push(mkEvent("coverage.updated", { round: 0, cells: c0, rollups: rollups(c0) }));
  phase("CHALLENGE", "Attacking the strongest conclusions");
  const challenges = CHALLENGE_TEXT.map((c) => ({ ...c, run_id: runId }));
  for (const c of challenges) push(mkEvent("challenge.created", { challenge: c }, { round: 1, stepMs: 2500, tokens: 800, costUsd: 0.005 }));

  if (variant === "budget-wrapup") {
    push(mkEvent("budget.warning", { limit: "max_cost_usd", used: 1.62, max: 2 }, { round: 1 }));
    push(mkEvent("budget.warning", { limit: "max_llm_calls", used: 80, max: 80 }, { round: 1 }));
    phase("STOP_POLICY", "Budget limit reached; wrapping up with the evidence in hand", 1);
    push(mkEvent("stop.decided", { decision: stop("budget", 0, c0, 3) satisfies StopDecision }, { round: 1 }));
    phase("SYNTHESIZE", "Writing the report from stored evidence", 1);
    push(mkEvent("report.draft", { version: 1 }, { round: 1, stepMs: 6000, tokens: 3000, costUsd: 0.03 }));
    push(mkEvent("report.verified", { version: 1, dropped_count: 1, certainty_state: "INSUFFICIENT" }, { round: 1 }));
    push(mkEvent("run.completed", { stop_state: "INSUFFICIENT", termination_reason: "budget" }, { round: 1 }));
    return { drafts: d, data, hasReport: true };
  }

  push(mkEvent("round.started", { round: 1, reason: "Re-searching: slot Competitor subscription pricing has 1 open conflict; challenges H1 to H3 need evidence", task_ids: ["T11", "T12", "T13", "T14"] }, { round: 1 }));
  phase("DISCOVER", "Follow-up searches for gaps and challenges", 1);
  push(mkEvent("task.started", { task_id: "T11", slot_id: "D2S1", query_text: "independent electric scooter rental price survey Bengaluru", kind: "gap", reason: "Gap: pricing has only one press-release origin" }, { round: 1, stepMs: 900 }));
  push(mkEvent("task.started", { task_id: "T12", slot_id: "D4S1", query_text: "V1 scooter battery replacement price list", kind: "gap", reason: "Gap: vehicle cost has 1 origin" }, { round: 1, stepMs: 900 }));
  push(mkEvent("task.started", { task_id: "T13", slot_id: "D2S1", query_text: "electric scooter rental prices above Rs 1,800 Bengaluru", kind: "challenge", reason: "Challenge H1 follow-up" }, { round: 1, stepMs: 900 }));
  push(mkEvent("task.started", { task_id: "T14", slot_id: "D3S1", query_text: "Karnataka aggregator rules amendment 2026", kind: "challenge", reason: "Challenge H2 follow-up" }, { round: 1, stepMs: 900 }));
  for (const s of data.sources.filter((x) => round1Ids.has(x.id))) push(mkEvent("source.found", { source: s }, { round: 1, stepMs: 300 }));
  phase("ACQUIRE", "Fetching new pages", 1);
  for (const s of data.sources.filter((x) => round1Ids.has(x.id))) push(mkEvent("source.fetched", { source_id: s.id, chars: 3100, content_hash: `h-${s.id}` }, { round: 1, stepMs: 800 }));
  phase("EXTRACT", "Splitting new pages into passages", 1);
  for (const [sid, count] of [["S19", 1], ["S20", 1], ["S11", 2], ["S8", 2]] as const)
    push(mkEvent("passages.created", { source_id: sid, count }, { round: 1, stepMs: 120 }));
  phase("CLAIMS", "Extracting claims from new passages", 1);
  const r1 = data.claims.filter((c) => round1Claims.has(c.id));
  for (const c of r1) push(mkEvent("claim.created", { claim: c }, { round: 1, stepMs: 2100, tokens: 900, costUsd: 0.006 }));
  phase("VERIFY", "Checking new claims", 1);
  for (const c of r1) push(mkEvent("claim.verified", { claim_id: c.id, verdict: "supports", rationale: "Quote states the claim." }, { round: 1, stepMs: 1500, tokens: 500, costUsd: 0.003 }));
  phase("ANALYZE", "Re-grouping origins and re-checking conflicts", 1);
  push(mkEvent("origin.updated", { origin: origins.find((o) => o.id === "O13") ?? origins[0] }, { round: 1 }));
  push(mkEvent("origin.updated", { origin: origins.find((o) => o.id === "O14") ?? origins[0] }, { round: 1 }));
  for (const c of conflicts(runId, true)) push(mkEvent("conflict.detected", { conflict: c }, { round: 1, stepMs: 1800, tokens: 700, costUsd: 0.004 }));
  const c1 = cellsRound1(runId, variant);
  push(mkEvent("coverage.updated", { round: 1, cells: c1, rollups: rollups(c1) }, { round: 1 }));
  phase("CHALLENGE", "Scoring challenge outcomes", 1);
  const outcomes: Record<string, string> = { H1: "strengthened", H2: "weakened", H3: "unresolved" };
  for (const c of challenges) push(mkEvent("challenge.outcome", { challenge_id: c.id, outcome: outcomes[c.id] }, { round: 1, stepMs: 1200, tokens: 400, costUsd: 0.003 }));
  phase("STOP_POLICY", "Applying the stop policy to stored coverage, conflicts and challenges", 1);
  const insufficient = variant === "insufficient";
  push(mkEvent("stop.decided", { decision: insufficient ? stop("no_marginal_gain", 1, c1, 0) : stop("max_rounds", 1, c1, 1) }, { round: 1 }));
  phase("SYNTHESIZE", "Writing the report from stored evidence", 1);
  push(mkEvent("report.draft", { version: 1 }, { round: 1, stepMs: 6000, tokens: 3000, costUsd: 0.03 }));
  push(mkEvent("report.verified", { version: 1, dropped_count: 1, certainty_state: insufficient ? "INSUFFICIENT" : "SUFFICIENT_WITH_CAVEATS" }, { round: 1 }));
  push(mkEvent("run.completed", { stop_state: insufficient ? "INSUFFICIENT" : "SUFFICIENT_WITH_CAVEATS", termination_reason: insufficient ? "no_marginal_gain" : "max_rounds" }, { round: 1 }));
  return { drafts: d, data, hasReport: true };
}

function stop(reason: StopDecision["termination_reason"], challengeRounds: number, cells: CoverageCell[], openConflicts: number): StopDecision {
  const crit = ["D1S1", "D2S1", "D3S1", "D4S1", "D4S2"];
  const count = (st: string) => cells.filter((c) => crit.includes(c.slot_id) && c.state === st).length;
  const insufficient = reason === "no_marginal_gain" || reason === "budget";
  return {
    state: insufficient ? "INSUFFICIENT" : "SUFFICIENT_WITH_CAVEATS",
    termination_reason: reason,
    critical_slots: { green: count("GREEN"), amber: count("AMBER"), red: count("RED") },
    open_conflicts: openConflicts,
    challenge_rounds_completed: challengeRounds,
    caveats: insufficient
      ? ["Critical slots are not all green; treat the report as a partial view."]
      : ["Competitor pricing has one unresolved conflict (Rs 1,499 vs Rs 1,799).", "Permit rules rest on a single regulator source."],
  };
}

export function buildScenario(id: ScenarioId, instance = 1): Scenario {
  const runId = `mock-${id}-${instance}`;
  const variant: Variant = id;
  const { drafts, data, hasReport } = buildEvents(runId, variant);
  const events = sequence(runId, drafts);
  const reportEvent = events.find((e) => e.type === "report.verified");
  return {
    id,
    label: SCENARIOS.find((s) => s.id === id)?.label ?? id,
    runId,
    question: CANONICAL_QUESTION,
    events,
    passages: Object.fromEntries(data.passages.map((p) => [p.id, p])),
    report: hasReport ? buildReport(runId, variant) : null,
    reportAtEvent: reportEvent?.id ?? null,
  };
}
