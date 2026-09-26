// Prediction Markets at TOKEN2049 — single-page directory.
// Reads /data/*.json, renders views by hash route (#/events/<id> etc.).
import {
  esc, initials, toMin, fmtMin, fmtDuration, eventDays, isTimed, isAllDay, timeLabel, sortKey,
  overlaps, clusters, sgtNow, icsBlocker, buildICS, download, saved, norm, matches,
  lmsr,
} from "./util.js?v=dev";
import { installFeatures } from "./features.js?v=dev";

let HOOKS = {}; // filled by features.js at start-up

// ---------------------------------------------------------------- labels
const REL = {
  core: { label: "Prediction markets", desc: "Directly focused on prediction markets." },
  strong: { label: "Strongly relevant", desc: "Not exclusively prediction markets, but highly relevant." },
  adjacent: { label: "Adjacent", desc: "Useful market-structure, trading or infrastructure context." },
  wildcard: { label: "Wildcard", desc: "Strange, experimental or potentially interesting." },
};
const TYPE = {
  official: "TOKEN2049 session", "side-event": "Side event", forum: "Forum / conference", meetup: "Meetup",
  networking: "Party / networking", "closed-door": "Closed-door / institutional", exhibition: "Exhibition / booth", other: "Other",
};
/** Top-level kind: every listing is a conference session, an exhibitor booth or a side event. */
const KIND = { session: "Conference session", booth: "Exhibitor booth", side: "Side event" };
const KIND_SHORT = { session: "Session", booth: "Booth", side: "Side event" };
const KIND_ICON = { session: "🎤", booth: "🏢", side: "🥂" };
const kindOf = (e) => (e.type === "official" ? "session" : e.type === "exhibition" ? "booth" : "side");
/** Side-event format (Forum, Party…), or null when the kind already says it all. */
const formatOf = (e) => (kindOf(e) === "side" && e.type !== "side-event" ? TYPE[e.type] : null);
const ACCESS = {
  open: "Open", registration: "Registration required", approval: "Approval required", invite: "Invite only",
  waitlist: "Waitlist", "sold-out": "Sold out", badge: "TOKEN2049 pass", unknown: "Status unknown",
};
const STATUS = {
  verified: { label: "Verified", desc: "Confirmed on the official TOKEN2049 programme, partner list or site." },
  listed: { label: "Organiser-listed", desc: "Listed on the organiser’s own page or a side-event directory. Not independently confirmed." },
  provisional: { label: "Provisional", desc: "Surfaced in research, but no first-party source has been found." },
  conflict: { label: "Timing conflict", desc: "Sources disagree on timing. Confirm with the organiser before travelling." },
};
const AUD = {
  traders: "Traders", "market-makers": "Market makers", founders: "Founders", builders: "Builders",
  institutions: "Institutions", investors: "Investors", sports: "Sports", media: "Media",
  regulators: "Regulation / compliance", general: "General PM audience",
};
const ECO = { kalshi: "Kalshi", polymarket: "Polymarket", hyperliquid: "Hyperliquid / HIP-4", independent: "Independent / multi-platform" };
const TOPIC = {
  infrastructure: "Infrastructure", defi: "DeFi", institutional: "Institutional", risk: "Risk", liquidity: "Liquidity",
  data: "Market data", tokenisation: "Tokenisation", distribution: "Distribution", regulation: "Regulation",
  "market-making": "Market making", trading: "Trading", "ai-agents": "AI agents", clearing: "Clearing & settlement",
  category: "Category framing", sports: "Sports", consumer: "Consumer",
};
const GROUP = {
  platforms: "Exchanges & platforms", trading: "Traders & market makers", infrastructure: "Infrastructure",
  institutional: "Institutional / TradFi", builders: "Builders", sports: "Sports", policy: "Regulation & policy",
  media: "Media", investors: "Investors", speakers: "Other speakers", organisers: "Organisers",
};
const CROLE = { host: "Host", sponsor: "Sponsor", exhibitor: "Exhibitor", partner: "Listed partner", participant: "Listed participant", "speaker-affiliation": "Speaker’s organisation", subject: "Featured" };
const PROLE = { speaker: "Speaker", moderator: "Moderator", host: "Host", listed: "Listed" };

const STAR = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`;
const SEARCH_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>`;

// ---------------------------------------------------------------- data
const D = {};
const view = () => document.getElementById("view");

async function loadData() {
  const names = ["events", "people", "companies", "stack", "sources", "site", "attendance", "markets"];
  const [events, people, companies, stack, sources, site, attendance, markets] = await Promise.all(
    names.map((n) => fetch(`data/${n}.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${n}.json (${r.status})`);
      return r.json();
    }))
  );
  D.site = site;
  D.markets = markets;
  D.days = site.days.map((d) => ({ ...d, slug: d.label.slice(0, 3).toLowerCase() }));
  D.dayBy = new Map(D.days.map((d) => [d.date, d]));
  D.events = events.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  D.ev = new Map(D.events.map((e) => [e.id, e]));
  D.people = new Map(people.map((p) => [p.id, p]));
  D.companies = new Map(companies.map((c) => [c.id, c]));
  D.stack = stack;
  D.layer = new Map(stack.map((l) => [l.id, l]));
  D.sources = new Map(sources.map((s) => [s.id, s]));

  D.personEvents = new Map(people.map((p) => [p.id, []]));
  D.companyEvents = new Map(companies.map((c) => [c.id, []]));
  D.companyPeople = new Map(companies.map((c) => [c.id, []]));
  for (const p of people) if (p.org && D.companyPeople.has(p.org)) D.companyPeople.get(p.org).push(p);
  for (const e of D.events) {
    for (const x of e.people) D.personEvents.get(x.id)?.push({ event: e, role: x.role });
    for (const x of e.companies) D.companyEvents.get(x.id)?.push({ event: e, role: x.role });
    for (const x of e.people) {
      const org = D.people.get(x.id)?.org;
      if (org && !e.companies.some((c) => c.id === org)) {
        const list = D.companyEvents.get(org);
        if (list && !list.some((y) => y.event.id === e.id)) list.push({ event: e, role: "via", via: x.id, viaRole: x.role });
      }
    }
  }
  for (const e of D.events) {
    e._hay = norm([
      e.title, e.summary, e.why, e.venue, e.time_note, e.access_note, TYPE[e.type], KIND[kindOf(e)], ACCESS[e.access], REL[e.relevance].label,
      STATUS[e.status].label, ...eventDays(e).map((d) => `${D.dayBy.get(d).long} ${D.dayBy.get(d).label}`),
      ...e.audiences.map((a) => AUD[a]), ...e.ecosystems.map((a) => ECO[a]), ...e.topics.map((t) => TOPIC[t] || t),
      ...e.stack_layers.map((l) => D.layer.get(l)?.name), ...e.also_listed,
      ...e.people.map((p) => { const x = D.people.get(p.id); return `${x?.name} ${x?.org_label || ""} ${D.companies.get(x?.org)?.name || ""}`; }),
      ...e.companies.map((c) => D.companies.get(c.id)?.name), e.official ? "official token2049" : "side event",
      e.start || "",
    ].join(" "));
  }
  D.clash = new Map(D.events.map((e) => [e.id, D.events.filter((o) => overlaps(e, o))]));

  // Who's Going: public records only; pending leads are kept for the research view
  D.attendanceAll = attendance;
  D.att = attendance.filter((a) => a.public && a.confidence !== "pending");
  D.attByPerson = new Map();
  D.attByCompany = new Map();
  D.attByEvent = new Map();
  for (const a of D.att) {
    if (a.person_id) (D.attByPerson.get(a.person_id) || D.attByPerson.set(a.person_id, []).get(a.person_id)).push(a);
    else if (a.company_id) (D.attByCompany.get(a.company_id) || D.attByCompany.set(a.company_id, []).get(a.company_id)).push(a);
    for (const e of a.event_ids) (D.attByEvent.get(e) || D.attByEvent.set(e, []).get(e)).push(a);
  }
  D.going = buildGoing();
}

// ---------------------------------------------------------------- small helpers
const dayOf = (iso) => D.dayBy.get(iso);
const dayRange = (e) => (e.end_date ? `${dayOf(e.date).label.slice(0, 3)}–${dayOf(e.end_date).label.slice(0, 3)}` : dayOf(e.date).label);
const evUrl = (e) => `#/events/${e.id}`;
const absUrl = (hash) => `${location.origin}${location.pathname}${hash}`;
const eventsOn = (iso) => D.events.filter((e) => eventDays(e).includes(iso)).sort((a, b) => sortKey(a, iso).localeCompare(sortKey(b, iso)));
const fmtDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
/** Relevance score out of 10, e.g. "9/10". Bands match the relevance tiers. */
const scoreChip = (e) => (e.score ? `<span class="chip score-chip s-${e.score >= 8 ? "hi" : e.score >= 6 ? "mid" : "lo"}" title="Relevance score: ${e.score} out of 10"><b>${e.score}</b>/10</span>` : "");
const relChip = (r) => `<span class="chip rel rel-${r}">${REL[r].label}</span>`;
const kindChip = (e, short = false) => { const k = kindOf(e); return `<span class="chip chip-kind kind-${k}"><span aria-hidden="true">${KIND_ICON[k]}</span>${esc(short ? KIND_SHORT[k] : KIND[k])}</span>`; };
const typeChip = (e) => `${kindChip(e)}${formatOf(e) ? `<span class="chip">${esc(formatOf(e))}</span>` : ""}`;
const accessChip = (e) => `<span class="chip chip-outline chip-access-${e.access}">${esc(ACCESS[e.access])}</span>`;
const statusChip = (e) =>
  e.status === "verified" ? "" : `<span class="chip ${e.status === "listed" ? "chip-outline" : "chip-warn"}">${esc(STATUS[e.status].label)}</span>`;
const saveBtn = (e, wide = false) => {
  const on = saved.has(e.id);
  return `<button type="button" class="save-btn${wide ? " wide" : ""}" data-save="${e.id}" aria-pressed="${on}" aria-label="${on ? "Remove" : "Save"} ${esc(e.title)} ${on ? "from" : "to"} My schedule">${STAR}${wide ? `<span>${on ? "Saved to My schedule" : "Save to My schedule"}</span>` : ""}</button>`;
};
const updatedBadge = (rec) => (rec.last_updated && rec.last_updated > D.site.last_updated ? `<span class="chip chip-warn">Updated ${esc(rec.last_updated)}</span>` : "");

function eventCard(e, o = {}) {
  if (o.compact && !o.clashSaved) return eventRow(e);
  const isSaved = saved.has(e.id);
  const clashSaved = o.clashSaved ? (D.clash.get(e.id) || []).filter((x) => saved.has(x.id)) : [];
  const cls = ["event-card", `r-${e.relevance}`, isSaved ? "is-saved" : "", clashSaved.length ? "is-clash" : "", o.compact ? "compact" : ""].join(" ");
  const multi = e.end_date ? ` · ${dayRange(e)}` : "";
  return `<article class="${cls}" data-id="${e.id}">
    <div class="body">
      <div class="when"><span class="time">${esc(timeLabel(e))}${esc(multi)}</span>${o.showDay === false ? "" : `<span class="day">${esc(dayOf(e.date).label)}</span>`}</div>
      <h3><a href="${evUrl(e)}">${esc(e.title)}</a></h3>
      <p class="venue">${esc(e.venue)}${formatOf(e) ? ` · ${esc(formatOf(e))}` : ""}</p>
    </div>
    <div class="side">${saveBtn(e)}</div>
    ${o.compact ? "" : `<p class="blurb">${esc(e.why)}</p>`}
    ${o.reasons?.length ? `<div class="reasons">${o.reasons.map((r) => `<span class="chip">${esc(r)}</span>`).join("")}</div>` : ""}
    <div class="foot"><div class="chip-row">${kindChip(e)}${scoreChip(e)}${relChip(e.relevance)}${accessChip(e)}${e.status === "provisional" || e.status === "conflict" ? statusChip(e) : ""}${updatedBadge(e)}</div></div>
    ${clashSaved.length ? `<p class="clash-line">⚠ Clashes with ${clashSaved.map((x) => `<a href="${evUrl(x)}">${esc(x.title)}</a> (${esc(timeLabel(x))})`).join(", ")}</p>` : ""}
  </article>`;
}

/** One row of the calendar programme: time column, kind marker on the spine, event card. */
function progItem(e, o = {}) {
  const k = kindOf(e), isSaved = saved.has(e.id);
  const clashSaved = (D.clash.get(e.id) || []).filter((x) => saved.has(x.id));
  const clash = isSaved && clashSaved.length;
  const time = e.start
    ? `<span class="t-start">${esc(e.start)}</span><span class="t-end">${e.end ? `to ${esc(e.end)}` : "end TBC"}</span>`
    : `<span class="t-note">${esc(isAllDay(e) ? (e.time_note || "All day") : "TBC")}</span>`;
  return `<article class="prog-item k-${k} r-${e.relevance}${isSaved ? " is-saved" : ""}${clash ? " is-clash" : ""}" data-id="${e.id}">
    <div class="prog-time">${time}${e.end_date ? `<span class="t-range">${esc(dayRange(e))}</span>` : ""}</div>
    <div class="prog-spine" aria-hidden="true"><i></i></div>
    <div class="prog-card">
      <p class="prog-eyebrow"><span class="prog-kind"><span aria-hidden="true">${KIND_ICON[k]}</span>${esc(KIND[k])}</span>${formatOf(e) ? `<span class="prog-format">${esc(formatOf(e))}</span>` : ""}</p>
      <h3><a href="${evUrl(e)}">${esc(e.title)}</a></h3>
      <p class="prog-venue">${esc(e.venue)}</p>
      <p class="prog-blurb">${esc(e.why)}</p>
      <div class="chip-row">${scoreChip(e)}${relChip(e.relevance)}${accessChip(e)}${e.status === "provisional" || e.status === "conflict" ? statusChip(e) : ""}${updatedBadge(e)}</div>
      ${clash ? `<p class="clash-line">⚠ Clashes with ${clashSaved.map((x) => `<a href="${evUrl(x)}">${esc(x.title)}</a> (${esc(timeLabel(x))})`).join(", ")}</p>` : ""}
      <div class="prog-save">${saveBtn(e)}</div>
    </div>
  </article>`;
}

const DAYPART = [["Morning", 0], ["Afternoon", 12 * 60], ["Evening", 17 * 60]];
const daypartOf = (min) => DAYPART.filter(([, from]) => min >= from).pop()[0];

/** Calendar agenda laid out like a printed conference programme. */
function programme(list, day, o = {}) {
  const allDay = list.filter((e) => isAllDay(e));
  const unknown = list.filter((e) => !e.start && !isAllDay(e));
  const groups = clusters(list);
  const sect = (title, sub, body, cls = "") => `<section class="prog-sect ${cls}"><h3 class="prog-sect-head"><span>${esc(title)}</span>${sub ? `<small>${sub}</small>` : ""}</h3>${body}</section>`;
  let html = "";
  if (allDay.length) html += sect("All day", `${plural(allDay.length, "listing")}${allDay.some((e) => e.end_date) ? " · includes expo hours" : ""}`, allDay.map((e) => progItem(e)).join(""), "is-allday");
  let part = null, buf = "", count = 0, prevEnd = null;
  const flush = () => { if (part) html += sect(part, plural(count, o.noun || "listing"), buf); buf = ""; count = 0; };
  for (const g of groups) {
    const s = Math.min(...g.map((e) => toMin(e.start)));
    const p = daypartOf(s);
    if (p !== part) { flush(); part = p; }
    if (o.gaps && prevEnd != null && s - prevEnd >= 15)
      buf += `<div class="prog-gap"><span></span><span class="prog-gap-spine" aria-hidden="true"></span><p>Free ${fmtMin(prevEnd)}–${fmtMin(s)} · ${fmtDuration(s - prevEnd)}</p></div>`;
    count += g.length;
    const en = Math.max(...g.map((e) => toMin(e.end) ?? toMin(e.start)));
    prevEnd = Math.max(prevEnd ?? 0, en);
    if (g.length === 1) { buf += progItem(g[0]); continue; }
    buf += `<div class="prog-overlap" role="group" aria-label="${g.length} overlapping events"><p class="prog-ov-head"><span>⚠ ${o.clashLabel || `${g.length} at once`}</span> ${fmtMin(s)}–${fmtMin(en)}</p>${g.map((e) => progItem(e)).join("")}</div>`;
  }
  flush();
  if (unknown.length) html += sect("Time not yet published", plural(unknown.length, "listing"), unknown.map((e) => progItem(e)).join(""), "is-unknown");
  return `<div class="programme">${html}</div>`;
}

/** Agenda for one day: all-day block, overlap clusters, then unknown-time items. */
function agenda(list, day, o = {}) {
  const allDay = list.filter((e) => isAllDay(e));
  const unknown = list.filter((e) => !e.start && !isAllDay(e));
  const groups = clusters(list);
  const card = (e) => eventCard(e, { showDay: false, clashSaved: o.clashSaved, compact: o.compact });
  let html = "";
  if (allDay.length)
    html += `<div class="allday-group${allDay.length > 1 ? " wide" : ""}"><div class="og-head">All day${allDay.some((e) => e.end_date) ? " / expo hours" : ""}</div>${allDay.map(card).join("")}</div>`;
  groups.forEach((g, i) => {
    if (o.gaps && i > 0) {
      const prevEnd = Math.max(...groups[i - 1].map((e) => toMin(e.end) ?? toMin(e.start)));
      const nextStart = toMin(g[0].start);
      if (nextStart - prevEnd >= 15) html += `<div class="gap">Free ${fmtMin(prevEnd)}–${fmtMin(nextStart)} · ${fmtDuration(nextStart - prevEnd)}</div>`;
    }
    if (g.length === 1) { html += card(g[0]); return; }
    const s = Math.min(...g.map((e) => toMin(e.start)));
    const en = Math.max(...g.map((e) => toMin(e.end) ?? toMin(e.start)));
    html += `<div class="overlap-group${g.length > 1 ? " wide" : ""}" role="group" aria-label="${g.length} overlapping events">
      <div class="og-head">⚠ ${o.clashLabel || `${g.length} overlap`} · ${fmtMin(s)}–${fmtMin(en)}</div>${g.map(card).join("")}</div>`;
  });
  if (unknown.length)
    html += `<div class="allday-group"><div class="og-head">Time not yet published</div>${unknown.map(card).join("")}</div>`;
  return `<div class="event-list">${html}</div>`;
}

function setMeta(title, description) {
  document.title = title ? `${title} · Prediction Markets at TOKEN2049` : "Prediction Markets at TOKEN2049 Singapore 2026";
  document.querySelector('meta[name="description"]').setAttribute("content", description || D.site.tagline);
  document.querySelector('meta[property="og:title"]').setAttribute("content", document.title);
}
function setLD(obj) {
  document.getElementById("route-ld")?.remove();
  if (!obj) return;
  const s = Object.assign(document.createElement("script"), { type: "application/ld+json", id: "route-ld", textContent: JSON.stringify(obj) });
  document.head.append(s);
}

let toastTimer;
function toast(msg, action) {
  const t = document.getElementById("toast");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  t.hidden = false;
  if (action) t.querySelector("button").onclick = () => { action.run(); t.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

const issueUrl = (template, fields = {}) => {
  const p = new URLSearchParams({ template, ...fields });
  return `${D.site.repo_url}/issues/new?${p}`;
};
const curator = () => (D.site.curator.url ? `<a href="${esc(D.site.curator.url)}" rel="noopener">${esc(D.site.curator.name)}</a>` : esc(D.site.curator.name));

// ---------------------------------------------------------------- router
let navDepth = 0;
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(query) };
}
function setQuery(q, { replace = true } = {}) {
  const { parts } = parseHash();
  const s = q.toString().replace(/%2C/g, ",");
  const hash = `#/${parts.map(encodeURIComponent).join("/")}${s ? "?" + s : ""}`;
  if (replace) history.replaceState(null, "", hash);
  else location.hash = hash;
}

const ROUTES = { "": home, start, week, calendar, events, going, people, companies, stack, schedule, about, nextpredict, play };

function render({ keepScroll = false } = {}) {
  const { parts, q } = parseHash();
  const key = parts[0] || "";
  const fn = ROUTES[key] || notFound;
  setLD(null);
  const y = window.scrollY;
  view().className = "wrap";
  PAGE = document.createElement("div");
  PAGE.innerHTML = fn(parts.slice(1), q) || "";
  view().replaceChildren(PAGE);
  afterRender[key]?.(parts.slice(1), q);
  const navKey = key || "home";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const match = a.dataset.nav === navKey;
    match ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });
  const moreKeys = ["people", "companies", "stack", "week", "about", "now", "plan", "briefing"];
  document.querySelector("[data-nav-more]")?.classList.toggle("current", moreKeys.includes(navKey));
  document.querySelector(".nav-more")?.removeAttribute("open");
  updateCounts();
  if (keepScroll) window.scrollTo(0, y);
  else {
    const anchor = q.get("at") && document.getElementById(q.get("at"));
    if (anchor) anchor.scrollIntoView();
    else window.scrollTo(0, 0);
    const h1 = view().querySelector("h1");
    if (h1 && navDepth > 0) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
  }
}
const afterRender = {};
let PAGE = null; // fresh element per render so listeners never pile up

function updateCounts() {
  const n = saved.all().filter((id) => D.ev.has(id)).length;
  document.querySelectorAll("[data-saved-count]").forEach((el) => (el.textContent = n));
}

function notFound() {
  setMeta("Not found");
  return `<h1>Page not found</h1><p>That link doesn’t match anything in the directory. It may have been renamed.</p><p><a class="btn" href="#/events">Browse all events</a></p>`;
}

// ---------------------------------------------------------------- HOME
function nextUp(q) {
  const now = sgtNow(q.get("now"));
  const first = D.days[0].date, last = D.days[D.days.length - 1].date;
  const pm = (e) => e.relevance === "core" || e.relevance === "strong";
  if (now.date < first) {
    const days = Math.round((Date.parse(first) - Date.parse(now.date)) / 864e5);
    const list = D.events.filter((e) => pm(e) && e.status !== "provisional").slice(0, 4);
    return { title: `TOKEN2049 week starts in ${plural(days, "day")}`, sub: "The first prediction-market listings of the week:", list };
  }
  if (now.date > last) return { title: "TOKEN2049 week has finished", sub: "The directory stays online as a record of what happened.", list: [] };
  const today = eventsOn(now.date);
  const live = today.filter((e) => isTimed(e) && toMin(e.start) <= now.min && now.min < toMin(e.end));
  const later = D.events.filter((e) => (e.date === now.date && e.start && toMin(e.start) > now.min) || e.date > now.date).slice(0, 4);
  return {
    title: live.length ? "Happening now" : "Up next",
    sub: live.length ? `${plural(live.length, "listing")} in progress (Singapore time), then:` : `Next listings (Singapore time, ${fmtMin(now.min)} now):`,
    list: [...live.filter(pm), ...live.filter((e) => !pm(e)), ...later].slice(0, 6),
    today: now.date,
  };
}

function home(_, q) {
  setMeta("", D.site.tagline);
  const E = D.events;
  const cnt = (fn) => E.filter(fn).length;
  const nu = nextUp(q);
  const S = homeSections(nu);
  // During the week, "what's next" leads. Curated lists stay on their own tabs.
  const order = nu.today ? ["next"] : [];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const pmOn = (iso) => eventsOn(iso).filter((e) => e.relevance === "core").length;
  const maxDay = Math.max(...D.days.map((d) => eventsOn(d.date).length));
  return `
  <section class="home-hero">
    <div class="hh-copy">
      <p class="hh-eyebrow">Singapore · 5–9 October 2026 · Unofficial guide</p>
      <h1>Every prediction-market event at TOKEN2049, in one place.</h1>
      <p class="hh-lede">Conference sessions, side events, expo booths and the people going, each checked against its source.</p>
      <div class="hh-actions"><a class="hh-btn hh-btn-primary" href="#/calendar">Open the calendar <span aria-hidden="true">→</span></a><a class="hh-btn" href="#/going">See who’s going</a></div>
      <p class="hh-new">New to prediction markets? <a href="#/start">Start with the two-minute guide</a></p>
    </div>
    <aside class="hh-week" aria-labelledby="hh-week-title">
      <div class="hh-week-head"><h2 id="hh-week-title">TOKEN2049 week</h2><span class="hh-live"><span class="pulse" aria-hidden="true"></span>${esc(cap(nu.title.replace(/^TOKEN2049 week /, "")))}</span></div>
      <ol class="hh-days">${D.days.map((d) => {
        const n = eventsOn(d.date).length, pm = pmOn(d.date), main = D.site.main_days.includes(d.date);
        return `<li${nu.today === d.date ? ' class="is-today" aria-current="date"' : ""}><a href="#/calendar/${d.slug}"><span class="hh-date"><small>${esc(d.label.slice(0, 3))}</small><b>${d.label.slice(4, 6).trim()}</b></span><span class="hh-day-text"><strong>${esc(cap(d.note.replace(/^TOKEN2049 /, "")))}</strong><span class="hh-bar" aria-hidden="true"><i style="width:${Math.max(6, (n / maxDay) * 100)}%"></i></span><span class="hh-counts">${plural(n, "listing")}${pm ? ` · <b>${pm} prediction-market</b>` : ""}</span></span>${main ? `<span class="hh-tag">Conference</span>` : `<span></span>`}</a></li>`;
      }).join("")}</ol>
      <p class="hh-foot">${E.length} events · ${D.going.length} people & companies · times in SGT</p>
    </aside>
  </section>

  ${HOOKS.homeTop?.(q) || ""}

  ${npBanner()}

  ${order.map((k, i) => S[k](String(i + 1).padStart(2, "0"))).join("")}

  ${meetStuart()}

  ${shareSiteBox()}
`;
}

/** Home section heading: step number, title, one-line explainer and a "more" link. */
const secHead = (id, n, title, sub, href, more) => `<div class="section-head home-head"><div><h2 id="${id}">${title}</h2>${sub ? `<p class="section-sub">${sub}</p>` : ""}</div>${href ? `<a class="more" href="${href}">${more}</a>` : ""}</div>`;

function homeSections(nu) {
  return {
  next: (n) => `<section class="section" aria-labelledby="h-next">
    ${secHead("h-next", n, nu.today ? esc(nu.title) : "First up", nu.today ? "What’s on next today, in time order." : "The first listings of the week, in time order.", nu.today ? `#/calendar/${dayOf(nu.today).slug}` : "#/calendar", "Full calendar →")}
    ${nu.list.length ? `<div class="row-list">${nu.list.map((e) => eventRow(e)).join("")}</div>` : `<p class="muted">${esc(nu.sub)}</p>`}
  </section>`,
  };
}

/** A light, single-line-ish event row for lists (home, related, appearances). */
function eventRow(e) {
  const on = saved.has(e.id);
  return `<article class="event-row r-${e.relevance}${on ? " is-saved" : ""}" data-id="${e.id}">
    <div class="er-when"><span class="er-day">${esc(e.end_date ? dayRange(e) : dayOf(e.date).label.slice(0, 3) + " " + dayOf(e.date).label.slice(4, 6).trim())}</span><span class="er-time${e.start ? "" : " soft"}">${esc(e.start ? e.start : isAllDay(e) ? "All day" : "TBC")}</span></div>
    <div class="er-main"><h3><a href="${evUrl(e)}">${esc(e.title)}</a></h3>
      <p>${kindChip(e, true)} ${scoreChip(e)} <i class="rel-dot dot-${e.relevance}" aria-hidden="true"></i><span class="visually-hidden">${esc(REL[e.relevance].label)}.</span> ${esc(e.venue)} · ${esc(ACCESS[e.access])}${e.status === "provisional" || e.status === "conflict" ? ` · <span class="warn-text">${esc(STATUS[e.status].label)}</span>` : ""}${HOOKS.rowBadge?.(e) || ""}</p></div>
    <div class="er-side">${saveBtn(e)}</div>
  </article>`;
}

function personMini(p) {
  const org = D.companies.get(p.org);
  const sub = p.role || org?.name || p.org_label || GROUP[p.group];
  return `<a class="mini" href="#/people/${p.id}"><span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong><span>${esc(sub)}</span></span></a>`;
}
function companyMini(c, extra = "") {
  return `<a class="mini" href="#/companies/${c.id}"><span class="avatar sq" aria-hidden="true">${esc(initials(c.name))}</span><span><strong>${esc(c.name)}</strong><span>${esc(extra || GROUP[c.category])}</span></span></a>`;
}

// ---------------------------------------------------------------- START HERE + FINDER
const ROLES = {
  newcomer: { label: "Newcomer", aud: { general: 3, media: 1 }, rel: { core: 2 }, open: true },
  trader: { label: "Trader", aud: { traders: 3, "market-makers": 2 }, topics: { trading: 2, liquidity: 1 } },
  "market-maker": { label: "Market maker", aud: { "market-makers": 3, traders: 2 }, topics: { "market-making": 2, liquidity: 2 } },
  founder: { label: "Founder / builder", aud: { founders: 3, builders: 2, investors: 1 }, topics: { infrastructure: 1, distribution: 1 } },
  institutional: { label: "Institutional investor / trader", aud: { institutions: 3, investors: 2 }, topics: { institutional: 2, clearing: 1, risk: 1 } },
  sports: { label: "Sportsbook / iGaming", aud: { sports: 4, traders: 1, general: 1 }, topics: { sports: 4 } },
  journalist: { label: "Journalist / creator", aud: { media: 3, general: 2 }, rel: { wildcard: 2 } },
  infrastructure: { label: "Infrastructure provider", aud: { builders: 2, institutions: 1 }, topics: { infrastructure: 2, data: 2, clearing: 2 } },
};
const INTERESTS = {
  kalshi: { label: "Kalshi", test: (e) => e.ecosystems.includes("kalshi") },
  polymarket: { label: "Polymarket", test: (e) => e.ecosystems.includes("polymarket") },
  hyperliquid: { label: "Hyperliquid / outcome markets", test: (e) => e.ecosystems.includes("hyperliquid") },
  sports: { label: "Sports", test: (e) => e.topics.includes("sports") || e.audiences.includes("sports") },
  institutional: { label: "Institutional adoption", test: (e) => e.topics.includes("institutional") || e.audiences.includes("institutions") },
  liquidity: { label: "Liquidity & market making", test: (e) => e.topics.some((t) => t === "liquidity" || t === "market-making") },
  technology: { label: "Technology / infrastructure", test: (e) => e.topics.some((t) => ["infrastructure", "data", "clearing"].includes(t)) || e.stack_layers.length > 1 },
  regulation: { label: "Regulation / compliance", test: (e) => e.topics.includes("regulation") || e.audiences.includes("regulators") },
  networking: { label: "Networking", test: (e) => e.type === "networking" || e.type === "meetup" },
};
const ATTEND = { one: "One day", main: "TOKEN2049 main days only (Wed–Thu)", week: "The whole week" };

function recommend({ role, interests, attend, day }) {
  const R = ROLES[role];
  if (!R) return [];
  let pool = D.events;
  if (attend === "one" && day) pool = pool.filter((e) => eventDays(e).includes(day));
  if (attend === "main") pool = pool.filter((e) => eventDays(e).some((d) => D.site.main_days.includes(d)));
  const scored = pool.map((e) => {
    let s = { core: 5, strong: 3, adjacent: 0, wildcard: 1 }[e.relevance] + (R.rel?.[e.relevance] || 0);
    const reasons = [];
    if (e.relevance === "core") reasons.push("Prediction markets");
    let audHit = 0;
    for (const a of e.audiences) audHit = Math.max(audHit, R.aud[a] || 0);
    s += audHit;
    if (audHit >= 2) reasons.push(`For ${R.label.toLowerCase().replace(/ \/.*/, "")}s`.replace("sportsbooks", "sports people"));
    for (const t of e.topics) s += R.topics?.[t] || 0;
    for (const i of interests) if (INTERESTS[i]?.test(e)) { s += 3; reasons.push(INTERESTS[i].label); }
    if (R.open && ["open", "badge", "registration"].includes(e.access)) s += 2;
    if (R.open && ["invite", "waitlist"].includes(e.access)) s -= 1;
    if (e.status === "provisional") s -= 4;
    return { e, s, reasons: [...new Set(reasons)] };
  });
  return scored.filter((x) => x.s >= 6).sort((a, b) => b.s - a.s).slice(0, 12).sort((a, b) => sortKey(a.e).localeCompare(sortKey(b.e)));
}

function finderForm(q) {
  const role = q.get("role") || "", interests = (q.get("int") || "").split(",").filter(Boolean), attend = q.get("att") || "week", day = q.get("day") || D.days[3].date;
  const opt = (name, k, l, on, multi) => `<button type="button" class="toggle" data-f="${name}" data-v="${k}" aria-pressed="${on}"${multi ? "" : ` role="radio" aria-checked="${on}"`}>${esc(l)}</button>`;
  return `<div class="finder">
    <fieldset><legend>I am a…</legend><div class="opts" role="radiogroup" aria-label="I am a">${Object.entries(ROLES).map(([k, r]) => opt("role", k, r.label, role === k)).join("")}</div></fieldset>
    <fieldset><legend>I care most about… <span class="muted small">(pick any)</span></legend><div class="opts">${Object.entries(INTERESTS).map(([k, r]) => opt("int", k, r.label, interests.includes(k), true)).join("")}</div></fieldset>
    <fieldset><legend>I am attending…</legend><div class="opts" role="radiogroup" aria-label="I am attending">${Object.entries(ATTEND).map(([k, l]) => opt("att", k, l, attend === k)).join("")}</div>
      ${attend === "one" ? `<div class="opts" style="margin-top:10px" role="radiogroup" aria-label="Which day">${D.days.map((d) => opt("day", d.date, d.label, day === d.date)).join("")}</div>` : ""}
    </fieldset></div>
    <div class="finder-results" id="finder-results" aria-live="polite">${finderResults({ role, interests, attend, day })}</div>`;
}
function finderResults(sel) {
  if (!sel.role) return `<p class="empty">Choose what describes you best to see a shortlist.</p>`;
  const recs = recommend(sel);
  if (!recs.length) return `<p class="empty">Nothing strong enough matches that combination. Try another day or fewer interests, or <a href="#/events">browse everything</a>.</p>`;
  const ids = recs.map((r) => r.e.id).join(",");
  let html = `<div class="section-head"><h3>Your shortlist: ${plural(recs.length, "listing")}</h3><div class="btn-row"><button class="btn btn-small btn-accent" type="button" data-save-all="${ids}">★ Save all to My schedule</button><a class="btn btn-small" href="#/schedule?share=${ids}">Preview as schedule</a></div></div>
  <p class="small muted">Ranked by relevance to your answers, then shown in time order. Check the clashes, because some of these overlap.</p>`;
  const days = [...new Set(recs.map((r) => r.e.date))];
  for (const d of days) {
    const list = recs.filter((r) => r.e.date === d);
    html += `<div class="day-group"><h4 class="day-heading">${esc(dayOf(d).long)} <span class="n">${list.length}</span></h4><div class="event-list">${list.map((r) => eventCard(r.e, { showDay: false, reasons: r.reasons })).join("")}</div></div>`;
  }
  return html;
}

function start(_, q) {
  setMeta("Start here", "New to prediction markets at TOKEN2049? A two-minute orientation, three routes through the week and a shortlist builder.");
  const E = D.events;
  const n = (fn) => E.filter(fn).length;
  const glossary = [
    ["Prediction market", "A market where people trade contracts on the outcome of a future event, such as an election, a match or an economic number. Prices move between 0 and 100% and can be read as the crowd’s probability."],
    ["Event contract", "The regulated, US-style name for a prediction-market contract. It pays a fixed amount if the event happens and nothing if it doesn’t."],
    ["Outcome market / HIP-4", "Hyperliquid’s term for prediction-style markets that third-party builders can deploy on its shared infrastructure, rather than a single company listing them."],
    ["Market maker", "A firm or trader that continuously posts buy and sell prices so others can trade. Thin markets without them are hard to use at size."],
    ["Order book", "The live list of buy and sell orders at each price. Professional traders consume the full order book over fast data feeds."],
    ["Oracle / resolution", "How the real-world answer gets into the market so it can settle. This is where disputes happen when the source is late, wrong or ambiguous."],
    ["Clearing & settlement", "The back-office process that confirms trades, holds collateral and pays out. It is familiar from futures markets."],
    ["Margin vs full collateral", "Most prediction markets require you to post your maximum possible loss up front. Margin would let institutions use less capital, which is a live regulatory question."],
    ["White-label", "Software another business can rebrand and run as its own prediction market."],
    ["Conference session", "A talk, panel or keynote on the official TOKEN2049 programme, on a stage at Marina Bay Sands. Needs a TOKEN2049 pass."],
    ["Exhibitor booth", "A company’s stand on the TOKEN2049 expo floor during the main conference days. Needs a TOKEN2049 pass."],
    ["Side event", "Anything around TOKEN2049 that isn’t on the official programme: parties, forums, breakfasts, meetups. Many need approval."],
  ];
  const places = [
    ["🎤", "Official sessions", "Wed–Thu on the TOKEN2049 stages at Marina Bay Sands. Needs a TOKEN2049 pass.", "#/events?kind=session", n((e) => kindOf(e) === "session")],
    ["🏢", "The expo floor", "Prediction-market sponsors with booths during the main conference days.", "#/events?kind=booth", n((e) => kindOf(e) === "booth")],
    ["🥂", "Side events", "Forums, parties and closed-door rooms all week. Many need approval.", "#/events?kind=side", n((e) => kindOf(e) === "side")],
    ["🧱", "The stack", "Data, clearing, risk and market-making firms that make the markets work.", "#/stack", D.stack.length + " layers"],
  ];
  const ecos = [
    ["Kalshi", "US-regulated event-contract exchange.", "kalshi", "kalshi"],
    ["Polymarket", "The biggest crypto-native prediction market.", "polymarket", "polymarket"],
    ["Hyperliquid", "Lets anyone deploy outcome markets (HIP-4).", "hyperliquid", "hyperliquid"],
    ["Independents", "Predict.fun, PredictBay, Predict365 and more.", "independent", "predict-fun"],
  ];
  return `
  <section class="hero hero-sm">
    <p class="eyebrow">Guide</p>
    <h1>New to prediction markets at TOKEN2049?</h1>
    <p class="lede">Three steps, about two minutes. See where prediction markets show up, pick how you’re attending, then get a shortlist to save.</p>
    <ol class="step-rail">
      <li><a href="#/start?at=g-where"><span class="step">1</span>Know where to look</a></li>
      <li><a href="#/start?at=g-route"><span class="step">2</span>Pick your route</a></li>
      <li><a href="#/start?at=finder"><span class="step">3</span>Get your shortlist</a></li>
    </ol>
  </section>

  <section class="section" id="g-where" aria-labelledby="h-s3">
    <div class="section-head"><h2 id="h-s3"><span class="step">1</span> Know where to look</h2></div>
    <p class="muted">Prediction markets don’t have one home at TOKEN2049. They show up in four places:</p>
    <div class="interest-grid">${places.map(([i, t, d, h, c]) => `<a class="interest interest-lg" href="${h}"><span aria-hidden="true">${i}</span><strong>${esc(t)}</strong><small>${esc(d)}</small><em>${typeof c === "number" ? plural(c, "listing") : c}</em></a>`).join("")}</div>
    <h3 class="subhead">The main ecosystems</h3>
    <div class="interest-grid">${ecos.map(([t, d, eco, cid]) => `<a class="interest" href="#/events?eco=${eco}"><strong>${esc(t)}</strong><small>${esc(d)}</small><em>${plural(n((e) => e.ecosystems.includes(eco)), "event")} · <span class="link-like" data-href="#/companies/${cid}">profile</span></em></a>`).join("")}</div>
  </section>

  <section class="section" id="g-route" aria-labelledby="h-s1">
    <div class="section-head"><h2 id="h-s1"><span class="step">2</span> Pick your route</h2></div>
    <div class="doors doors-plain">
      <div class="door door-static"><span class="door-icon" aria-hidden="true">☀️</span><span class="door-text"><strong>I only have one day</strong><span>The prediction-market highlights for a single day.</span>
        <span class="day-pills">${D.days.map((d) => `<a href="#/calendar/${d.slug}?show=pm&view=agenda">${esc(d.label.slice(0, 3))}</a>`).join("")}</span></span></div>
      <a class="door" href="#/week"><span class="door-icon" aria-hidden="true">🗓️</span><span class="door-text"><strong>I’m here all week</strong><span>Monday to Friday, with the clashes you’ll need to choose between.</span></span><span class="door-arrow" aria-hidden="true">→</span></a>
      <a class="door" href="#/going"><span class="door-icon" aria-hidden="true">🤝</span><span class="door-text"><strong>I want to meet people</strong><span>Who’s going, and where to find them.</span></span><span class="door-arrow" aria-hidden="true">→</span></a>
    </div>
    <p class="small muted" style="margin-top:10px">Tip: Thursday has the most prediction-market programming.</p>
  </section>

  <section class="section" id="finder" aria-labelledby="h-finder">
    <div class="section-head"><h2 id="h-finder"><span class="step">3</span> Get your shortlist</h2></div>
    <div class="panel"><p class="muted" style="margin-top:0">Answer three quick questions. Nothing is sent anywhere.</p>
    <div id="finder-root">${finderForm(q)}</div></div>
  </section>

  <section class="section" aria-labelledby="h-ref">
    <div class="section-head"><h2 id="h-ref">Handy reference</h2></div>
    <details class="fold fold-card"><summary>What the labels mean</summary>
      <div class="grid grid-3" style="margin-top:12px">
        <div><h3>Relevance</h3>${Object.entries(REL).map(([k, v]) => `<p>${relChip(k)}<span class="def">${esc(v.desc)}</span></p>`).join("")}<p class="def">The score out of 10 ranks listings within these bands: 8–10, 6–7, 3–5 and 1–4.</p></div>
        <div><h3>Access</h3>${["badge", "open", "registration", "approval", "invite", "waitlist"].map((k) => `<p style="margin:0 0 6px"><span class="chip chip-outline chip-access-${k}">${ACCESS[k]}</span></p>`).join("")}</div>
        <div><h3>Verification</h3>${Object.entries(STATUS).map(([k, v]) => `<p><strong>${esc(v.label)}</strong><span class="def">${esc(v.desc)}</span></p>`).join("")}</div>
      </div></details>
    <details class="fold fold-card"><summary>${glossary.length} terms you’ll hear</summary>
      <dl class="glossary" style="margin-top:12px">${glossary.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join("")}</dl></details>
  </section>`;
}
afterRender.start = () => bindFinder();

function bindFinder() {
  const root = document.getElementById("finder-root");
  if (!root) return;
  root.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-f]");
    if (!b) return;
    const { q } = parseHash();
    const f = b.dataset.f, v = b.dataset.v;
    if (f === "int") {
      const cur = new Set((q.get("int") || "").split(",").filter(Boolean));
      cur.has(v) ? cur.delete(v) : cur.add(v);
      cur.size ? q.set("int", [...cur].join(",")) : q.delete("int");
    } else q.set(f, v);
    q.delete("at");
    setQuery(q);
    root.innerHTML = finderForm(q);
    root.querySelector(`[data-f="${f}"][data-v="${v}"]`)?.focus();
  });
}

// ---------------------------------------------------------------- WEEK ROUTE
function week() {
  setMeta("Whole-week route", "A Monday–Friday route through the prediction-market-focused listings at TOKEN2049 Singapore, with clashes highlighted.");
  const pm = (e) => (e.relevance === "core" || e.relevance === "strong" || e.relevance === "wildcard") && e.status !== "provisional";
  return `<a class="back-link" href="#/start" data-back>← Start here</a>
  <h1>The whole week, Monday to Friday</h1>
  <p class="lede">Every prediction-market-focused, strongly relevant and wildcard listing, day by day. Where listings overlap they’re grouped, so you can see the choices you’ll need to make.</p>
  <p class="small muted">Adjacent sessions and provisional listings are left out here. See them in the <a href="#/calendar">full calendar</a>.</p>
  ${D.days.map((d) => {
    const list = eventsOn(d.date).filter(pm);
    return `<section class="day-group"><h2 class="day-heading">${esc(d.long)} <span class="n">${esc(d.note)}</span></h2>${list.length ? agenda(list, d.date, { clashLabel: "Overlap: choose" }) : `<p class="empty">No focused listings recorded.</p>`}</section>`;
  }).join("")}`;
}

// ---------------------------------------------------------------- CALENDAR
const calPref = {
  get() { try { return localStorage.getItem("tpm2049:calview"); } catch { return null; } },
  set(v) { try { localStorage.setItem("tpm2049:calview", v); } catch { /* ignore */ } },
};
function calendar(parts, q) {
  const now = sgtNow(q.get("now"));
  const inWeek = D.dayBy.has(now.date);
  const d = D.days.find((x) => x.slug === parts[0]) || (inWeek ? dayOf(now.date) : D.days[0]);
  const viewMode = q.get("view") || calPref.get() || (window.innerWidth < 700 ? "agenda" : "timeline");
  const show = q.get("show") || "all";
  setMeta(`Calendar: ${d.long}`, `Prediction-market events and sessions on ${d.long} during TOKEN2049 Singapore week.`);
  const sel = selected(q);
  const nActive = CAL_FILTERS.reduce((n, f) => n + sel[f.key].length, 0);
  const showOk = (e) => (show === "pm" ? e.relevance !== "adjacent" : show === "saved" ? saved.has(e.id) : true);
  const passExcept = (e, skip) => showOk(e) && CAL_FILTERS.every((f) => f === skip || !sel[f.key].length || f.get(e).some((v) => sel[f.key].includes(v)));
  const filt = (e) => passExcept(e, null);
  const list = eventsOn(d.date).filter(filt);
  const qs = (over) => { const x = new URLSearchParams(q); for (const [k, v] of Object.entries(over)) v === null ? x.delete(k) : x.set(k, v); x.delete("at"); return x.toString(); };
  const toggleHref = (f, k) => {
    const cur = sel[f.key], next = cur.includes(k) ? cur.filter((v) => v !== k) : [...cur, k];
    return `#/calendar/${d.slug}?${qs({ [f.key]: next.length ? next.join(",") : null })}`;
  };
  const clearHref = `#/calendar/${d.slug}?${qs(Object.fromEntries(CAL_FILTERS.map((f) => [f.key, null])))}`;
  const chips = (f, all = false) => Object.keys(filterOpts(f)).map((k) => {
    const n = eventsOn(d.date).filter((e) => passExcept(e, f) && f.get(e).includes(k)).length;
    const on = sel[f.key].includes(k);
    if (!all && !n && !on) return "";
    const pre = f.key === "kind" ? `<span aria-hidden="true">${KIND_ICON[k]}</span>` : f.key === "rel" ? `<i class="rel-dot dot-${k}"></i>` : "";
    return `<a class="toggle" href="${toggleHref(f, k)}" data-calfilter data-f="${f.key}" data-v="${k}" aria-pressed="${on}">${pre}${esc(optLabel(f, k))} <span class="n">${n}</span></a>`;
  }).join("");
  const kindF = CAL_FILTERS[0], moreF = CAL_FILTERS.slice(1);
  const nMore = moreF.reduce((n, f) => n + sel[f.key].length, 0);
  return `
  <h1 class="page-title-sm">Calendar</h1>
  <nav class="day-tabs" aria-label="Choose a day">${D.days.map((x) => {
    const c = eventsOn(x.date).filter(filt).length;
    const main = D.site.main_days.includes(x.date);
    return `<a class="day-tab${main ? " is-main" : ""}" href="#/calendar/${x.slug}?${qs({})}" ${x.date === d.date ? 'aria-current="page"' : ""}><span class="dt-wd">${esc(x.label.slice(0, 3))}</span><b>${x.label.slice(4, 6).trim()}</b><span class="n">${c}<span class="n-word"> ${c === 1 ? "listing" : "listings"}</span></span>${main ? `<span class="dt-main">Conference</span>` : ""}</a>`;
  }).join("")}</nav>
  <div class="cal-toolbar">
    <div class="segmented" role="group" aria-label="Layout">
      <a href="#/calendar/${d.slug}?${qs({ view: "timeline" })}" data-calview="timeline" aria-pressed="${viewMode === "timeline"}">Timeline</a>
      <a href="#/calendar/${d.slug}?${qs({ view: "agenda" })}" data-calview="agenda" aria-pressed="${viewMode === "agenda"}">Agenda</a>
    </div>
    <div class="segmented" role="group" aria-label="Show">
      <a href="#/calendar/${d.slug}?${qs({ show: "all" })}" aria-pressed="${show === "all"}">All</a>
      <a href="#/calendar/${d.slug}?${qs({ show: "pm" })}" aria-pressed="${show === "pm"}">PM focus</a>
      <a href="#/calendar/${d.slug}?${qs({ show: "saved" })}" aria-pressed="${show === "saved"}">★ Saved</a>
    </div>
  </div>
  <section class="cal-filters" aria-label="Choose what to show">
    <div class="cal-kinds" role="group" aria-label="Kind">${chips(kindF, true)}</div>
    <details class="cal-more"${calMoreOpen || nMore ? " open" : ""} data-calmore>
      <summary>More filters${nMore ? ` <span class="count">${nMore}</span>` : ""}</summary>
      <div class="cal-more-body">${moreF.map((f) => { const c = chips(f); return c ? `<fieldset class="filter-group"><legend>${esc(f.label)}</legend><div class="opts">${c}</div></fieldset>` : ""; }).join("")}</div>
    </details>
    ${nActive ? `<a class="cal-clear" href="${clearHref}" data-calfilter>Clear ${plural(nActive, "filter")}</a>` : ""}
  </section>
  <header class="day-hero">
    <div class="day-leaf" aria-hidden="true"><span class="dl-month">Oct</span><span class="dl-num">${d.label.slice(4, 6).trim()}</span><span class="dl-wd">${esc(d.label.slice(0, 3))}</span></div>
    <div class="day-hero-text">
      <h2>${esc(d.long)}</h2>
      <p class="day-note">${esc(d.note)}</p>
      <p class="day-stats"><span>${plural(list.length, "listing")}</span>${Object.keys(KIND).map((k) => { const n = list.filter((e) => kindOf(e) === k).length; return n ? `<span class="ds-k k-${k}"><i aria-hidden="true"></i>${n} ${esc(n === 1 ? KIND_SHORT[k].toLowerCase() : KIND_SHORT[k].toLowerCase() + "s")}</span>` : ""; }).join("")}${show === "pm" ? "<span>adjacent hidden</span>" : ""}${nActive ? `<span>${plural(nActive, "filter")} on</span>` : ""}<span>times in SGT</span></p>
    </div>
  </header>
  ${!list.length ? `<p class="empty">${show === "saved" && !nActive ? "You haven’t saved anything on this day yet." : nActive ? `Nothing on this day matches these filters. <a href="${clearHref}" data-calfilter>Clear filters</a>` : "Nothing listed for this day."}</p>` : viewMode === "timeline" ? timeline(list, d.date, now) : programme(list, d.date)}
  <div class="legend" style="margin-top:14px">${Object.entries(REL).map(([k, v]) => `<span><i class="rel-dot dot-${k}"></i>${v.label}</span>`).join("")}<span>★ saved</span><span style="color:var(--clash)">▌ clash between saved</span></div>`;
}
afterRender.calendar = () => {
  document.querySelectorAll("[data-calview]").forEach((a) => a.addEventListener("click", () => calPref.set(a.dataset.calview)));
  // Filter chips update the page in place, keeping the scroll position and focus.
  document.querySelectorAll("[data-calfilter]").forEach((a) => a.addEventListener("click", (ev) => {
    ev.preventDefault();
    history.replaceState(null, "", a.getAttribute("href"));
    const { f, v } = a.dataset;
    render({ keepScroll: true });
    (f ? document.querySelector(`[data-f="${f}"][data-v="${v}"]`) : document.querySelector(".cal-kinds .toggle"))?.focus({ preventScroll: true });
  }));
  document.querySelector("[data-calmore]")?.addEventListener("toggle", (ev) => (calMoreOpen = ev.target.open));
  const sc = document.querySelector(".timeline-scroll");
  const first = sc?.querySelector(".tl-now") || sc?.querySelector(".tl-block");
  if (sc && first) sc.scrollLeft = Math.max(0, first.offsetLeft - 40);
};

function timeline(list, day, now) {
  const untimed = list.filter((e) => !e.start);
  const timed = list.filter((e) => e.start).sort((a, b) => toMin(a.start) - toMin(b.start));
  const pph = window.innerWidth < 700 ? 120 : 150;
  const laneH = 74;
  const MIN_VIS = 50; // minutes: short sessions get a readable minimum width and their own row
  let html = `<div class="timeline-wrap" role="region" aria-label="Timeline for ${esc(dayOf(day).long)}">`;
  if (untimed.length)
    html += `<div class="tl-allday"><span class="label">All day / time not published</span>${untimed.map((e) => `<a href="${evUrl(e)}"><i class="rel-dot dot-${e.relevance}"></i>${saved.has(e.id) ? "★ " : ""}${esc(e.title)} <span class="t">${esc(timeLabel(e))}</span></a>`).join("")}</div>`;
  if (timed.length) {
    const startH = Math.floor(Math.min(...timed.map((e) => toMin(e.start))) / 60);
    let endH = Math.ceil(Math.max(...timed.map((e) => Math.max(toMin(e.end) ?? 0, toMin(e.start) + MIN_VIS))) / 60);
    endH = Math.max(endH, startH + 5);
    const x = (min) => ((min - startH * 60) / 60) * pph;
    const lanes = [];
    const placed = timed.map((e) => {
      const s = toMin(e.start), en = toMin(e.end) ?? s + 30;
      const visEnd = Math.max(en, s + MIN_VIS);
      let lane = lanes.findIndex((end) => end <= s);
      if (lane === -1) { lane = lanes.length; lanes.push(visEnd); } else lanes[lane] = visEnd;
      return { e, s, en: visEnd, real: e.end ? toMin(e.end) : null, lane };
    });
    const width = (endH - startH) * pph;
    const height = lanes.length * laneH + 8;
    html += `<div class="timeline-scroll"><div class="timeline" style="width:${width}px">
      <div class="tl-axis">${Array.from({ length: endH - startH }, (_, i) => `<span class="tl-hour" style="left:${i * pph}px;width:${pph}px">${String(startH + i).padStart(2, "0")}:00</span>`).join("")}</div>
      <div class="tl-grid" aria-hidden="true">${Array.from({ length: (endH - startH) * 2 }, (_, i) => `<span class="${i % 2 ? "half" : ""}" style="left:${(i * pph) / 2}px"></span>`).join("")}</div>
      <div class="tl-lanes" style="height:${height}px">
      ${placed.map(({ e, s, en, real, lane }) => {
        const isSaved = saved.has(e.id);
        const clash = isSaved && (D.clash.get(e.id) || []).some((o) => saved.has(o.id));
        const cls = ["tl-block", `r-${e.relevance}`, e.end ? "" : "open-end", isSaved ? "saved" : "", clash ? "clash" : "", e.status === "provisional" ? "provisional" : ""].join(" ");
        const w = x(en) - x(s) - 3;
        return `<a class="${cls}" href="${evUrl(e)}" title="${esc(e.title)} (${esc(timeLabel(e))})" style="left:${x(s) + 1}px;top:${lane * laneH + 6}px;width:${w}px;height:${laneH - 8}px">
          ${real && real < en ? `<span class="dur" style="width:${x(real) - x(s)}px" aria-hidden="true"></span>` : ""}<span class="t">${esc(timeLabel(e))}</span><span class="n">${esc(e.title)}</span>
          ${isSaved || clash || e.status !== "verified" ? `<span class="flag">${clash ? "⚠" : ""}${isSaved ? "★" : ""}${e.status === "provisional" ? " ?" : ""}</span>` : ""}
          <span class="visually-hidden">${esc(REL[e.relevance].label)}. ${esc(e.venue)}.${clash ? " Clashes with another saved event." : ""}</span></a>`;
      }).join("")}
      ${now.date === day && now.min >= startH * 60 && now.min <= endH * 60 ? `<span class="tl-now" style="left:${x(now.min)}px"></span>` : ""}
      </div></div></div>`;
  }
  html += `</div><p class="tl-hint">Scroll sideways to see the whole day. Short sessions are widened so you can read them; the dark bar along the top of a block shows its real length. Select any block for details, or switch to Agenda for overlaps grouped together.</p>`;
  return html;
}

// ---------------------------------------------------------------- EVENTS DIRECTORY
const FILTERS = [
  { key: "rel", label: "Relevance", opts: REL, get: (e) => [e.relevance], lab: (v) => v.label },
  { key: "day", label: "Day", opts: null, get: (e) => eventDays(e) },
  { key: "kind", label: "Kind", opts: KIND, get: (e) => [kindOf(e)] },
  { key: "type", label: "Side-event format", opts: Object.fromEntries(Object.entries(TYPE).filter(([k]) => !["official", "exhibition", "side-event"].includes(k))), get: (e) => [e.type] },
  { key: "aud", label: "Audience", opts: AUD, get: (e) => e.audiences },
  { key: "eco", label: "Ecosystem", opts: ECO, get: (e) => e.ecosystems },
  { key: "acc", label: "Access", opts: ACCESS, get: (e) => [e.access] },
  { key: "status", label: "Verification", opts: STATUS, get: (e) => [e.status], lab: (v) => v.label },
  { key: "topic", label: "Topic", opts: TOPIC, get: (e) => e.topics, hidden: true },
];
/** Filters offered on the calendar (the day is already chosen; Kind comes first and is always shown). */
const CAL_FILTERS = ["kind", "rel", "acc", "eco", "aud", "type"].map((k) => FILTERS.find((f) => f.key === k));
let calMoreOpen = false;
const filterOpts = (f) => (f.key === "day" ? Object.fromEntries(D.days.map((d) => [d.date, d.label])) : f.opts);
const optLabel = (f, k) => { const v = filterOpts(f)[k] ?? (f.key === "type" ? TYPE[k] : k); return f.lab ? f.lab(v) : v; };
const selected = (q) => Object.fromEntries(FILTERS.map((f) => [f.key, (q.get(f.key) || "").split(",").filter(Boolean)]));

function applyFilters(q) {
  const sel = selected(q), text = q.get("q") || "";
  return D.events.filter((e) => FILTERS.every((f) => !sel[f.key].length || f.get(e).some((v) => sel[f.key].includes(v))) && (!text || matches(e._hay, text)));
}

function filterGroups(q) {
  const sel = selected(q);
  return FILTERS.filter((f) => !f.hidden || sel[f.key].length).map((f) => {
    const opts = Object.keys(filterOpts(f)).filter((k) => D.events.some((e) => f.get(e).includes(k)));
    return `<fieldset class="filter-group"><legend>${esc(f.label)}</legend><div class="opts">${opts.map((k) => {
      const n = D.events.filter((e) => f.get(e).includes(k)).length;
      return `<button type="button" class="toggle" data-filter="${f.key}" data-v="${k}" aria-pressed="${sel[f.key].includes(k)}">${f.key === "rel" ? `<i class="rel-dot dot-${k}"></i>` : ""}${esc(optLabel(f, k))} <span class="n">${n}</span></button>`;
    }).join("")}</div></fieldset>`;
  }).join("");
}

function events(parts, q) {
  if (parts[0]) return eventDetail(parts[0]);
  setMeta("Events directory", "Search and filter every prediction-market event, TOKEN2049 session and side event across TOKEN2049 Singapore week.");
  return `
  <h1>Events directory</h1>
  <p class="lede">Every event and session in the directory. Filter by relevance, day, audience, ecosystem or access, or just search.</p>
  <div class="search-box" style="margin-top:14px">${SEARCH_ICON}<label class="visually-hidden" for="ev-search">Search events</label>
    <input id="ev-search" type="search" placeholder="Try Kalshi, market maker, sports, Thursday…" value="${esc(q.get("q") || "")}" autocomplete="off" enterkeyhint="search"></div>
  <div class="filter-bar"><button type="button" class="btn btn-small filter-open-btn" data-open-filters>Filters <span data-filter-count></span></button><div class="active-filters" data-active></div></div>
  <div class="dir-layout">
    <aside class="filter-panel" aria-label="Filters" data-filters>${filterGroups(q)}</aside>
    <div data-results aria-live="polite">${eventResults(q)}</div>
  </div>
  <dialog class="sheet" id="filter-sheet" aria-label="Filter events">
    <div class="sheet-head"><strong>Filters</strong><button type="button" class="icon-btn" data-close aria-label="Close filters">✕</button></div>
    <div class="sheet-body" data-filters>${filterGroups(q)}</div>
    <div class="sheet-foot"><button type="button" class="btn" data-clear>Clear all</button><button type="button" class="btn btn-primary" data-close style="flex:1" data-show-count>Show results</button></div>
  </dialog>`;
}

function eventResults(q) {
  const list = applyFilters(q);
  const text = q.get("q") || "";
  let also = "";
  if (text) {
    const ps = [...D.people.values()].filter((p) => matches(norm(`${p.name} ${p.role || ""} ${D.companies.get(p.org)?.name || ""} ${p.org_label || ""}`), text));
    const cs = [...D.companies.values()].filter((c) => matches(norm(`${c.name} ${GROUP[c.category]}`), text));
    if (ps.length || cs.length)
      also = `<p class="also-matches">Also matching: ${[...cs.slice(0, 6).map((c) => `<a class="chip chip-outline" href="#/companies/${c.id}">${esc(c.name)}</a>`), ...ps.slice(0, 8).map((p) => `<a class="chip chip-outline" href="#/people/${p.id}">${esc(p.name)}</a>`)].join(" ")}</p>`;
  }
  if (!list.length) return `${also}<p class="empty">No events match. <button type="button" class="btn btn-small" data-clear>Clear filters</button></p>`;
  let html = `${also}<p class="result-count">${plural(list.length, "event")}</p>`;
  for (const d of D.days) {
    const day = list.filter((e) => e.date === d.date);
    if (!day.length) continue;
    html += `<section class="day-group prog-sect"><h2 class="prog-sect-head"><span>${esc(d.long)}</span><small>${plural(day.length, "listing")} · ${esc(d.note)}</small></h2><div class="programme-list">${day.map((e) => progItem(e)).join("")}</div></section>`;
  }
  return html;
}

afterRender.events = (parts) => {
  if (parts[0]) return bindDetail(parts[0]);
  const sheet = document.getElementById("filter-sheet");
  const refresh = (focusSel) => {
    const { q } = parseHash();
    document.querySelector("[data-results]").innerHTML = eventResults(q);
    document.querySelectorAll("[data-filters]").forEach((el) => (el.innerHTML = filterGroups(q)));
    const sel = selected(q);
    const active = FILTERS.flatMap((f) => sel[f.key].map((v) => [f, v]));
    document.querySelector("[data-active]").innerHTML = active.map(([f, v]) => `<button type="button" data-filter="${f.key}" data-v="${v}" aria-label="Remove filter ${esc(optLabel(f, v))}">${esc(optLabel(f, v))} ✕</button>`).join("");
    document.querySelector("[data-filter-count]").textContent = active.length ? `(${active.length})` : "";
    document.querySelector("[data-show-count]").textContent = `Show ${plural(applyFilters(q).length, "result")}`;
    if (focusSel) document.querySelector(focusSel)?.focus();
  };
  const toggle = (key, v) => {
    const { q } = parseHash();
    const cur = new Set((q.get(key) || "").split(",").filter(Boolean));
    cur.has(v) ? cur.delete(v) : cur.add(v);
    cur.size ? q.set(key, [...cur].join(",")) : q.delete(key);
    setQuery(q);
  };
  PAGE.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-filter]");
    if (b) {
      const inSheet = !!b.closest("dialog");
      toggle(b.dataset.filter, b.dataset.v);
      refresh(inSheet ? `dialog [data-filter="${b.dataset.filter}"][data-v="${b.dataset.v}"]` : b.closest("[data-active]") ? "#ev-search" : `.filter-panel [data-filter="${b.dataset.filter}"][data-v="${b.dataset.v}"]`);
      return;
    }
    if (ev.target.closest("[data-clear]")) {
      const { q } = parseHash();
      FILTERS.forEach((f) => q.delete(f.key));
      q.delete("q");
      document.getElementById("ev-search").value = "";
      setQuery(q);
      refresh();
      return;
    }
    if (ev.target.closest("[data-open-filters]")) sheet.showModal();
    if (ev.target.closest("#filter-sheet [data-close]")) sheet.close();
  });
  sheet.addEventListener("click", (ev) => { if (ev.target === sheet) sheet.close(); });
  let t;
  document.getElementById("ev-search").addEventListener("input", (ev) => {
    clearTimeout(t);
    t = setTimeout(() => {
      const { q } = parseHash();
      ev.target.value.trim() ? q.set("q", ev.target.value.trim()) : q.delete("q");
      setQuery(q);
      refresh();
    }, 150);
  });
  refresh();
};

// ---------------------------------------------------------------- EVENT DETAIL
function relatedEvents(e) {
  const inter = (a, b) => a.filter((x) => b.includes(x)).length;
  return D.events.filter((o) => o.id !== e.id && o.status !== "provisional").map((o) => ({
    o,
    s: inter(e.ecosystems, o.ecosystems) * 3 + inter(e.stack_layers, o.stack_layers) * 2 + inter(e.topics, o.topics) + inter(e.audiences, o.audiences) * 0.5 +
      (o.relevance === "core" ? 1 : o.relevance === "strong" ? 0.5 : 0) + (o.date === e.date ? 0.5 : 0) +
      inter(e.people.map((p) => p.id), o.people.map((p) => p.id)) * 3 + inter(e.companies.map((c) => c.id), o.companies.map((c) => c.id)) * 2,
  })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.o);
}

/** "Add to calendar" as one button: a small menu with .ics (Apple, Outlook) and Google. */
function calMenu(e) {
  const g = HOOKS.gcalUrl?.(e);
  return `<details class="pa-menu"><summary class="pa-btn">Add to calendar</summary><div class="pa-menu-list">
    <button type="button" data-ics="${e.id}">Apple or Outlook (.ics)</button>${g ? `<a href="${esc(g)}" target="_blank" rel="noopener">Google Calendar ↗</a>` : ""}</div></details>`;
}

function eventDetail(id) {
  const e = D.ev.get(id);
  if (!e) return notFound();
  setMeta(e.title, `${dayRange(e)}, ${timeLabel(e)} SGT · ${e.venue}. ${e.summary}`);
  const d = dayOf(e.date);
  const srcs = e.sources.map((s) => D.sources.get(s)).filter(Boolean);
  const clashes = D.clash.get(e.id) || [];
  const block = icsBlocker(e);
  const map = e.map_query ? encodeURIComponent(e.map_query) : null;
  const related = relatedEvents(e);
  const primaryLabel = e.type === "official" ? "Official agenda" : kindOf(e) === "booth" ? "Exhibitor page" : "Registration page";
  const acts = `${srcs[0] ? `<a class="pa-primary" href="${esc(srcs[0].url)}" rel="noopener" target="_blank">${primaryLabel} <span aria-hidden="true">↗</span></a>` : ""}
    ${saveBtn(e, true)}
    <div class="pa-row">${block ? `<button type="button" class="pa-btn" aria-disabled="true" data-ics-blocked="${esc(block)}" title="${esc(block)}">Add to calendar</button>` : calMenu(e)}<button type="button" class="pa-btn" data-share="${e.id}">Share</button></div>
    ${HOOKS.eventActions?.(e) || ""}`;
  if (!e.status.match(/provisional/) && e.start) {
    const off = (t) => `${e.date}T${t}:00+08:00`;
    setLD({
      "@context": "https://schema.org", "@type": "Event", name: e.title, description: e.summary, startDate: off(e.start),
      ...(e.end ? { endDate: off(e.end) } : {}), eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled",
      location: { "@type": "Place", name: e.venue, address: { "@type": "PostalAddress", addressLocality: "Singapore", addressCountry: "SG" } },
      url: absUrl(evUrl(e)), ...(e.people.length ? { performer: e.people.filter((p) => p.role === "speaker" || p.role === "moderator").map((p) => ({ "@type": "Person", name: D.people.get(p.id).name })) } : {}),
    });
  }
  return `<a class="back-link" href="#/events" data-back>← Back</a>
  <div class="detail detail-calm">
    <article>
      <div class="chip-row">${kindChip(e)}${scoreChip(e)}${relChip(e.relevance)}${e.official && e.type !== "official" ? `<span class="chip chip-official">TOKEN2049 official</span>` : ""}${updatedBadge(e)}</div>
      <h1>${esc(e.title)}</h1>
      <p class="standfirst">${esc(e.why)}</p>
      <dl class="fact-strip">
        <div><dt>When</dt><dd><b>${esc(e.end_date ? dayRange(e) : d.long)}</b><span class="mono">${esc(timeLabel(e))} SGT</span></dd></div>
        <div><dt>Where</dt><dd><b>${esc(e.venue)}</b>${map ? `<span><a href="https://www.google.com/maps/search/?api=1&query=${map}" rel="noopener" target="_blank">Google Maps</a> · <a href="https://maps.apple.com/?q=${map}" rel="noopener" target="_blank">Apple Maps</a></span>` : ""}</dd></div>
        <div><dt>Getting in</dt><dd><b>${esc(ACCESS[e.access])}</b>${accessExtra(e) ? `<span>${esc(accessExtra(e))}</span>` : ""}</dd></div>
        <div><dt>Format</dt><dd><b>${esc(formatOf(e) || KIND[kindOf(e)])}</b></dd></div>
      </dl>
      <div class="plan-actions plan-actions-inline">${acts}</div>
      ${HOOKS.eventExtras?.(e) || ""}
      ${e.status === "provisional" || e.status === "conflict"
        ? `<p class="notice" style="margin-top:16px"><strong>${esc(STATUS[e.status].label)}.</strong> ${esc(e.status_note || STATUS[e.status].desc)}</p>`
        : `<p class="verify-line verify-inline"><span class="verify-dot" aria-hidden="true"></span><strong>${esc(STATUS[e.status].label)}.</strong> ${esc(e.status_note || STATUS[e.status].desc)}</p>`}

      <section><h2>What it is</h2><p>${esc(e.summary)}</p></section>

      ${e.questions?.length ? `<section><h2>Questions worth asking</h2><ul class="questions">${e.questions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}

      ${clashes.length || e.clash_note ? `<section><h2>Clashes</h2>
        ${e.clash_note ? `<p class="notice">${esc(e.clash_note)}</p>` : ""}
        ${clashes.length ? (clashes.length > 3
          ? `<details class="fold"><summary>Overlaps ${plural(clashes.length, "other listing")}: show them</summary><div class="row-list">${clashes.map((o) => eventRow(o)).join("")}</div></details>`
          : `<p class="small muted">Overlaps ${plural(clashes.length, "other listing")}:</p><div class="row-list">${clashes.map((o) => eventRow(o)).join("")}</div>`) : ""}</section>` : ""}

      ${expectThere(e)}

      ${e.companies.length ? `<section><h2>Companies</h2><div class="co-list">${e.companies.map((x) => companyMini(D.companies.get(x.id), CROLE[x.role])).join("")}</div></section>` : ""}

      <section class="more-detail"><h2>More detail</h2>
      <details class="fold"><summary>Topics and audiences</summary><div class="chip-row" style="margin-top:10px">
        ${e.ecosystems.map((x) => `<a class="chip chip-outline" href="#/events?eco=${x}">${esc(ECO[x])}</a>`).join("")}
        ${e.audiences.map((x) => `<a class="chip" href="#/events?aud=${x}">${esc(AUD[x])}</a>`).join("")}
        ${e.topics.map((x) => `<a class="chip" href="#/events?topic=${x}">${esc(TOPIC[x])}</a>`).join("")}
        ${e.stack_layers.map((x) => `<a class="chip chip-outline" href="#/stack/${x}">Stack: ${esc(D.layer.get(x).name)}</a>`).join("")}
      </div></details>
      ${srcs.length ? `<details class="fold"><summary>Sources (${srcs.length})</summary><ul class="source-list" style="margin-top:10px">${srcs.map(sourceItem).join("")}</ul></details>` : `<p class="notice">No first-party source has been found for this listing.</p>`}
        <p class="small muted" style="margin-top:10px">Last checked ${esc(fmtDate(e.last_updated))}. <a href="${issueUrl("correction.yml", { title: `Correction: ${e.title}`, record: `events/${e.id}` })}" rel="noopener">Report a correction</a></p></section>

      ${related.length ? `<section><h2>Related events</h2><div class="event-list">${related.map((o) => eventCard(o, { compact: true })).join("")}</div></section>` : ""}
    </article>

    <aside class="plan" aria-label="Plan it">
      <div class="plan-card">
        <p class="plan-title">Plan it</p>
        <p class="plan-when"><b>${esc(e.end_date ? dayRange(e) : d.long)}</b><span class="mono">${esc(timeLabel(e))} SGT</span></p>
        <p class="plan-where">${esc(e.venue)}</p>
        <div class="plan-actions">${acts}</div>
        <dl class="plan-facts">
          <div><dt>Relevance</dt><dd><span class="score-line"><b class="score-big">${e.score}<small>/10</small></b><span class="score-meter" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < e.score ? "on" : ""}"></i>`).join("")}</span></span><b>${esc(REL[e.relevance].label)}</b><span>${esc(REL[e.relevance].desc)}</span></dd></div>
          <div><dt>Verification</dt><dd><b>${esc(STATUS[e.status].label)}</b><span>${esc(e.status_note || STATUS[e.status].desc)}</span></dd></div>
          ${clashes.length ? `<div><dt>Clashes</dt><dd><b>${plural(clashes.length, "overlapping listing")}</b><span>See Clashes below.</span></dd></div>` : ""}
          ${e.people.length ? `<div><dt>People</dt><dd><b>${plural(e.people.length, "person", "people")} named</b><span>See who you can expect there below.</span></dd></div>` : ""}
        </dl>
      </div>
    </aside>
  </div>`;
}
/** The access note minus any words that just repeat the access label ("Invite-only; cap of 200" → "Cap of 200"). */
function accessExtra(e) {
  const note = (e.access_note || "").trim(), label = ACCESS[e.access] || "";
  const squash = (t) => t.toLowerCase().replace(/[^a-z]/g, "");
  if (!note || squash(note) === squash(label)) return "";
  const parts = note.split(/;\s*/).filter((p) => squash(p) && squash(p) !== squash(label) && !squash(label).startsWith(squash(p)));
  const rest = parts.join("; ");
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}
/** "People you can expect there": named hosts/speakers or people with evidence for this specific event. */
function expectThere(e) {
  const att = D.attByEvent.get(e.id) || [];
  const attP = new Set(att.filter((a) => a.person_id && a.confidence === "confirmed").map((a) => a.person_id));
  const firm = e.people.filter((x) => x.role !== "listed" || attP.has(x.id));
  const soft = e.people.filter((x) => x.role === "listed" && !attP.has(x.id));
  const orgs = att.filter((a) => !a.person_id && a.confidence === "confirmed");
  if (!firm.length && !soft.length && !orgs.length && !e.also_listed.length) return "";
  const mini = (x) => { const p = D.people.get(x.id); const org = D.companies.get(p.org); return `<a class="mini" href="#/people/${p.id}"><span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong><span>${esc(PROLE[x.role])}${org ? ` · ${esc(org.name)}` : p.org_label ? ` · ${esc(p.org_label)}` : ""}</span></span></a>`; };
  return `<section><h2>People you can expect there</h2>
    ${firm.length ? `<div class="person-list">${firm.map(mini).join("")}</div>` : `<p class="small muted">No individuals are publicly named for this event yet.</p>`}
    ${orgs.length ? `<p class="small" style="margin-top:10px"><span class="muted">Organisations with public evidence:</span> ${orgs.map((a) => `<a href="#/companies/${a.company_id}">${esc(D.companies.get(a.company_id).name)}</a> (${esc(AST[a.attendance_status].label.toLowerCase())})`).join(", ")}</p>` : ""}
    ${soft.length ? `<h3 style="margin-top:16px;font-size:.9rem">Listed in connection with this event</h3><p class="small muted">Named in our sources, but their role or attendance isn’t confirmed.</p><div class="person-list">${soft.map(mini).join("")}</div>` : ""}
    ${e.also_listed.length ? `<p class="small" style="margin-top:10px"><span class="muted">Audience described in listings:</span> ${e.also_listed.map(esc).join(", ")}</p>` : ""}
    <p class="small" style="margin-top:8px"><a href="#/going">See everyone going →</a></p></section>`;
}

function sourceItem(s) {
  return `<li><span class="type">${esc(s.type)}</span><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.name)} ↗</a><p>${esc(s.note)}</p></li>`;
}
function bindDetail() {}

// ---------------------------------------------------------------- PEOPLE
const groupOrder = Object.keys(GROUP);
const personScore = (p) => {
  const ev = D.personEvents.get(p.id) || [];
  return (p.group === "speakers" ? 100 : groupOrder.indexOf(p.group) * 10) - ev.filter((x) => x.event.relevance === "core").length * 3 - ev.length;
};
function people(parts, q) {
  if (parts[0]) return personDetail(parts[0]);
  setMeta("People", "People speaking at or listed for prediction-market events and sessions during TOKEN2049 Singapore week.");
  const g = q.get("g") || "", text = q.get("q") || "";
  const all = [...D.people.values()].sort((a, b) => personScore(a) - personScore(b) || a.name.localeCompare(b.name));
  const groups = groupOrder.filter((k) => all.some((p) => p.group === k));
  const list = all.filter((p) => (!g || p.group === g) && (!text || matches(norm(`${p.name} ${p.role || ""} ${p.org_label || ""} ${D.companies.get(p.org)?.name || ""} ${p.why || ""}`), text)));
  return `<h1>People</h1>
  <p class="lede">Speakers and people listed for the events in this directory. We only show affiliations and roles recorded in our sources, and we don’t assume anyone is attending an event just because their company is involved.</p>
  <div class="search-box" style="margin:14px 0">${SEARCH_ICON}<label class="visually-hidden" for="p-search">Search people</label><input id="p-search" type="search" placeholder="Search by name or company…" value="${esc(text)}" autocomplete="off"></div>
  <div class="chip-row" role="group" aria-label="Filter by group" style="margin-bottom:16px"><a class="toggle" href="#/people" aria-pressed="${!g}">All <span class="n">${all.length}</span></a>${groups.map((k) => `<a class="toggle" href="#/people?g=${k}" aria-pressed="${g === k}">${esc(GROUP[k])} <span class="n">${all.filter((p) => p.group === k).length}</span></a>`).join("")}</div>
  <div data-list>${peopleList(list)}</div>`;
}
function peopleList(list) {
  if (!list.length) return `<p class="empty">No one matches.</p>`;
  return `<div class="grid grid-3">${list.map((p) => {
    const org = D.companies.get(p.org);
    const ev = D.personEvents.get(p.id) || [];
    return `<article class="card"><h3><a href="#/people/${p.id}">${esc(p.name)}</a></h3>
      <p class="org">${esc([p.role || (org ? org.name : p.org_label)].filter(Boolean).join(""))}</p>
      ${p.why ? `<p class="why">${esc(p.why)}</p>` : ""}
      <p class="apps">${ev.slice(0, 3).map((x) => `${esc(dayOf(x.event.date).label.slice(0, 3))} ${esc(x.event.start || "")} · ${esc(x.event.title)}`).join("<br>")}${ev.length > 3 ? `<br>+${ev.length - 3} more` : ""}</p>
      <div class="chip-row"><span class="chip">${esc(GROUP[p.group])}</span>${p.note ? `<span class="chip chip-warn">Confirm</span>` : ""}</div></article>`;
  }).join("")}</div>`;
}
afterRender.people = (parts) => {
  if (parts[0]) return;
  const input = document.getElementById("p-search");
  input.addEventListener("input", () => {
    const { q } = parseHash();
    input.value.trim() ? q.set("q", input.value.trim()) : q.delete("q");
    setQuery(q);
    const g = q.get("g") || "", text = q.get("q") || "";
    const list = [...D.people.values()].sort((a, b) => personScore(a) - personScore(b) || a.name.localeCompare(b.name))
      .filter((p) => (!g || p.group === g) && (!text || matches(norm(`${p.name} ${p.role || ""} ${p.org_label || ""} ${D.companies.get(p.org)?.name || ""} ${p.why || ""}`), text)));
    document.querySelector("[data-list]").innerHTML = peopleList(list);
  });
};

function personDetail(id) {
  const p = D.people.get(id);
  if (!p) return notFound();
  const org = D.companies.get(p.org);
  const ev = (D.personEvents.get(p.id) || []).slice().sort((a, b) => sortKey(a.event).localeCompare(sortKey(b.event)));
  setMeta(p.name, `${p.name}${org ? ` (${org.name})` : ""} at TOKEN2049 Singapore week: ${ev.map((x) => x.event.title).join("; ")}`);
  return `<a class="back-link" href="#/people" data-back>← Back</a>
  <div class="detail"><article>
    <div class="chip-row"><span class="chip">${esc(GROUP[p.group])}</span></div>
    <h1>${esc(p.name)}</h1>
    <p class="lede" style="margin:0">${esc(p.role || "")}${p.role && (org || p.org_label) ? " · " : ""}${org ? `<a href="#/companies/${org.id}">${esc(org.name)}</a>` : esc(p.org_label || "")}</p>
    <div class="btn-row" style="margin-top:12px">${HOOKS.personActions?.(p) || ""}</div>
    ${p.note ? `<p class="notice" style="margin-top:14px">${esc(p.note)}</p>` : ""}
    ${p.links?.length ? `<div class="btn-row" style="margin-top:14px">${p.links.map((l) => `<a class="btn btn-small" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</div>` : ""}
    ${(D.attByPerson.get(p.id) || []).length ? `<div class="chip-row" style="margin-top:12px">${[...new Set(D.attByPerson.get(p.id).map((a) => a.attendance_status))].map(evidenceChip).join("")}</div>` : ""}
    ${p.why ? `<section><h2>Why they’re relevant</h2><p>${esc(p.why)}</p></section>` : ""}
    ${whereToFind(D.attByPerson.get(p.id), p.name)}
    <section><h2>Event appearances</h2>${ev.length ? `<div class="event-list">${ev.map((x) => `<div><p class="small muted" style="margin:0 0 4px">${esc(PROLE[x.role])}</p>${eventCard(x.event, { compact: true })}</div>`).join("")}</div>` : `<p class="muted">No events recorded.</p>`}</section>
    ${p.sources.length ? `<section><h2>Sources</h2><ul class="source-list">${p.sources.map((s) => D.sources.get(s)).filter(Boolean).map(sourceItem).join("")}</ul>
    <p class="small muted" style="margin-top:10px"><a href="${issueUrl("correction.yml", { title: `Correction: ${p.name}`, record: `people/${p.id}` })}" rel="noopener">Report a correction</a></p></section>` : ""}
  </article>
  <aside>${org ? `<div class="facts"><p class="eyebrow">Organisation</p>${companyMini(org)}<p class="small" style="margin-top:10px">${esc(org.description)}</p></div>` : ""}</aside></div>`;
}

// ---------------------------------------------------------------- COMPANIES
const catOrder = Object.keys(GROUP);
function companies(parts, q) {
  if (parts[0]) return companyDetail(parts[0]);
  setMeta("Companies", "Prediction-market platforms, market makers, infrastructure and institutional firms appearing across TOKEN2049 Singapore week.");
  const c = q.get("c") || "", eco = q.get("eco") || "", text = q.get("q") || "";
  const all = [...D.companies.values()].sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category) || (D.companyEvents.get(b.id).length - D.companyEvents.get(a.id).length) || a.name.localeCompare(b.name));
  const cats = catOrder.filter((k) => all.some((x) => x.category === k));
  const list = all.filter((x) => (!c || x.category === c) && (!eco || x.ecosystems.includes(eco)) && (!text || matches(norm(`${x.name} ${x.description}`), text)));
  const link = (over) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(over)) v ? n.set(k, v) : n.delete(k); const s = n.toString(); return `#/companies${s ? "?" + s : ""}`; };
  return `<h1>Companies</h1>
  <p class="lede">Organisations that matter to prediction markets and appear across TOKEN2049 week, whether as hosts, sponsors, exhibitors, speakers’ employers, listed partners or layers of the stack.</p>
  <div class="search-box" style="margin:14px 0">${SEARCH_ICON}<label class="visually-hidden" for="c-search">Search companies</label><input id="c-search" type="search" placeholder="Search companies…" value="${esc(text)}" autocomplete="off"></div>
  <div class="chip-row" role="group" aria-label="Filter by category" style="margin-bottom:8px"><a class="toggle" href="${link({ c: "" })}" aria-pressed="${!c}">All <span class="n">${all.length}</span></a>${cats.map((k) => `<a class="toggle" href="${link({ c: k })}" aria-pressed="${c === k}">${esc(GROUP[k])} <span class="n">${all.filter((x) => x.category === k).length}</span></a>`).join("")}</div>
  <div class="chip-row" role="group" aria-label="Filter by ecosystem" style="margin-bottom:16px">${Object.entries(ECO).map(([k, v]) => `<a class="toggle" href="${link({ eco: eco === k ? "" : k })}" aria-pressed="${eco === k}">${esc(v)}</a>`).join("")}</div>
  <div data-list>${companyList(list)}</div>`;
}
function companyList(list) {
  if (!list.length) return `<p class="empty">No companies match.</p>`;
  return `<div class="grid grid-3">${list.map((c) => {
    const ev = D.companyEvents.get(c.id);
    return `<article class="card"><h3><a href="#/companies/${c.id}">${esc(c.name)}</a></h3><p class="org">${esc(GROUP[c.category])}</p><p class="why">${esc(c.description)}</p>
      <p class="apps">${ev.length ? plural(ev.length, "event") : "No TOKEN2049-week event recorded"}${c.stack_layers.length ? ` · Stack: ${c.stack_layers.map((l) => esc(D.layer.get(l).name)).join(", ")}` : ""}</p>
      ${c.ecosystems.length ? `<div class="chip-row">${c.ecosystems.map((x) => `<span class="chip">${esc(ECO[x])}</span>`).join("")}</div>` : ""}</article>`;
  }).join("")}</div>`;
}
afterRender.companies = (parts) => {
  if (parts[0]) return;
  const input = document.getElementById("c-search");
  input.addEventListener("input", () => {
    const { q } = parseHash();
    input.value.trim() ? q.set("q", input.value.trim()) : q.delete("q");
    setQuery(q);
    const c = q.get("c") || "", eco = q.get("eco") || "", text = q.get("q") || "";
    const list = [...D.companies.values()].sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category) || (D.companyEvents.get(b.id).length - D.companyEvents.get(a.id).length) || a.name.localeCompare(b.name))
      .filter((x) => (!c || x.category === c) && (!eco || x.ecosystems.includes(eco)) && (!text || matches(norm(`${x.name} ${x.description}`), text)));
    document.querySelector("[data-list]").innerHTML = companyList(list);
  });
};

function companyDetail(id) {
  const c = D.companies.get(id);
  if (!c) return notFound();
  const ev = D.companyEvents.get(c.id).slice().sort((a, b) => sortKey(a.event).localeCompare(sortKey(b.event)));
  const ppl = D.companyPeople.get(c.id);
  // Platform companies whose id is also an ecosystem key (kalshi, polymarket, hyperliquid)
  const ecoKey = ECO[c.id] ? c.id : null;
  const ecoEvents = ecoKey ? D.events.filter((e) => e.ecosystems.includes(ecoKey) && !ev.some((x) => x.event.id === e.id)) : [];
  setMeta(c.name, `${c.name} at TOKEN2049 Singapore week: ${c.description}`);
  return `<a class="back-link" href="#/companies" data-back>← Back</a>
  <div class="detail"><article>
    <div class="chip-row"><span class="chip">${esc(GROUP[c.category])}</span>${c.ecosystems.map((x) => `<a class="chip chip-outline" href="#/events?eco=${x}">${esc(ECO[x])}</a>`).join("")}</div>
    <h1>${esc(c.name)}</h1>
    <p class="lede">${esc(c.description)}</p>
    ${c.note ? `<p class="notice">${esc(c.note)}</p>` : ""}
    ${(D.attByCompany.get(c.id) || []).length ? `<div class="chip-row">${[...new Set(D.attByCompany.get(c.id).map((a) => a.attendance_status))].map(evidenceChip).join("")}</div>` : ""}
    ${whereToFind(D.attByCompany.get(c.id), c.name)}
    <section><h2>At TOKEN2049 week</h2>${ev.length ? `<div class="event-list">${ev.map((x) => `<div><p class="small muted" style="margin:0 0 4px">${x.role === "via" ? `Via ${esc(D.people.get(x.via).name)} (${esc(PROLE[x.viaRole].toLowerCase())})` : esc(CROLE[x.role])}</p>${eventCard(x.event, { compact: true })}</div>`).join("")}</div>` : `<p class="muted">No TOKEN2049-week event is recorded for this organisation. It’s included for its place in the prediction-market stack.</p>`}</section>
    ${ecoEvents.length ? `<section><h2>Elsewhere in the ${esc(ECO[ecoKey])} ecosystem</h2><p class="small muted">Tagged to this ecosystem, but ${esc(c.name)} isn’t listed as a host, sponsor or speaker.</p><div class="event-list">${ecoEvents.map((e) => eventCard(e, { compact: true })).join("")}</div></section>` : ""}
    ${ppl.length ? `<section><h2>People</h2><div class="person-list">${ppl.map(personMini).join("")}</div></section>` : ""}
    ${c.stack_layers.length ? `<section><h2>Where it fits in the stack</h2><div class="chip-row">${c.stack_layers.map((l) => `<a class="chip chip-outline" href="#/stack/${l}">${esc(D.layer.get(l).name)}</a>`).join("")}</div></section>` : ""}
    <section><h2>Sources</h2>${c.sources.length ? `<ul class="source-list">${c.sources.map((s) => D.sources.get(s)).filter(Boolean).map(sourceItem).join("")}</ul>` : `<p class="muted small">No dedicated source link is recorded. The description is based on the event listings above.</p>`}
    <p class="small muted" style="margin-top:10px"><a href="${issueUrl("correction.yml", { title: `Correction: ${c.name}`, record: `companies/${c.id}` })}" rel="noopener">Report a correction</a></p></section>
  </article><aside></aside></div>`;
}

// ---------------------------------------------------------------- STACK
function stack(parts) {
  const open = parts[0] && D.layer.has(parts[0]) ? parts[0] : null;
  const L = open ? D.layer.get(open) : null;
  setMeta(L ? `Stack: ${L.name}` : "The prediction-market stack", L ? L.plain : "An interactive map of the layers that make prediction markets work, from distribution to clearing, with the companies, sessions and people in each.");
  return `<h1>The prediction-market stack</h1>
  <p class="lede">A prediction market is more than an app. Below the website sit liquidity providers, data networks, oracles, clearing firms and risk systems. Select a layer to see who’s in it and where to find them during TOKEN2049 week.</p>
  <p class="small muted">Layers follow the source research. The “signal” lines describe what’s changing and the questions are still open; neither is settled fact.</p>
  <div class="stack" style="margin-top:20px">${D.stack.map((l) => layerBlock(l, l.id === open)).join("")}</div>`;
}
function layerBlock(l, isOpen) {
  const cos = l.companies.map((c) => D.companies.get(c)).filter(Boolean);
  const evs = D.events.filter((e) => e.stack_layers.includes(l.id));
  const off = evs.filter((e) => e.type === "official"), side = evs.filter((e) => e.type !== "official");
  const ppl = [...new Map(cos.flatMap((c) => D.companyPeople.get(c.id)).map((p) => [p.id, p])).values()];
  return `<div class="layer" id="layer-${l.id}">
    <button type="button" class="layer-btn" aria-expanded="${isOpen}" aria-controls="lb-${l.id}" data-layer="${l.id}">
      <span><strong>${esc(l.name)}</strong><span class="cos">${esc(cos.map((c) => c.name).join(", "))}</span></span><span class="caret" aria-hidden="true">▾</span></button>
    <div class="layer-body" id="lb-${l.id}" ${isOpen ? "" : "hidden"}>
      <p>${esc(l.plain)}</p>
      <p class="signal"><strong>What’s changing:</strong> ${esc(l.signal)}</p>
      <p class="notice info"><strong>Open question:</strong> ${esc(l.question)}</p>
      <h3>Companies</h3><div class="co-list">${cos.map((c) => companyMini(c)).join("")}</div>
      ${off.length ? `<h3>TOKEN2049 sessions</h3><div class="event-list">${off.map((e) => eventCard(e, { compact: true })).join("")}</div>` : ""}
      ${side.length ? `<h3>Side events</h3><div class="event-list">${side.map((e) => eventCard(e, { compact: true })).join("")}</div>` : ""}
      ${ppl.length ? `<h3>People</h3><div class="person-list">${ppl.map(personMini).join("")}</div>` : ""}
      ${l.sources.length ? `<h3>Evidence</h3><ul class="source-list">${l.sources.map((s) => D.sources.get(s)).filter(Boolean).map(sourceItem).join("")}</ul>` : ""}
    </div></div>`;
}
afterRender.stack = (parts) => {
  PAGE.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", on);
    document.getElementById(`lb-${b.dataset.layer}`).hidden = !on;
    if (on) history.replaceState(null, "", `#/stack/${b.dataset.layer}`);
  }));
  if (parts[0]) document.getElementById(`layer-${parts[0]}`)?.scrollIntoView({ block: "start" });
};

// ---------------------------------------------------------------- WHO'S GOING
const AST = {
  official_speaker: { label: "Official speaker", desc: "Named on the official TOKEN2049 programme." },
  publicly_attending: { label: "Publicly attending", desc: "Has said publicly that they will attend TOKEN2049 Singapore 2026." },
  company_attending: { label: "Company team attending", desc: "The company’s own site or account says its team will be at TOKEN2049. Individual employees aren’t inferred unless the company names them." },
  exhibitor: { label: "Exhibitor", desc: "Officially listed as an exhibitor. This proves the organisation is present, not any particular person." },
  sponsor: { label: "Sponsor / partner", desc: "Officially listed as a TOKEN2049 sponsor or partner. This proves the organisation is present, not any particular person." },
  side_event_host: { label: "Side-event host", desc: "Publicly named as the host of an event during TOKEN2049 week." },
  side_event_speaker: { label: "Side-event speaker", desc: "Publicly named as a speaker at a relevant side event." },
  confirmed_participant: { label: "Confirmed participant", desc: "An event organiser has publicly named the organisation or person as a confirmed participant." },
  meeting_signal: { label: "Meeting signal", desc: "Has publicly invited meetings during the week, but hasn’t clearly said they’ll attend." },
  launch_signal: { label: "Launch at TOKEN", desc: "Has announced a launch timed around TOKEN2049. This doesn’t confirm any named person will attend." },
};
const AROLE = {
  founder: "Founder / CEO", trader: "Trader", "market-maker": "Market maker", investor: "Investor", builder: "Builder / engineer",
  institutional: "Institutional markets", infrastructure: "Infrastructure", sports: "Sports", media: "Media / journalist",
  regulation: "Regulation / compliance", business: "Business development", other: "Other",
};
const CTYPE = {
  venue: "Prediction-market venue", "trading-firm": "Trading firm", "market-maker": "Market maker", infrastructure: "Infrastructure",
  data: "Data", oracle: "Oracle / settlement", exchange: "Exchange", institutional: "Institutional finance", sports: "Sports",
  media: "Media", investor: "Investor", compliance: "Compliance", other: "Other",
};
const GECO = { kalshi: "Kalshi", polymarket: "Polymarket", hyperliquid: "Hyperliquid / HIP-4", multi: "Multi-platform", independent: "Independent" };
const TYPE_ROLE = { "market-maker": "market-maker", "trading-firm": "trader", infrastructure: "infrastructure", data: "infrastructure", oracle: "infrastructure", institutional: "institutional", sports: "sports", media: "media", investor: "investor", compliance: "regulation" };
const DISCOVER = [
  ["platforms", "Prediction-market platforms", (g) => g.ctypes.includes("venue") || g.person?.group === "platforms"],
  ["trading", "Traders & market makers", (g) => g.roles.some((r) => r === "trader" || r === "market-maker")],
  ["institutional", "Institutional / market structure", (g) => g.roles.includes("institutional")],
  ["infrastructure", "Infrastructure & data", (g) => g.roles.includes("infrastructure")],
  ["sports", "Sports prediction markets", (g) => g.roles.includes("sports")],
  ["builders", "Builders", (g) => g.roles.includes("builder")],
  ["investors", "Investors", (g) => g.roles.includes("investor")],
  ["media", "Journalists & creators", (g) => g.roles.includes("media")],
];
const RELR = { core: 0, strong: 1, adjacent: 2, wildcard: 3 };

/** One entry per person or company, combining all of its public attendance records. */
function buildGoing() {
  const map = new Map();
  for (const a of D.att) {
    const key = a.person_id ? `p:${a.person_id}` : `c:${a.company_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  const newest = D.site.last_updated;
  const newCut = new Date(Date.parse(newest) - (D.site.new_days || 7) * 864e5).toISOString().slice(0, 10);
  return [...map.entries()].map(([key, recs]) => {
    const person = key.startsWith("p:") ? D.people.get(recs[0].person_id) : null;
    const company = person ? D.companies.get(person.org) : D.companies.get(recs[0].company_id);
    const ctypes = company?.types || [];
    const roles = person ? person.roles || ["other"] : [...new Set(ctypes.map((t) => TYPE_ROLE[t]).filter(Boolean))];
    const ecos = [...new Set(recs.flatMap((a) => a.ecosystems))];
    const first = recs.map((a) => a.first_confirmed).filter(Boolean).sort()[0] || "";
    return {
      key, recs, person, company, ctypes, roles: roles.length ? roles : ["other"],
      id: person ? person.id : company.id, name: person ? person.name : company.name,
      href: person ? `#/people/${person.id}` : `#/companies/${company.id}`,
      rel: recs.map((a) => a.pm_relevance).sort((x, y) => RELR[x] - RELR[y])[0],
      ecos, geco: [...ecos.filter((e) => e !== "independent"), ...(ecos.filter((e) => e !== "independent").length > 1 ? ["multi"] : []), ...(ecos.includes("independent") ? ["independent"] : [])],
      statuses: [...new Set(recs.map((a) => a.attendance_status))],
      dates: [...new Set(recs.flatMap((a) => a.dates))].sort(),
      events: [...new Set(recs.flatMap((a) => a.event_ids))],
      interests: [...new Set(recs.flatMap((a) => a.interests))],
      first, isNew: first >= newCut && first > (D.site.first_published || ""), lastVerified: recs.map((a) => a.last_verified).sort().pop(),
      curator: person?.id === D.site.curator.person_id,
      unverified: recs.every((a) => a.confidence === "unverified"),
    };
  }).sort((a, b) => RELR[a.rel] - RELR[b.rel] || Number(b.isNew) - Number(a.isNew) || a.name.localeCompare(b.name));
}

const GFILTERS = [
  { key: "role", label: "Role", opts: AROLE, get: (g) => g.roles },
  { key: "rel", label: "Prediction-market relevance", opts: { core: "Core prediction markets", strong: "Strongly relevant", adjacent: "Adjacent" }, get: (g) => [g.rel] },
  { key: "eco", label: "Ecosystem", opts: GECO, get: (g) => g.geco },
  { key: "ctype", label: "Company type", opts: CTYPE, get: (g) => g.ctypes },
  { key: "ev", label: "Attendance evidence", opts: Object.fromEntries(Object.entries(AST).map(([k, v]) => [k, v.label])), get: (g) => g.statuses },
  { key: "day", label: "Availability (where evidence gives a day)", opts: null, get: (g) => g.dates },
  { key: "ver", label: "Verification", opts: { confirmed: "Confirmed with a source", unverified: "Unverified lead" }, get: (g) => [g.unverified ? "unverified" : "confirmed"] },
];
const gOpts = (f) => (f.key === "day" ? Object.fromEntries(D.days.map((d) => [d.date, d.label])) : f.opts);
function goingFilter(q) {
  const text = q.get("q") || "", recent = q.get("recent") === "1", grp = DISCOVER.find((d) => d[0] === q.get("g"));
  return D.going.filter((g) =>
    GFILTERS.every((f) => { const sel = (q.get(f.key) || "").split(",").filter(Boolean); return !sel.length || f.get(g).some((v) => sel.includes(v)); }) &&
    (!recent || g.isNew) && (!grp || grp[2](g)) &&
    (!text || matches(norm(`${g.name} ${g.person?.role || ""} ${g.company?.name || ""} ${g.person?.org_label || ""} ${g.recs.map((a) => a.evidence_summary).join(" ")} ${g.interests.join(" ")}`), text)));
}

const evidenceChip = (st) => `<span class="chip chip-ev ev-${st}" title="${esc(AST[st].desc)}">${esc(AST[st].label)}</span>`;
const newChip = (g) => (g.isNew ? `<span class="chip chip-new">New</span>` : "");

function goingCard(g, o = {}) {
  const line = g.person ? (g.person.role || g.company?.name || g.person.org_label || "") : g.ctypes.map((t) => CTYPE[t]).join(" · ");
  const best = g.recs.find((a) => a.attendance_status !== "official_speaker") || g.recs[0];
  const main = g.statuses[0];
  const blurb = g.person?.why || best.evidence_summary;
  return `<article class="card going-card${g.curator ? " is-curator" : ""}">
    <div class="gc-head"><span class="avatar${g.person ? "" : " sq"}" aria-hidden="true">${esc(initials(g.name))}</span>
      <div><h3><a href="${g.href}">${esc(g.name)}</a></h3><p class="org">${esc(line)}</p></div></div>
    <div class="chip-row">${evidenceChip(main)}${g.statuses.length > 1 ? `<span class="chip chip-plain">+${g.statuses.length - 1} more</span>` : ""}${g.unverified ? `<span class="chip chip-warn" title="No public source link yet">Unverified</span>` : ""}${newChip(g)}</div>
    ${o.compact ? "" : `<p class="why">${esc(blurb)}</p>`}
    <p class="apps">${g.dates.length ? `📍 ${g.dates.map((d) => esc(dayOf(d).label.slice(0, 3))).join(", ")}` : "Days not stated"}${g.events.length ? ` · ${plural(g.events.length, "event")}` : ""}${best.source_url && !o.compact ? ` · <a class="proof" href="${esc(best.source_url)}" target="_blank" rel="noopener">Source ↗</a>` : ""}</p>
  </article>`;
}

function going(parts, q) {
  if (q.get("research") === "1") return goingResearch();
  setMeta("Who’s going?", "Prediction-market people, companies and adjacent organisations with public evidence they’ll be in Singapore for TOKEN2049 week.");
  const G = D.going;
  const n = (fn) => G.filter(fn).length;
  const nUnv = n((g) => g.unverified);
  return `<p class="eyebrow">Who’s going?</p>
  <h1>Who’s going to TOKEN2049?</h1>
  <p class="lede"><b>${n((g) => g.person)} people</b> and <b>${n((g) => !g.person)} companies</b> in prediction markets with public evidence they’ll be in Singapore, including ${n((g) => g.roles.some((r) => r === "trader" || r === "market-maker"))} traders and market makers and ${n((g) => g.ctypes.includes("venue"))} prediction-market platforms.</p>
  <p class="trust-line">Not TOKEN2049’s attendee list. Every confirmed entry links to its source${nUnv ? `; ${nUnv} marked Unverified don’t have one yet (<a href="#/going?ver=confirmed">hide them</a>)` : ""}. <a href="#/going?at=evidence">How we check</a> · checked ${esc(fmtDate(D.site.last_updated))}</p>
  <div class="search-box search-lg" style="margin-top:18px">${SEARCH_ICON}<label class="visually-hidden" for="g-search">Search who’s going</label>
    <input id="g-search" type="search" placeholder="Search a name, company or interest, e.g. Kalshi, market maker…" value="${esc(q.get("q") || "")}" autocomplete="off"></div>
  <p class="browse-label">Or browse</p>
  <div class="chip-row chip-scroll" role="group" aria-label="Browse by group" style="margin:0 0 6px">
    <a class="toggle" href="#/going" aria-pressed="${!q.get("g") && q.get("recent") !== "1"}">Everyone</a>
    <a class="toggle" href="#/going?recent=1" aria-pressed="${q.get("recent") === "1"}">✦ Recently confirmed <span class="n">${n((g) => g.isNew)}</span></a>
    ${DISCOVER.map(([k, l, fn]) => `<a class="toggle" href="#/going?g=${k}" aria-pressed="${q.get("g") === k}">${esc(l)} <span class="n">${n(fn)}</span></a>`).join("")}
  </div>
  <div class="filter-bar"><button type="button" class="btn btn-small filter-open-btn" data-open-filters>Filters <span data-filter-count></span></button><div class="active-filters" data-active></div></div>
  <div class="dir-layout">
    <aside class="filter-panel" aria-label="Filters" data-filters>${goingFilterGroups(q)}</aside>
    <div data-results aria-live="polite">${goingResults(q)}</div>
  </div>
  <dialog class="sheet" id="filter-sheet" aria-label="Filter who’s going">
    <div class="sheet-head"><strong>Filters</strong><button type="button" class="icon-btn" data-close aria-label="Close filters">✕</button></div>
    <div class="sheet-body" data-filters>${goingFilterGroups(q)}</div>
    <div class="sheet-foot"><button type="button" class="btn" data-clear>Clear all</button><button type="button" class="btn btn-primary" data-close style="flex:1" data-show-count>Show results</button></div>
  </dialog>
  <section class="section panel" id="evidence"><h2>How we check: evidence types</h2><p class="small muted">These are different kinds of evidence, and they aren’t equivalent.</p>
    <dl class="kv">${Object.entries(AST).map(([k, v]) => `<dt>${evidenceChip(k)}</dt><dd class="small">${esc(v.desc)}</dd>`).join("")}</dl>
    ${promoCard(true)}
    <p class="small" style="margin-top:14px">Announced you’re going? <a href="${issueUrl("attendance.yml")}" rel="noopener">Add yourself with a link to your public post</a>.</p></section>`;
}
function goingFilterGroups(q) {
  return GFILTERS.map((f) => {
    const sel = (q.get(f.key) || "").split(",").filter(Boolean);
    const opts = Object.keys(gOpts(f)).filter((k) => D.going.some((g) => f.get(g).includes(k)));
    if (!opts.length) return "";
    return `<fieldset class="filter-group"><legend>${esc(f.label)}</legend><div class="opts">${opts.map((k) =>
      `<button type="button" class="toggle" data-filter="${f.key}" data-v="${k}" aria-pressed="${sel.includes(k)}">${esc(gOpts(f)[k])} <span class="n">${D.going.filter((g) => f.get(g).includes(k)).length}</span></button>`).join("")}</div></fieldset>`;
  }).join("");
}
function goingResults(q) {
  const list = goingFilter(q);
  const anyFilter = GFILTERS.some((f) => q.get(f.key)) || q.get("q") || q.get("g") || q.get("recent");
  if (!list.length) return `<p class="empty">No one matches. <button type="button" class="btn btn-small" data-clear>Clear filters</button></p>`;
  if (anyFilter) return `<p class="result-count">${plural(list.length, "entry", "entries")}</p><div class="grid grid-2">${list.map((g) => goingCard(g)).join("")}</div>`;
  return DISCOVER.map(([k, l, fn]) => {
    const inGroup = list.filter(fn);
    if (!inGroup.length) return "";
    return `<section class="day-group"><h2 class="day-heading">${esc(l)} <span class="n">${inGroup.length}</span> <a class="small" style="margin-left:auto" href="#/going?g=${k}">See all →</a></h2><div class="grid grid-2">${inGroup.slice(0, 4).map((g) => goingCard(g)).join("")}</div></section>`;
  }).join("") + `<section class="day-group"><h2 class="day-heading">Everyone else <span class="n">${list.filter((g) => !DISCOVER.some((d) => d[2](g))).length}</span></h2><div class="grid grid-2">${list.filter((g) => !DISCOVER.some((d) => d[2](g))).map((g) => goingCard(g, { compact: true })).join("")}</div></section>`;
}
afterRender.going = () => {
  if (!document.getElementById("g-search")) return;
  const sheet = document.getElementById("filter-sheet");
  const refresh = (focusSel) => {
    const { q } = parseHash();
    PAGE.querySelector("[data-results]").innerHTML = goingResults(q);
    PAGE.querySelectorAll("[data-filters]").forEach((el) => (el.innerHTML = goingFilterGroups(q)));
    const active = GFILTERS.flatMap((f) => (q.get(f.key) || "").split(",").filter(Boolean).map((v) => [f, v]));
    PAGE.querySelector("[data-active]").innerHTML = active.map(([f, v]) => `<button type="button" data-filter="${f.key}" data-v="${v}" aria-label="Remove filter ${esc(gOpts(f)[v])}">${esc(gOpts(f)[v])} ✕</button>`).join("");
    PAGE.querySelector("[data-filter-count]").textContent = active.length ? `(${active.length})` : "";
    PAGE.querySelector("[data-show-count]").textContent = `Show ${plural(goingFilter(q).length, "result")}`;
    if (focusSel) PAGE.querySelector(focusSel)?.focus();
  };
  PAGE.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-filter]");
    if (b) {
      const { q } = parseHash();
      const cur = new Set((q.get(b.dataset.filter) || "").split(",").filter(Boolean));
      cur.has(b.dataset.v) ? cur.delete(b.dataset.v) : cur.add(b.dataset.v);
      cur.size ? q.set(b.dataset.filter, [...cur].join(",")) : q.delete(b.dataset.filter);
      setQuery(q);
      refresh(b.closest("dialog") ? `dialog [data-filter="${b.dataset.filter}"][data-v="${b.dataset.v}"]` : null);
      return;
    }
    if (ev.target.closest("[data-clear]")) {
      const { q } = parseHash();
      GFILTERS.forEach((f) => q.delete(f.key)); q.delete("q");
      PAGE.querySelector("#g-search").value = "";
      setQuery(q); refresh(); return;
    }
    if (ev.target.closest("[data-open-filters]")) sheet.showModal();
    if (ev.target.closest("#filter-sheet [data-close]")) sheet.close();
  });
  sheet.addEventListener("click", (ev) => { if (ev.target === sheet) sheet.close(); });
  let t;
  PAGE.querySelector("#g-search").addEventListener("input", (ev) => {
    clearTimeout(t);
    t = setTimeout(() => { const { q } = parseHash(); ev.target.value.trim() ? q.set("q", ev.target.value.trim()) : q.delete("q"); setQuery(q); refresh(); }, 150);
  });
  refresh();
};

function goingResearch() {
  setMeta("Attendance research leads");
  const pend = D.attendanceAll.filter((a) => !a.public);
  return `<a class="back-link" href="#/going">← Who’s going</a>
  <h1>Research leads</h1>
  <p class="notice">These leads suggest someone may attend, but the original public source hasn’t been recovered or verified, so they don’t appear on Who’s Going. Note: this repository is public, so anyone can read these entries in <code>data/attendance.json</code>.</p>
  <div class="table-wrap"><table><thead><tr><th>Who</th><th>Claimed status</th><th>Lead</th></tr></thead><tbody>
  ${pend.map((a) => `<tr><td>${esc(a.person_id ? D.people.get(a.person_id)?.name : a.name)}${a.company_label ? `<br><span class="small muted">${esc(a.company_label)}</span>` : ""}</td><td>${esc(AST[a.attendance_status].label)}</td><td class="small">${esc(a.evidence_summary)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

/** Evidence list for a person or company page: "Where to find them". */
function whereToFind(recs, entityName) {
  if (!recs?.length) return "";
  return `<section><h2>Where to find ${esc(entityName)}</h2><p class="small muted">Only where public evidence supports it.</p>
  <ul class="source-list">${recs.slice().sort((x, y) => (x.dates[0] || "9").localeCompare(y.dates[0] || "9")).map((a) => `<li><span class="type">${a.confidence === "unverified" ? "Unverified · " : ""}${esc(AST[a.attendance_status].label)}${a.dates.length ? ` · ${a.dates.map((d) => esc(dayOf(d).label)).join(", ")}` : ""}</span>
    ${esc(a.evidence_summary)}
    ${a.event_ids.length ? `<p>${a.event_ids.map((id) => D.ev.get(id)).map((e) => `<a href="${evUrl(e)}">${esc(e.title)}</a> <span class="muted">(${esc(dayRange(e))}, ${esc(timeLabel(e))})</span>`).join("<br>")}</p>` : ""}
    <p>${a.source_url ? `<a href="${esc(a.source_url)}" target="_blank" rel="noopener">Proof / source ↗</a> · ` : ""}Last verified ${esc(fmtDate(a.last_verified))}</p></li>`).join("")}</ul></section>`;
}

// ---------------------------------------------------------------- PLAY (play-money prediction market)
// Every visitor gets their own sandbox: balances, positions and prices live only in their browser.
const PLAY_KEY = "tpm2049:play:v1";
const play$ = {
  read() {
    const M = D.markets;
    let st = null;
    try { st = JSON.parse(localStorage.getItem(PLAY_KEY) || "null"); } catch { st = null; }
    if (!st || typeof st.balance !== "number") st = { balance: M.starting_balance, m: {}, settled: {} };
    for (const mk of M.markets) if (!st.m[mk.id]) st.m[mk.id] = { q: lmsr.seed(mk.seed, M.liquidity), yes: 0, no: 0 };
    // Pay out any market the curators have resolved since the last visit.
    for (const mk of M.markets) {
      if (mk.status === "resolved" && mk.outcome && !st.settled[mk.id]) {
        const pos = st.m[mk.id];
        st.balance += mk.outcome === "yes" ? pos.yes : mk.outcome === "no" ? pos.no : (pos.yes + pos.no) * 0.5;
        st.settled[mk.id] = true;
      }
    }
    return st;
  },
  write(st) { try { localStorage.setItem(PLAY_KEY, JSON.stringify(st)); } catch { /* private mode: this session only */ } },
};
let playState = null;
const credits = (n) => `${Math.round(n).toLocaleString("en-GB")}`;
const pct = (p) => `${Math.round(p * 100)}%`;

function playMarket(mk, st) {
  const b = D.markets.liquidity, pos = st.m[mk.id], p = lmsr.price(pos.q, b);
  const open = mk.status === "open";
  const value = pos.yes * p + pos.no * (1 - p);
  const ev = mk.event_id && D.ev.get(mk.event_id);
  return `<article class="pm-card${open ? "" : " is-resolved"}" data-market="${mk.id}">
    <div class="pm-top"><span class="pm-cat">${esc(mk.category)}</span><span class="pm-close">${open ? `Closes ${esc(fmtDate(mk.closes))}` : `Resolved: <b>${esc(mk.outcome.toUpperCase())}</b>`}</span></div>
    <h3>${esc(mk.question)}</h3>
    ${ev ? `<p class="pm-ev">Related: <a href="${evUrl(ev)}">${esc(ev.title)}</a></p>` : ""}
    <div class="pm-odds" role="img" aria-label="Yes ${pct(p)}, No ${pct(1 - p)}">
      <div class="pm-bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
      <div class="pm-odds-row"><span><b>${pct(p)}</b> Yes</span><span>No <b>${pct(1 - p)}</b></span></div>
    </div>
    ${open ? `<div class="pm-trade">
      <div class="pm-amounts" role="group" aria-label="Amount">${[10, 50, 100].map((a, i) => `<button type="button" class="pm-amt" data-amt="${a}" aria-pressed="${i === 1}">${a}</button>`).join("")}<label class="visually-hidden" for="amt-${mk.id}">Custom amount</label><input class="pm-amt-input" id="amt-${mk.id}" type="number" min="1" step="1" inputmode="numeric" placeholder="Other"></div>
      <div class="pm-buttons"><button type="button" class="pm-buy pm-yes" data-side="yes">Buy Yes <span>${pct(p)}</span></button><button type="button" class="pm-buy pm-no" data-side="no">Buy No <span>${pct(1 - p)}</span></button></div>
      <p class="pm-preview" aria-live="polite"></p>
    </div>` : ""}
    ${pos.yes > 0.01 || pos.no > 0.01 ? `<div class="pm-pos"><span>Your position: ${pos.yes > 0.01 ? `<b>${pos.yes.toFixed(1)}</b> Yes` : ""}${pos.yes > 0.01 && pos.no > 0.01 ? " · " : ""}${pos.no > 0.01 ? `<b>${pos.no.toFixed(1)}</b> No` : ""} · worth ${credits(value)} now</span>${open ? `<button type="button" class="pm-sell" data-sell="1">Sell all</button>` : ""}</div>` : ""}
    <details class="pm-rules"><summary>How it resolves</summary><p>${esc(mk.resolves)}</p></details>
  </article>`;
}

function play() {
  setMeta("Play: prediction-market game", "A just-for-fun play-money prediction market on TOKEN2049 week. No real money, no prizes.");
  const M = D.markets, st = (playState = play$.read()), b = M.liquidity;
  const holdings = M.markets.reduce((t, mk) => { const pos = st.m[mk.id], p = lmsr.price(pos.q, b); return mk.status === "open" ? t + pos.yes * p + pos.no * (1 - p) : t; }, 0);
  const worth = st.balance + holdings, change = worth / M.starting_balance - 1;
  return `
  <section class="pm-hero">
    <div>
      <p class="hh-eyebrow">Just for fun · play money</p>
      <h1>Call TOKEN2049 week before it happens</h1>
      <p class="hh-lede">You start with ${credits(M.starting_balance)} play credits. Buy <b>Yes</b> or <b>No</b> on each question. Prices move with every trade, like a real prediction market, and each winning share pays 1 credit when the question resolves.</p>
    </div>
    <div class="pm-wallet" aria-live="polite">
      <p class="plan-title">Your play wallet</p>
      <p class="pm-worth"><b>${credits(worth)}</b> credits<span class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%</span></p>
      <dl><div><dt>Cash</dt><dd>${credits(st.balance)}</dd></div><div><dt>In positions</dt><dd>${credits(holdings)}</dd></div></dl>
      <button type="button" class="pa-btn pm-reset" data-reset>Start again</button>
    </div>
  </section>
  <p class="pm-disclaimer"><strong>Play money only.</strong> No real money, deposits, withdrawals or prizes, and nothing to sign up for. Your credits and prices live only in this browser, so each visitor has their own market. Not financial advice.</p>
  <div class="pm-grid">${M.markets.map((mk) => playMarket(mk, st)).join("")}</div>
  ${npBanner()}`;
}
afterRender.play = () => {
  const b = D.markets.liquidity;
  const rerender = () => render({ keepScroll: true });
  PAGE.querySelectorAll(".pm-card").forEach((card) => {
    const mk = D.markets.markets.find((m) => m.id === card.dataset.market);
    if (!mk || mk.status !== "open") return;
    const pos = playState.m[mk.id];
    const amountOf = () => { const custom = +card.querySelector(".pm-amt-input").value; return custom > 0 ? custom : +(card.querySelector('.pm-amt[aria-pressed="true"]')?.dataset.amt || 0); };
    const preview = () => {
      const a = amountOf(), el = card.querySelector(".pm-preview");
      if (!a) { el.textContent = ""; return; }
      if (a > playState.balance) { el.textContent = `You only have ${credits(playState.balance)} credits.`; return; }
      const y = lmsr.sharesFor(pos.q, b, "yes", a), n = lmsr.sharesFor(pos.q, b, "no", a);
      el.textContent = `${a} credits buys ${y.toFixed(1)} Yes (pays ${credits(y)} if Yes) or ${n.toFixed(1)} No (pays ${credits(n)} if No).`;
    };
    card.querySelectorAll(".pm-amt").forEach((btn) => btn.addEventListener("click", () => {
      card.querySelectorAll(".pm-amt").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      card.querySelector(".pm-amt-input").value = ""; preview();
    }));
    card.querySelector(".pm-amt-input").addEventListener("input", preview);
    card.querySelectorAll(".pm-buy").forEach((btn) => btn.addEventListener("click", () => {
      const a = amountOf(), side = btn.dataset.side;
      if (!a || a > playState.balance) { preview(); return; }
      const sh = lmsr.sharesFor(pos.q, b, side, a);
      pos.q[side] += sh; pos[side] += sh; playState.balance -= a;
      play$.write(playState); rerender();
      toast(`Bought ${sh.toFixed(1)} ${side === "yes" ? "Yes" : "No"} for ${credits(a)} credits`);
    }));
    card.querySelector("[data-sell]")?.addEventListener("click", () => {
      let got = 0;
      for (const side of ["yes", "no"]) if (pos[side] > 0) { got += lmsr.proceeds(pos.q, b, side, pos[side]); pos.q[side] -= pos[side]; pos[side] = 0; }
      playState.balance += got; play$.write(playState); rerender();
      toast(`Sold for ${credits(got)} credits`);
    });
    preview();
  });
  PAGE.querySelector("[data-reset]")?.addEventListener("click", () => {
    if (!confirm("Reset your play wallet and all positions?")) return;
    try { localStorage.removeItem(PLAY_KEY); } catch { /* ignore */ }
    rerender(); toast("Fresh start: 1,000 play credits");
  });
};

// ---------------------------------------------------------------- PROMO
function maybeUnlockPromo() {}
/** Simple monochrome channel icons (drawn for this site, in currentColor). */
const COMMUNITY_MARK = {
  whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.2A8.5 8.5 0 1 0 12 3.5z"/><path fill="currentColor" d="M9.1 7.9c.3 0 .5.1.6.4l.7 1.6c.1.3 0 .5-.1.7l-.5.6c.6 1.2 1.6 2.2 2.8 2.8l.6-.5c.2-.2.5-.2.7-.1l1.6.7c.3.1.4.4.4.6-.1 1.1-1 1.9-2.1 1.8-3.3-.4-5.9-3-6.3-6.3-.1-1.1.7-2.1 1.6-2.3z"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.7 4.2 2.9 11.1c-.9.4-.9 1.6.1 1.9l4.4 1.4 1.7 5.2c.3.8 1.3 1 1.9.4l2.5-2.4 4.5 3.3c.7.5 1.6.1 1.8-.7l3-13.6c.2-1-.8-1.8-1.7-1.4zM9.8 14.3l-.5 3.6-1.3-4.1 9.6-6.3-7.8 6.8z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.5 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v11.5H3zM9 9h2.9v1.6h.1c.4-.8 1.4-1.8 3-1.8 3.2 0 3.8 2.1 3.8 4.8v6.9h-3v-6.1c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2v6.2H9z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.9 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>`,
};
const communityLinks = () => {
  const M = D.site.curator.community;
  return M ? `<div class="np-community">${M.links.map((l) => `<a class="np-comm np-${l.id}" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="np-mark" aria-hidden="true">${COMMUNITY_MARK[l.id] || "↗"}</span><span>${esc(l.label)}</span></a>`).join("")}</div>` : "";
};
/** Slim NEXTPredict strip at the very top of the home page. */
function shareSiteText() {
  const h = D.site.curator?.x_handle;
  return `Heading to TOKEN2049 Singapore? Every prediction-market event, side event and who's going, in one free guide${h ? `, put together by @${h}` : ""}.`;
}

function shareSiteBox() {
  const url = absUrl(""), text = shareSiteText(), u = encodeURIComponent(url), t = encodeURIComponent(text);
  return `<section class="share-site" aria-labelledby="share-site-title">
    <div class="share-site-text">
      <h2 id="share-site-title">Know someone going to TOKEN2049?</h2>
      <p>Share the guide. The post is written for you and tags <b>@${esc(D.site.curator?.x_handle || "")}</b>.</p>
    </div>
    <div class="share-site-btns">
      <a class="btn share-x" href="https://x.com/intent/post?text=${t}&url=${u}" target="_blank" rel="noopener">Post on X (Twitter)</a>
      <button type="button" class="btn" data-share-site>Share another way</button>
    </div>
  </section>`;
}

/** Straight after the TOKEN2049 hero: the reader discount for NEXTPredict NYC. */
function npBanner() {
  const P = D.site.promo, C = D.site.curator;
  if (!P) return "";
  const title = P.amount ? `Reading this guide saves you ${esc(P.amount)} on NEXTPredict NYC` : "Reading this guide unlocks a discount on NEXTPredict NYC";
  return `<aside class="np-offer" aria-label="Reader offer: NEXTPredict NYC">
    <div class="np-offer-copy">
      <p class="np-offer-kicker"><span>Reader offer</span> From the curators of this guide</p>
      <h2>${title}</h2>
      <p>Continue the conversation in New York. The prediction-markets crowd you meet at TOKEN2049 reconvenes at <strong>${esc(C.summit.name)}</strong>, ${esc(C.summit.dates)} at ${esc(C.summit.place)}, two weeks before the US midterms.</p>
      <div class="np-offer-actions"><a class="pa-primary" href="${esc(P.url)}" target="_blank" rel="noopener">Claim your discount <span aria-hidden="true">↗</span></a><a class="np-offer-link" href="#/nextpredict">Join the community →</a></div>
    </div>
    <a class="np-offer-stub" href="${esc(P.url)}" target="_blank" rel="noopener" aria-label="Claim the discount with code ${esc(P.code)}">
      <span class="np-offer-stub-label">${P.amount ? `Save ${esc(P.amount)}` : "Your reader code"}</span>
      <b class="mono">${esc(P.code)}</b>
      <em>Applied automatically at checkout</em>
      <small>${esc(C.summit.dates)} · New York</small>
    </a>
  </aside>`;
}
function nextpredict() {
  const P = D.site.promo, C = D.site.curator, M = C.community;
  setMeta("NEXTPredict", `${C.summit.name}, ${C.summit.dates}, and the NEXTPredict prediction-market community on WhatsApp, Telegram, LinkedIn and X.`);
  return `
  <section class="npx-hero">
    <div class="npx-hero-copy">
      <p class="npx-kicker"><span class="np-logo">NEXT<b>Predict</b></span> · from the curators of this guide</p>
      <h1>The prediction-markets crowd doesn’t stop at TOKEN2049.</h1>
      <p class="npx-lede">NEXTPredict brings together the people building, trading and regulating prediction markets. We made this guide, and we run ${esc(C.summit.name)}.</p>
      <div class="npx-hero-actions"><a class="npx-btn npx-btn-primary" href="${esc(P.url)}" target="_blank" rel="noopener">Get your ticket ↗</a><a class="npx-btn npx-btn-ghost" href="#/nextpredict?at=community">Join the community ↓</a></div>
    </div>
    <a class="npx-ticket" href="${esc(P.url)}" target="_blank" rel="noopener" aria-label="${esc(C.summit.name)} tickets with code ${esc(P.code)}">
      <div class="npx-ticket-main">
        <p class="npx-ticket-label">Admit one · summit</p>
        <p class="npx-ticket-name">${esc(C.summit.name)}</p>
        <dl class="npx-ticket-grid">
          <div><dt>Dates</dt><dd>${esc(C.summit.dates.replace(/ 2026$/, ""))}</dd></div>
          <div><dt>Where</dt><dd>${esc(C.summit.place)}</dd></div>
          <div><dt>Why now</dt><dd>Two weeks before the US midterms</dd></div>
        </dl>
      </div>
      <div class="npx-ticket-stub">
        <span>Your code</span>
        <b class="mono">${esc(P.code)}</b>
        <em>Applied automatically ↗</em>
      </div>
    </a>
  </section>

  ${M ? `<section class="section" id="community" aria-labelledby="h-comm">
    <div class="section-head home-head"><div><p class="sec-num">Community</p><h2 id="h-comm">Join the conversation</h2><p class="section-sub">${esc(M.blurb)} Pick the channel you already use.</p></div><a class="more" href="${esc(M.url)}" target="_blank" rel="noopener">All communities ↗</a></div>
    <div class="npx-channels">${M.links.map((l) => `<a class="npx-channel npx-${l.id}" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="npx-icon">${COMMUNITY_MARK[l.id] || ""}</span><span class="npx-channel-text"><strong>${esc(l.label)}</strong><span>${esc(l.cta)}</span></span><span class="npx-arrow" aria-hidden="true">↗</span></a>`).join("")}</div>
  </section>` : ""}

  <section class="section">${curatorPanel()}</section>
  <p class="small muted">${esc(P.disclosure)}</p>`;
}
function promoCard(compact = false) {
  const P = D.site.promo, C = D.site.curator;
  if (!P) return "";
  return `<div class="promo" id="promo"><p class="eyebrow">🎁 NEXTPredict offer</p><h3>${esc(C.summit.name)}: ${esc(C.summit.dates)}, ${esc(C.summit.place)}</h3>
    ${compact ? "" : `<p>Prediction markets’ own summit, two weeks before the US midterms. Use code <span class="mono">${esc(P.code)}</span> at checkout.</p>`}
    <div class="btn-row"><a class="btn btn-accent" href="${esc(P.url)}" target="_blank" rel="noopener">Get your NEXTPredict NYC discount ↗</a>${compact ? "" : `<a class="btn" href="${esc(C.summit.url)}" target="_blank" rel="noopener">About the summit</a>`}</div>
    ${compact ? "" : `<p class="np-comm-label">Join the NEXTPredict community</p>${communityLinks()}`}
    <p class="small muted" style="margin:10px 0 0">${esc(P.disclosure)}</p></div>`;
}
/** Stuart's photo, or initials until a photo is added (site.json → curator.photo). */
function curatorAvatar(cls = "") {
  const C = D.site.curator;
  return C.photo ? `<img class="curator-photo ${cls}" src="${esc(C.photo)}" alt="${esc(C.person)}" width="160" height="160" loading="lazy">`
    : `<span class="curator-photo curator-initials ${cls}" aria-hidden="true">${esc(initials(C.person))}</span>`;
}
const introNote = () => `Hi ${D.site.curator.person.split(" ")[0]}, I found your TOKEN2049 prediction-markets guide. I work on prediction markets too and will be in Singapore that week. Would be good to meet.`;
function curatorPanel() {
  const C = D.site.curator;
  return `<div class="curator">${curatorAvatar("sm")}<div>
    <p style="margin:0"><strong>Curated by <a href="#/people/${C.person_id}">${esc(C.person)}</a></strong>, ${esc(C.role || C.name)}. ${esc(C.person.split(" ")[0])} is in Singapore all TOKEN2049 week and happy to meet anyone working on prediction markets.</p>
    <div class="btn-row" style="margin-top:8px"><a class="btn btn-small btn-accent" href="${esc(C.linkedin)}" target="_blank" rel="noopener">Connect on LinkedIn ↗</a>${C.x_handle ? `<a class="btn btn-small" href="https://x.com/${esc(C.x_handle)}" target="_blank" rel="noopener">@${esc(C.x_handle)} on X ↗</a>` : ""}</div></div></div>`;
}
/** Home: feature the person behind the guide and invite people to meet at TOKEN2049. */
function meetStuart() {
  const C = D.site.curator, first = C.person.split(" ")[0];
  return `<section class="meet" aria-labelledby="meet-title">
    <div class="meet-photo">${curatorAvatar()}<span class="meet-badge">In Singapore all week</span></div>
    <div class="meet-text">
      <p class="np-offer-kicker"><span>The person behind this guide</span></p>
      <h2 id="meet-title">Meet ${esc(first)} at TOKEN2049</h2>
      <p class="meet-role"><strong>${esc(C.person)}</strong> · ${esc(C.role || C.name)}</p>
      <p>${esc(first)} built this guide and is part of the team behind ${esc(C.summit.name)}. In Singapore for the whole of TOKEN2049 week, ${esc(first)} wants to meet people building, trading, investing in or regulating prediction markets. Coffee, a side event or a quick hello on the expo floor all work.</p>
      <div class="meet-actions">
        <a class="pa-primary" href="${esc(C.linkedin)}" target="_blank" rel="noopener">Connect on LinkedIn <span aria-hidden="true">↗</span></a>
        ${C.x_handle ? `<a class="pa-btn meet-btn" href="https://x.com/${esc(C.x_handle)}" target="_blank" rel="noopener">Message @${esc(C.x_handle)} on X ↗</a>` : ""}
      </div>
      <p class="meet-hint">Tip: <button type="button" class="link-btn" data-copy="${esc(introNote())}" data-copy-msg="Intro note copied">copy an intro note</button> and paste it into your LinkedIn request so ${esc(first)} knows you’re coming from the guide.</p>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- MY SCHEDULE
function schedule(_, q) {
  setMeta("My TOKEN PM schedule", "Your saved prediction-market events at TOKEN2049 Singapore, with clashes and free time.");
  const share = (q.get("share") || "").split(",").filter((id) => D.ev.has(id));
  if (q.has("share")) {
    const list = share.map((id) => D.ev.get(id));
    return `<h1>Shared schedule</h1>
    <p class="lede">Someone shared ${plural(list.length, "event")} with you. Nothing is saved until you choose to.</p>
    <div class="btn-row" style="margin:14px 0"><button class="btn btn-accent" type="button" data-save-all="${share.join(",")}">★ Add all to my schedule</button><a class="btn" href="#/schedule">Open my schedule</a></div>
    ${HOOKS.shareCompare?.(share) || ""}
    ${scheduleDays(list, false)}`;
  }
  const ids = saved.all().filter((id) => D.ev.has(id));
  const list = ids.map((id) => D.ev.get(id));
  // Count clashes the same way the day timelines show them: one per group of overlapping events.
  const clashPairs = D.days.flatMap((d) => clusters(list.filter((e) => eventDays(e).includes(d.date))).filter((g) => g.length > 1));
  const exportable = list.filter((e) => !icsBlocker(e));
  return `<h1>My TOKEN PM schedule</h1>
  <p class="lede">Star events anywhere in the directory and they appear here in time order, with clashes and free time shown.</p>
  <p class="small muted">Saved in this browser only. There’s no account, and nothing is sent anywhere. To move your schedule to another device, use the share link or calendar export.</p>
  ${list.length ? `
  <div class="panel" style="margin:16px 0">
    <p style="margin:0 0 10px"><strong>${plural(list.length, "event")} saved</strong>${clashPairs.length ? ` · <span style="color:var(--clash)">⚠ ${plural(clashPairs.length, "clash", "clashes")}</span>` : " · no clashes"}</p>
    <div class="btn-row">
      <button type="button" class="btn btn-small btn-primary" data-ics-all ${exportable.length ? "" : "disabled"}>Export ${exportable.length} to calendar (.ics)</button>
      <button type="button" class="btn btn-small" data-share-schedule>Copy share link</button>
      <button type="button" class="btn btn-small" data-clear-saved>Clear all</button>
    </div>
    ${exportable.length < list.length ? `<p class="small muted" style="margin:8px 0 0">${plural(list.length - exportable.length, "event")} can’t be exported yet because the time isn’t published or the listing is provisional.</p>` : ""}
  </div>
  ${HOOKS.scheduleExtras?.(list) || ""}
  ${scheduleDays(list, true)}` : `<div class="empty"><p>Nothing saved yet.</p><p>Tap ★ on any event to add it here.</p><div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="#/start?at=finder">Build a shortlist</a><a class="btn" href="#/calendar">Browse the calendar</a></div></div>`}
  ${promoCard()}`;
}
function scheduleDays(list, mine) {
  return D.days.map((d) => {
    const day = list.filter((e) => eventDays(e).includes(d.date)).sort((a, b) => sortKey(a, d.date).localeCompare(sortKey(b, d.date)));
    if (!day.length) return "";
    const clashes = clusters(day).filter((g) => g.length > 1).length;
    return `<section class="sched-day">
      <header class="sched-head"><div class="day-leaf day-leaf-sm" aria-hidden="true"><span class="dl-month">Oct</span><span class="dl-num">${d.label.slice(4, 6).trim()}</span><span class="dl-wd">${esc(d.label.slice(0, 3))}</span></div>
        <div><h2>${esc(d.long)}</h2><p class="day-stats"><span>${plural(day.length, "event")}</span>${clashes ? `<span class="sched-clash">⚠ ${plural(clashes, "clash", "clashes")}</span>` : "<span>no clashes</span>"}<span>${esc(d.note)}</span></p></div></header>
      ${programme(day, d.date, { gaps: true, noun: "event", clashLabel: mine ? "Clash: choose one" : "Overlap" })}</section>`;
  }).join("");
}

afterRender.schedule = () => HOOKS.decorateSchedule?.(PAGE);

// ---------------------------------------------------------------- ABOUT
function about() {
  setMeta("About & sources", "How this unofficial directory of prediction markets at TOKEN2049 Singapore is compiled, what’s still being checked, and every source.");
  const srcs = [...D.sources.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const updated = D.events.filter((e) => e.last_updated > D.site.last_updated);
  return `<h1>About this directory</h1>
  <p class="lede">An independent, unofficial guide to where prediction markets actually show up during TOKEN2049 Singapore week, 5–9 October 2026. Curated by ${curator()}.</p>
  ${curatorPanel()}
  ${promoCard()}
  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel"><h2>How it’s compiled</h2><p>Listings are assembled from:</p><ul>
      <li>the official TOKEN2049 programme, partner list and TOKEN2049 Week side-event directory</li><li>official event organiser pages (Luma, organiser sites and channels)</li>
      <li>company announcements and press releases</li><li>third-party side-event listings</li><li>other cited public reporting and filings</li></ul>
      <p>Every event links to its source. Company pages support what a company says about itself; they don’t prove adoption or performance, and we label claims as such.</p></div>
    <div class="panel"><h2>Freshness</h2><p><strong>Last updated:</strong> ${esc(fmtDate(D.site.last_updated))}<br><strong>Research cut-off:</strong> ${esc(D.site.research_cutoff)}<br><strong>Times:</strong> ${esc(D.site.timezone)}</p>
      <p>This site isn’t connected to live data. Schedules and access details can change, so check the organiser link before travelling to an event.</p>
      ${D.site.practical.map((p) => `<p class="notice info"><strong>${esc(p.title)}.</strong> ${esc(p.body)}</p>`).join("")}</div>
  </div>

  <section class="section"><h2>How we label things</h2>
    <div class="grid grid-2">
      <div class="panel"><h3>Relevance</h3>${Object.entries(REL).map(([k, v]) => `<p>${relChip(k)}<span class="def">${esc(v.desc)}</span></p>`).join("")}<p class="def">These labels describe how directly an event relates to prediction markets. They are not a ranking of quality. Each listing also has a score out of 10: prediction-market events score 8–10, strongly relevant 6–7, adjacent 3–5 and wildcards 1–4.</p></div>
      <div class="panel"><h3>Verification</h3>${Object.entries(STATUS).map(([k, v]) => `<p><strong>${esc(v.label)}</strong> (${D.events.filter((e) => e.status === k).length})<span class="def">${esc(v.desc)}</span></p>`).join("")}</div>
    </div>
  </section>

  <section class="section" id="open-questions"><h2>What we’re still checking</h2>
    <p class="muted">We don’t hide uncertainty. These are the items most likely to change or to be wrong.</p>
    <div class="table-wrap"><table><thead><tr><th scope="col">Item</th><th scope="col">State</th><th scope="col">Detail</th></tr></thead><tbody>
    ${D.site.open_questions.map((x) => `<tr><td>${x.events.length ? `<a href="#/events/${x.events[0]}">${esc(x.item)}</a>` : esc(x.item)}</td><td><span class="chip chip-warn">${esc(x.state)}</span></td><td>${esc(x.detail)}${x.sources.length ? ` <span class="small">${x.sources.map((s) => D.sources.get(s)).filter(Boolean).map((s) => `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.name)}</a>`).join(", ")}</span>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
  </section>

  ${updated.length ? `<section class="section"><h2>Recently updated</h2><div class="event-list">${updated.sort((a, b) => b.last_updated.localeCompare(a.last_updated)).map((e) => eventCard(e, { compact: true })).join("")}</div></section>` : ""}

  <section class="section panel" id="submit"><h2>Submit something we missed</h2>
    <p>Spotted a missing event, a wrong time, a new speaker or a change in access? Open an issue on GitHub. It takes a minute and every report is reviewed before anything changes.</p>
    <div class="btn-row"><a class="btn btn-primary" href="${issueUrl("missing-event.yml")}" rel="noopener">Suggest a missing event</a><a class="btn" href="${issueUrl("correction.yml")}" rel="noopener">Report a correction</a><a class="btn" href="${issueUrl("attendance.yml")}" rel="noopener">I’m going: add me</a></div>
  </section>

  <section class="section"><h2>What this directory leaves out</h2>
    <p>This directory is public. It doesn’t include private contact details, relationship notes, outreach status, ticket codes or unpublished commercial information. The only offer on the site is NEXTPredict’s own, clearly labelled NEXTPredict NYC discount. Social-media claims that couldn’t be independently checked have been left out. Inclusion doesn’t mean endorsement, and this site is not affiliated with TOKEN2049 or any listed organiser.</p>
  </section>

  <section class="section"><h2>Source register (${srcs.length})</h2><ul class="source-list">${srcs.map(sourceItem).join("")}</ul></section>`;
}

// ---------------------------------------------------------------- global interactions
function onSaveToggle(id, btn) {
  const on = saved.toggle(id);
  const e = D.ev.get(id);
  document.querySelectorAll(`[data-save="${id}"]`).forEach((b) => {
    b.setAttribute("aria-pressed", on);
    b.setAttribute("aria-label", `${on ? "Remove" : "Save"} ${e.title} ${on ? "from" : "to"} My schedule`);
    const span = b.querySelector("span");
    if (span) span.textContent = on ? "Saved to My schedule" : "Save to My schedule";
    b.closest(".event-card, .event-row")?.classList.toggle("is-saved", on);
  });
  updateCounts();
  if (on) maybeUnlockPromo();
  const clashes = on ? (D.clash.get(id) || []).filter((o) => saved.has(o.id)) : [];
  toast(on ? (clashes.length ? `Saved. ⚠ Clashes with ${clashes[0].title}${clashes.length > 1 ? ` and ${clashes.length - 1} more` : ""}` : "Saved to My schedule") : "Removed from My schedule",
    { label: "Undo", run: () => { saved.toggle(id); rerenderIfNeeded(); } });
  if (!btn.closest("#finder-root")) rerenderIfNeeded();
}
function rerenderIfNeeded() {
  const key = parseHash().parts[0];
  if (key === "schedule" || key === "calendar") render({ keepScroll: true });
  else {
    updateCounts();
    document.querySelectorAll("[data-save]").forEach((b) => {
      const on = saved.has(b.dataset.save);
      b.setAttribute("aria-pressed", on);
      b.closest(".event-card, .event-row")?.classList.toggle("is-saved", on);
      const span = b.querySelector("span");
      if (span) span.textContent = on ? "Saved to My schedule" : "Save to My schedule";
    });
  }
}

async function share(url, title) {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch (err) {
    if (err?.name !== "AbortError") prompt("Copy this link:", url);
  }
}

// Close any open "Add to calendar" menu on an outside click or once an option is picked.
document.addEventListener("click", (ev) => {
  document.querySelectorAll("details.pa-menu[open]").forEach((d) => { if (!d.contains(ev.target) || ev.target.closest(".pa-menu-list")) d.open = false; });
});

document.addEventListener("click", (ev) => {
  const t = ev.target;
  const sv = t.closest("[data-save]");
  if (sv) { ev.preventDefault(); ev.stopPropagation(); onSaveToggle(sv.dataset.save, sv); return; }
  const all = t.closest("[data-save-all]");
  if (all) {
    const ids = all.dataset.saveAll.split(",").filter((id) => D.ev.has(id));
    const before = saved.all();
    saved.add(ids);
    maybeUnlockPromo();
    toast(`Added ${plural(ids.filter((i) => !before.includes(i)).length, "event")} to My schedule`, { label: "Undo", run: () => { saved.write(before); rerenderIfNeeded(); } });
    rerenderIfNeeded();
    return;
  }
  const ics = t.closest("[data-ics]");
  if (ics) {
    const e = D.ev.get(ics.dataset.ics);
    download(`${e.id}.ics`, buildICS([e], { sources: D.sources, pageUrl: (x) => absUrl(evUrl(x)) }));
    return;
  }
  const blocked = t.closest("[data-ics-blocked]");
  if (blocked) { toast(blocked.dataset.icsBlocked); return; }
  if (t.closest("[data-ics-all]")) {
    const list = saved.all().map((id) => D.ev.get(id)).filter(Boolean);
    download("my-token2049-pm-schedule.ics", buildICS(list, { sources: D.sources, pageUrl: (x) => absUrl(evUrl(x)) }));
    return;
  }
  const lk = t.closest("[data-href]");
  if (lk) { ev.preventDefault(); location.hash = lk.dataset.href; return; }
  const cp = t.closest("[data-copy]");
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast(cp.dataset.copyMsg || "Code copied"), () => prompt("Copy this code:", cp.dataset.copy)); return; }
  const sh = t.closest("[data-share]");
  if (sh) { const e = D.ev.get(sh.dataset.share); share(HOOKS.shareUrl ? HOOKS.shareUrl(e) : absUrl(evUrl(e)), e.title); return; }
  if (t.closest("[data-share-schedule]")) { share(absUrl(`#/schedule?share=${saved.all().filter((id) => D.ev.has(id)).join(",")}`), "My TOKEN2049 prediction-market schedule"); return; }
  if (t.closest("[data-clear-saved]")) {
    const before = saved.all();
    if (confirm(`Remove all ${before.length} saved events?`)) { saved.clear(); render({ keepScroll: true }); toast("Schedule cleared", { label: "Undo", run: () => { saved.write(before); render({ keepScroll: true }); } }); }
    return;
  }
  const back = t.closest("[data-back]");
  if (back && navDepth > 0) { ev.preventDefault(); history.back(); return; }
  if (t.closest("[data-open-more]")) { document.getElementById("more-sheet").showModal(); return; }
  const dd = document.querySelector(".nav-more[open]");
  if (dd && !t.closest(".nav-more")) dd.removeAttribute("open");
  const more = document.getElementById("more-sheet");
  if (more.open && (t === more || t.closest("#more-sheet [data-close]") || t.closest("#more-sheet a"))) more.close();
});

window.addEventListener("hashchange", () => { navDepth++; render(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelector(".nav-more[open]")?.removeAttribute("open"); });
window.addEventListener("storage", (e) => { if (e.key?.startsWith("tpm2049:saved")) rerenderIfNeeded(); });

// ---------------------------------------------------------------- ADD TO HOME SCREEN
// Android/Chrome: one-tap install via the browser's install prompt.
// iPhone/iPad Safari: no install API exists, so show the Share → Add to Home Screen steps.
const a2hs = {
  deferred: null,
  key: "tpm2049:a2hs-dismissed",
  isStandalone: () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
  isIOS: () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  isMobile: () => matchMedia("(max-width: 899px)").matches && matchMedia("(pointer: coarse)").matches,
  dismissed() { try { return !!localStorage.getItem(this.key); } catch { return false; } },
  dismiss() { try { localStorage.setItem(this.key, String(Date.now())); } catch { /* ignore */ } document.getElementById("a2hs").hidden = true; },
  show(force = false) {
    if (this.isStandalone()) { if (force) toast("It’s already on your home screen."); return; }
    if (!force && (this.dismissed() || !this.isMobile())) return;
    const el = document.getElementById("a2hs");
    const share = `<svg class="share-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7h14v-7"/></svg>`;
    const text = el.querySelector("[data-a2hs-text]");
    const actions = el.querySelector("[data-a2hs-actions]");
    if (this.deferred) {
      text.textContent = "One tap to open it during TOKEN week, and it works on patchy conference Wi-Fi.";
      actions.innerHTML = `<button type="button" class="btn btn-small btn-accent" data-a2hs-install>Add to home screen</button><button type="button" class="btn btn-small btn-ghost" data-a2hs-close>Not now</button>`;
    } else if (this.isIOS()) {
      text.innerHTML = `Tap ${share} <b>Share</b> in Safari’s toolbar, then <b>Add to Home Screen</b>. It opens like an app and works on patchy Wi-Fi.`;
      actions.innerHTML = `<button type="button" class="btn btn-small btn-ghost" data-a2hs-close>Got it</button>`;
    } else {
      text.innerHTML = `Open your browser menu (<b>⋮</b>) and choose <b>Add to Home screen</b> or <b>Install app</b>.`;
      actions.innerHTML = `<button type="button" class="btn btn-small btn-ghost" data-a2hs-close>Got it</button>`;
    }
    el.hidden = false;
  },
};
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); a2hs.deferred = e; });
window.addEventListener("appinstalled", () => { a2hs.deferred = null; a2hs.dismiss(); toast("Added to your home screen"); });
document.addEventListener("click", async (ev) => {
  const li = ev.target.closest("[data-share-linkedin]");
  if (li) {
    // LinkedIn ignores pre-filled text, so copy it for pasting
    const text = `${shareSiteText().replace(/@(\w+)/, "@Stuart Crowley")} ${absUrl("")}`;
    try { await navigator.clipboard.writeText(text); toast("Post text copied. Paste it into LinkedIn, then type @Stuart Crowley and pick the profile to tag it."); } catch {}
    window.open(li.dataset.shareLinkedin, "_blank", "noopener");
    return;
  }
  if (ev.target.closest("[data-share-site]")) {
    const text = shareSiteText(), url = absUrl("");
    if (navigator.share) { try { await navigator.share({ title: document.title, text, url }); } catch {} return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast("Post text and link copied"); } catch { prompt("Copy this:", `${text} ${url}`); }
    return;
  }
  if (ev.target.closest("[data-a2hs-close]")) { a2hs.dismiss(); return; }
  if (ev.target.closest("[data-a2hs-open]")) { document.getElementById("more-sheet").close(); a2hs.show(true); return; }
  if (ev.target.closest("[data-a2hs-install]") && a2hs.deferred) {
    a2hs.deferred.prompt();
    const { outcome } = await a2hs.deferred.userChoice;
    a2hs.deferred = null;
    if (outcome === "accepted") a2hs.dismiss(); else document.getElementById("a2hs").hidden = true;
  }
});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

(async function init() {
  try {
    await loadData();
  } catch (err) {
    view().innerHTML = `<h1>Couldn’t load the directory</h1><p>${esc(err.message)}</p><p class="muted">If you opened this file directly from your computer, run a local web server instead (see README).</p>`;
    return;
  }
  try {
    HOOKS = await installFeatures({
      D, ROUTES, afterRender, PAGE: () => PAGE, esc, plural, dayOf, eventsOn, sortKey, toMin, fmtMin, fmtDuration, isAllDay, timeLabel, sgtNow,
      saved, toast, setMeta, parseHash, setQuery, render, eventRow, saveBtn, evUrl, absUrl, download, icsBlocker,
      REL, ACCESS, INTERESTS, ROLES, fmtDate, issueUrl, norm, matches, eventDays,
    });
  } catch (err) { console.warn("Extra features unavailable", err); }
  document.querySelector("[data-footer-meta]").innerHTML =
    `Last updated ${esc(fmtDate(D.site.last_updated))} · Times in ${esc(D.site.timezone)} · Curated by <a href="${esc(D.site.curator.linkedin)}" rel="noopener" target="_blank">${esc(D.site.curator.person)}</a>, ${curator()} · <a href="${esc(D.site.curator.summit.url)}" rel="noopener" target="_blank">${esc(D.site.curator.summit.name)}</a> · <a href="#/nextpredict">Join the NEXTPredict community</a> · <a href="#/about">How this is compiled</a> · <a href="${issueUrl("missing-event.yml")}" rel="noopener">Submit something we missed</a>`;
  render();
  setTimeout(() => a2hs.show(), 6000);
})();
