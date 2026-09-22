#!/usr/bin/env node
// Checks the /data files for broken links between records and invalid values.
// Run from the repository root:  node scripts/validate-data.mjs
import { readFileSync } from "node:fs";

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const events = load("events.json");
const people = load("people.json");
const companies = load("companies.json");
const stack = load("stack.json");
const sources = load("sources.json");
const site = load("site.json");
const attendance = load("attendance.json");

const ENUMS = {
  type: ["official", "side-event", "forum", "meetup", "networking", "closed-door", "exhibition", "other"],
  relevance: ["core", "strong", "adjacent", "wildcard"],
  access: ["open", "registration", "approval", "invite", "waitlist", "sold-out", "badge", "unknown"],
  status: ["verified", "listed", "provisional", "conflict"],
  audiences: ["traders", "market-makers", "founders", "builders", "institutions", "investors", "sports", "media", "regulators", "general"],
  ecosystems: ["kalshi", "polymarket", "hyperliquid", "independent"],
  personRole: ["speaker", "moderator", "host", "listed"],
  companyRole: ["host", "sponsor", "exhibitor", "partner", "participant", "speaker-affiliation", "subject"],
  group: ["platforms", "trading", "infrastructure", "institutional", "builders", "sports", "policy", "media", "investors", "speakers", "organisers"],
};

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const ids = (list, name) => {
  const set = new Set();
  for (const x of list) {
    if (!x.id) err(`${name}: record without id: ${JSON.stringify(x).slice(0, 80)}`);
    else if (!/^[a-z0-9][a-z0-9-]*$/.test(x.id)) err(`${name}: id "${x.id}" must be lowercase letters, numbers and hyphens`);
    if (set.has(x.id)) err(`${name}: duplicate id "${x.id}"`);
    set.add(x.id);
  }
  return set;
};
const E = ids(events, "events");
const P = ids(people, "people");
const C = ids(companies, "companies");
const L = ids(stack, "stack");
const S = ids(sources, "sources");
const days = new Set(site.days.map((d) => d.date));

const checkSources = (where, list) => {
  for (const s of list || []) if (!S.has(s)) err(`${where}: unknown source "${s}"`);
};
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

for (const e of events) {
  const w = `event "${e.id}"`;
  for (const f of ["title", "date", "venue", "type", "relevance", "access", "summary", "why", "status"])
    if (!e[f]) err(`${w}: missing "${f}"`);
  if (!days.has(e.date)) err(`${w}: date ${e.date} is not one of the days in site.json`);
  if (e.end_date && !days.has(e.end_date)) err(`${w}: end_date ${e.end_date} is not a listed day`);
  if (e.start && !timeRe.test(e.start)) err(`${w}: start "${e.start}" must be HH:MM or null`);
  if (e.end && !timeRe.test(e.end)) err(`${w}: end "${e.end}" must be HH:MM or null`);
  if (e.start && e.end && e.end <= e.start) err(`${w}: end is not after start`);
  if (!e.start && !e.time_note) warn(`${w}: no start time and no time_note to explain why`);
  for (const k of ["type", "relevance", "access", "status"])
    if (e[k] && !ENUMS[k].includes(e[k])) err(`${w}: ${k} "${e[k]}" is not one of ${ENUMS[k].join(", ")}`);
  for (const a of e.audiences || []) if (!ENUMS.audiences.includes(a)) err(`${w}: unknown audience "${a}"`);
  for (const a of e.ecosystems || []) if (!ENUMS.ecosystems.includes(a)) err(`${w}: unknown ecosystem "${a}"`);
  for (const l of e.stack_layers || []) if (!L.has(l)) err(`${w}: unknown stack layer "${l}"`);
  for (const p of e.people || []) {
    if (!P.has(p.id)) err(`${w}: unknown person "${p.id}" (add them to people.json)`);
    if (!ENUMS.personRole.includes(p.role)) err(`${w}: person role "${p.role}" invalid`);
  }
  for (const c of e.companies || []) {
    if (!C.has(c.id)) err(`${w}: unknown company "${c.id}" (add it to companies.json)`);
    if (!ENUMS.companyRole.includes(c.role)) err(`${w}: company role "${c.role}" invalid`);
  }
  checkSources(w, e.sources);
  if (!e.sources?.length && e.status !== "provisional") warn(`${w}: no sources but status is "${e.status}"`);
}

for (const p of people) {
  const w = `person "${p.id}"`;
  if (!p.name) err(`${w}: missing name`);
  if (p.org && !C.has(p.org)) err(`${w}: unknown org "${p.org}"`);
  if (!ENUMS.group.includes(p.group)) err(`${w}: group "${p.group}" invalid`);
  checkSources(w, p.sources);
  if (!events.some((e) => (e.people || []).some((x) => x.id === p.id))) warn(`${w}: not linked to any event`);
}

for (const c of companies) {
  const w = `company "${c.id}"`;
  if (!c.name || !c.description) err(`${w}: missing name or description`);
  if (!ENUMS.group.includes(c.category)) err(`${w}: category "${c.category}" invalid`);
  for (const l of c.stack_layers || []) if (!L.has(l)) err(`${w}: unknown stack layer "${l}"`);
  for (const a of c.ecosystems || []) if (!ENUMS.ecosystems.includes(a)) err(`${w}: unknown ecosystem "${a}"`);
  checkSources(w, c.sources);
}

for (const l of stack) {
  for (const c of l.companies || []) if (!C.has(c)) err(`stack "${l.id}": unknown company "${c}"`);
  checkSources(`stack "${l.id}"`, l.sources);
}

for (const s of sources) {
  if (!s.url || !/^https:\/\//.test(s.url)) err(`source "${s.id}": url must start with https://`);
}

for (const q of site.open_questions || []) {
  for (const e of q.events || []) if (!E.has(e)) err(`open question "${q.item}": unknown event "${e}"`);
  checkSources(`open question "${q.item}"`, q.sources);
}

const used = new Set([
  ...events.flatMap((e) => e.sources || []),
  ...people.flatMap((p) => p.sources || []),
  ...companies.flatMap((c) => c.sources || []),
  ...stack.flatMap((l) => l.sources || []),
  ...(site.open_questions || []).flatMap((q) => q.sources || []),
  ...(site.practical || []).flatMap((q) => q.sources || []),
  ...attendance.map((a) => a.source_id).filter(Boolean),
]);
for (const s of sources) if (!used.has(s.id)) warn(`source "${s.id}" is not referenced by any record`);

// ---- Who's Going: every public record needs its own evidence
const AST = ["official_speaker", "publicly_attending", "company_attending", "exhibitor", "sponsor", "side_event_host", "side_event_speaker", "meeting_signal", "launch_signal"];
const ROLE = ["founder", "trader", "market-maker", "investor", "builder", "institutional", "infrastructure", "sports", "media", "regulation", "business", "other"];
const CTYPE = ["venue", "trading-firm", "market-maker", "infrastructure", "data", "oracle", "exchange", "institutional", "sports", "media", "investor", "compliance", "other"];
const A = ids(attendance, "attendance");
for (const a of attendance) {
  const w = `attendance "${a.id}"`;
  if (!AST.includes(a.attendance_status)) err(`${w}: attendance_status "${a.attendance_status}" must be one of ${AST.join(", ")}`);
  if (!["confirmed", "pending"].includes(a.confidence)) err(`${w}: confidence must be confirmed or pending`);
  if (a.confidence === "pending" && a.public) err(`${w}: pending records must have "public": false`);
  if (a.person_id && !P.has(a.person_id)) err(`${w}: unknown person "${a.person_id}"`);
  if (a.company_id && !C.has(a.company_id)) err(`${w}: unknown company "${a.company_id}"`);
  if (!a.person_id && !a.company_id && !a.name) err(`${w}: needs person_id, company_id or name`);
  if (a.entity_type === "person" && a.public && !a.person_id) err(`${w}: public person records need a person_id (add them to people.json)`);
  for (const e of a.event_ids || []) if (!E.has(e)) err(`${w}: unknown event "${e}"`);
  for (const d of a.dates || []) if (!days.has(d)) err(`${w}: date ${d} is not a listed day`);
  if (a.public) {
    if (!a.source_url || !/^https:\/\//.test(a.source_url)) err(`${w}: public records need a source_url (evidence rule)`);
    if (a.source_id && !S.has(a.source_id)) err(`${w}: unknown source "${a.source_id}"`);
    if (!a.evidence_summary) err(`${w}: missing evidence_summary`);
    if (!a.last_verified) err(`${w}: missing last_verified`);
  }
}
for (const p of people) for (const r of p.roles || []) if (!ROLE.includes(r)) err(`person "${p.id}": role "${r}" must be one of ${ROLE.join(", ")}`);
for (const c of companies) for (const t of c.types || []) if (!CTYPE.includes(t)) err(`company "${c.id}": type "${t}" must be one of ${CTYPE.join(", ")}`);

for (const w of warnings) console.log("warning:", w);
for (const e of errors) console.error("ERROR:", e);
console.log(
  `\n${events.length} events, ${people.length} people, ${companies.length} companies, ${stack.length} stack layers, ${sources.length} sources, ${attendance.length} attendance records (${attendance.filter((a) => a.public).length} public).`
);
if (errors.length) {
  console.error(`${errors.length} error(s) found.`);
  process.exit(1);
}
console.log(warnings.length ? `OK with ${warnings.length} warning(s).` : "All checks passed.");
