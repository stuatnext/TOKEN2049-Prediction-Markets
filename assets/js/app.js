// Prediction Markets at TOKEN2049 — single-page directory.
// Reads /data/*.json, renders views by hash route (#/events/<id> etc.).
import {
  esc, initials, toMin, fmtMin, fmtDuration, eventDays, isTimed, isAllDay, timeLabel, sortKey,
  overlaps, clusters, sgtNow, icsBlocker, buildICS, download, saved, norm, matches,
} from "./util.js";

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
  const names = ["events", "people", "companies", "stack", "sources", "site"];
  const [events, people, companies, stack, sources, site] = await Promise.all(
    names.map((n) => fetch(`data/${n}.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${n}.json (${r.status})`);
      return r.json();
    }))
  );
  D.site = site;
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
      e.title, e.summary, e.why, e.venue, e.time_note, e.access_note, TYPE[e.type], ACCESS[e.access], REL[e.relevance].label,
      STATUS[e.status].label, ...eventDays(e).map((d) => `${D.dayBy.get(d).long} ${D.dayBy.get(d).label}`),
      ...e.audiences.map((a) => AUD[a]), ...e.ecosystems.map((a) => ECO[a]), ...e.topics.map((t) => TOPIC[t] || t),
      ...e.stack_layers.map((l) => D.layer.get(l)?.name), ...e.also_listed,
      ...e.people.map((p) => { const x = D.people.get(p.id); return `${x?.name} ${x?.org_label || ""} ${D.companies.get(x?.org)?.name || ""}`; }),
      ...e.companies.map((c) => D.companies.get(c.id)?.name), e.official ? "official token2049" : "side event",
      e.start || "",
    ].join(" "));
  }
  D.clash = new Map(D.events.map((e) => [e.id, D.events.filter((o) => overlaps(e, o))]));
}

// ---------------------------------------------------------------- small helpers
const dayOf = (iso) => D.dayBy.get(iso);
const dayRange = (e) => (e.end_date ? `${dayOf(e.date).label.slice(0, 3)}–${dayOf(e.end_date).label.slice(0, 3)}` : dayOf(e.date).label);
const evUrl = (e) => `#/events/${e.id}`;
const absUrl = (hash) => `${location.origin}${location.pathname}${hash}`;
const eventsOn = (iso) => D.events.filter((e) => eventDays(e).includes(iso)).sort((a, b) => sortKey(a, iso).localeCompare(sortKey(b, iso)));
const fmtDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const relChip = (r) => `<span class="chip rel rel-${r}">${REL[r].label}</span>`;
const typeChip = (e) => (e.type === "official" ? `<span class="chip chip-official">TOKEN2049 session</span>` : `<span class="chip">${esc(TYPE[e.type])}</span>`);
const accessChip = (e) => `<span class="chip chip-outline chip-access-${e.access}">${esc(ACCESS[e.access])}</span>`;
const statusChip = (e) =>
  e.status === "verified" ? "" : `<span class="chip ${e.status === "listed" ? "chip-outline" : "chip-warn"}">${esc(STATUS[e.status].label)}</span>`;
const saveBtn = (e, wide = false) => {
  const on = saved.has(e.id);
  return `<button type="button" class="save-btn${wide ? " wide" : ""}" data-save="${e.id}" aria-pressed="${on}" aria-label="${on ? "Remove" : "Save"} ${esc(e.title)} ${on ? "from" : "to"} My schedule">${STAR}${wide ? `<span>${on ? "Saved to My schedule" : "Save to My schedule"}</span>` : ""}</button>`;
};
const updatedBadge = (rec) => (rec.last_updated && rec.last_updated > D.site.last_updated ? `<span class="chip chip-warn">Updated ${esc(rec.last_updated)}</span>` : "");

function eventCard(e, o = {}) {
  const isSaved = saved.has(e.id);
  const clashSaved = o.clashSaved ? (D.clash.get(e.id) || []).filter((x) => saved.has(x.id)) : [];
  const cls = ["event-card", `r-${e.relevance}`, isSaved ? "is-saved" : "", clashSaved.length ? "is-clash" : "", o.compact ? "compact" : ""].join(" ");
  const multi = e.end_date ? ` · ${dayRange(e)}` : "";
  return `<article class="${cls}" data-id="${e.id}">
    <div class="body">
      <div class="when"><span class="time">${esc(timeLabel(e))}${esc(multi)}</span>${o.showDay === false ? "" : `<span class="day">${esc(dayOf(e.date).label)}</span>`}</div>
      <h3><a href="${evUrl(e)}">${esc(e.title)}</a></h3>
      <p class="venue">${esc(e.venue)}</p>
    </div>
    <div class="side">${saveBtn(e)}</div>
    ${o.compact ? "" : `<p class="blurb">${esc(e.why)}</p>`}
    ${o.reasons?.length ? `<div class="reasons">${o.reasons.map((r) => `<span class="chip">${esc(r)}</span>`).join("")}</div>` : ""}
    <div class="foot"><div class="chip-row">${relChip(e.relevance)}${typeChip(e)}${accessChip(e)}${statusChip(e)}${updatedBadge(e)}</div><span class="details" aria-hidden="true">Details →</span></div>
    ${clashSaved.length ? `<p class="clash-line">⚠ Clashes with ${clashSaved.map((x) => `<a href="${evUrl(x)}">${esc(x.title)}</a> (${esc(timeLabel(x))})`).join(", ")}</p>` : ""}
  </article>`;
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

const ROUTES = { "": home, start, week, calendar, events, people, companies, stack, schedule, about };

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
    const match = a.dataset.nav === navKey || (navKey === "week" && a.dataset.nav === "start");
    match ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });
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
  const entries = [
    ["New to prediction markets", "#/start", null, true],
    ["Show me everything", "#/events", E.length],
    ["Traders & market makers", "#/events?aud=traders,market-makers", cnt((e) => e.audiences.some((a) => a === "traders" || a === "market-makers"))],
    ["Institutional / TradFi", "#/events?aud=institutions", cnt((e) => e.audiences.includes("institutions"))],
    ["Builders & infrastructure", "#/events?aud=builders", cnt((e) => e.audiences.includes("builders"))],
    ["Sports prediction markets", "#/events?aud=sports", cnt((e) => e.audiences.includes("sports"))],
    ["Polymarket ecosystem", "#/events?eco=polymarket", cnt((e) => e.ecosystems.includes("polymarket"))],
    ["Kalshi ecosystem", "#/events?eco=kalshi", cnt((e) => e.ecosystems.includes("kalshi"))],
    ["Hyperliquid / outcome markets", "#/events?eco=hyperliquid", cnt((e) => e.ecosystems.includes("hyperliquid"))],
    ["Parties & networking", "#/events?type=networking,meetup", cnt((e) => e.type === "networking" || e.type === "meetup")],
    ["Media / journalism", "#/events?aud=media", cnt((e) => e.audiences.includes("media"))],
  ];
  const nu = nextUp(q);
  const official = E.filter((e) => e.type === "official" && (e.relevance === "core" || e.relevance === "strong"));
  const side = E.filter((e) => e.type !== "official" && (e.relevance === "core" || e.relevance === "strong"));
  const keyPeople = [...D.people.values()].filter((p) => p.group !== "speakers").slice(0, 12);
  const roles = [["newcomer", "I’m new to this"], ["trader", "Trader"], ["market-maker", "Market maker"], ["founder", "Founder / builder"], ["institutional", "Institutional"], ["sports", "Sportsbook / iGaming"], ["journalist", "Journalist / creator"], ["infrastructure", "Infrastructure provider"]];
  const ecos = [
    ["Kalshi", "US event-contract exchange. Main-stage sessions plus trader and institutional evenings.", "#/companies/kalshi", "#/events?eco=kalshi"],
    ["Polymarket", "Main-stage fireside and its first Singapore kick-off party.", "#/companies/polymarket", "#/events?eco=polymarket"],
    ["Hyperliquid / HIP-4", "Permissionless outcome markets. Ecosystem event, forum and HypurrCo gathering.", "#/companies/hyperliquid", "#/events?eco=hyperliquid"],
    ["Infrastructure", "Data transport, oracles, clearing, risk and white-label platforms.", "#/stack", "#/events?aud=builders"],
    ["Traders & market makers", "Where liquidity providers and active traders gather.", "#/people?g=trading", "#/events?aud=traders,market-makers"],
    ["Sports", "Sports pricing, data and market structure, concentrated at The Odds.", "#/people?g=sports", "#/events?aud=sports"],
    ["Institutional", "Clearing, portfolio risk, margin and TradFi benchmarks.", "#/companies?c=institutional", "#/events?aud=institutions"],
  ];
  return `
  <section class="hero">
    <p class="eyebrow">TOKEN2049 Singapore · 5–9 October 2026 · Unofficial guide</p>
    <h1>${esc(D.site.title)}</h1>
    <p class="lede">${esc(D.site.tagline)}</p>
    <div class="btn-row"><a class="btn btn-primary" href="#/calendar">Explore the calendar</a><a class="btn" href="#/start">Start here</a></div>
    <div class="meta"><span>${E.length} events</span><span>${D.people.size} people</span><span>${D.companies.size} companies</span><span>Last updated ${esc(fmtDate(D.site.last_updated))}</span><span>All times SGT</span></div>
  </section>

  <section class="section" aria-labelledby="h-entry">
    <div class="section-head"><h2 id="h-entry">Start here</h2></div>
    <div class="entry-grid">${entries.map(([l, h, n, p]) => `<a class="entry${p ? " primary" : ""}" href="${h}">${esc(l)}${n != null ? ` <span class="n">${n}</span>` : ""}</a>`).join("")}</div>
  </section>

  <section class="section" aria-labelledby="h-next">
    <div class="section-head"><h2 id="h-next">${esc(nu.title)}</h2>${nu.today ? `<a class="more" href="#/calendar/${dayOf(nu.today).slug}">Today’s calendar →</a>` : `<a class="more" href="#/calendar">Full calendar →</a>`}</div>
    <p class="muted small">${esc(nu.sub)}</p>
    ${nu.list.length ? `<div class="event-list cols">${nu.list.map((e) => eventCard(e, { compact: true })).join("")}</div>` : ""}
  </section>

  <section class="section" aria-labelledby="h-week">
    <div class="section-head"><h2 id="h-week">Week at a glance</h2><a class="more" href="#/week">Whole-week route →</a></div>
    <div class="week">${D.days.map((d) => {
      const list = eventsOn(d.date);
      const c = (r) => list.filter((e) => e.relevance === r).length;
      const bar = ["core", "strong", "adjacent", "wildcard"].map((r) => (c(r) ? `<span class="b-${r}" style="flex:${c(r)}"></span>` : "")).join("");
      return `<a class="day-card" href="#/calendar/${d.slug}"><span class="d">${esc(d.label.slice(0, 3))}</span><span class="big">${d.label.slice(4)}</span>
        <span class="bars" aria-hidden="true">${bar}</span>
        <span class="visually-hidden">${list.length} listings: ${c("core")} prediction-market, ${c("strong")} strongly relevant, ${c("adjacent")} adjacent, ${c("wildcard")} wildcard.</span>
        <span class="counts" aria-hidden="true"><b>${list.length}</b> listed · ${c("core")} PM</span><span class="note">${esc(d.note)}</span></a>`;
    }).join("")}</div>
    <div class="legend" style="margin-top:12px">${Object.entries(REL).map(([k, v]) => `<span><i class="rel-dot dot-${k}"></i>${v.label}</span>`).join("")}</div>
  </section>

  <section class="section" aria-labelledby="h-off">
    <div class="section-head"><h2 id="h-off">Prediction markets inside TOKEN2049</h2><a class="more" href="#/events?type=official">All ${cnt((e) => e.type === "official")} official sessions →</a></div>
    <p class="muted small">Official programme sessions at Marina Bay Sands (TOKEN2049 pass required) that are directly about, or strongly relevant to, prediction markets.</p>
    <div class="event-list cols">${official.map((e) => eventCard(e)).join("")}</div>
  </section>

  <section class="section" aria-labelledby="h-side">
    <div class="section-head"><h2 id="h-side">Side events</h2><a class="more" href="#/events?type=side-event,forum,meetup,networking,closed-door">All side events →</a></div>
    <p class="muted small">Prediction-market-focused and strongly relevant gatherings across the week. Many need approval or an invitation.</p>
    <div class="event-list cols">${side.map((e) => eventCard(e)).join("")}</div>
  </section>

  <section class="section panel" aria-labelledby="h-find">
    <h2 id="h-find">Find your TOKEN2049</h2>
    <p class="muted">Tell us who you are and we’ll build a shortlist from the directory. You can save it in one tap.</p>
    <div class="btn-row">${roles.map(([k, l]) => `<a class="toggle" href="#/start?role=${k}&at=finder">${esc(l)}</a>`).join("")}</div>
  </section>

  <section class="section" aria-labelledby="h-eco">
    <div class="section-head"><h2 id="h-eco">Explore the ecosystem</h2></div>
    <div class="grid grid-3">${ecos.map(([t, d, a, b]) => `<div class="path"><h3>${esc(t)}</h3><p>${esc(d)}</p><div class="btn-row"><a class="btn btn-small" href="${b}">Events</a><a class="btn btn-small" href="${a}">Learn more</a></div></div>`).join("")}</div>
  </section>

  <section class="section" aria-labelledby="h-stack">
    <div class="section-head"><h2 id="h-stack">The prediction-market stack</h2><a class="more" href="#/stack">Explore the stack →</a></div>
    <p class="muted small">Why does a networking company or a risk platform belong in a prediction-market directory? Because a working market needs every layer below.</p>
    <div class="chip-row">${D.stack.map((l, i) => `<a class="chip chip-outline" href="#/stack/${l.id}"><span class="mono">${String(i + 1).padStart(2, "0")}</span> ${esc(l.name)}</a>`).join("")}</div>
  </section>

  <section class="section" aria-labelledby="h-people">
    <div class="section-head"><h2 id="h-people">People to know</h2><a class="more" href="#/people">All ${D.people.size} people →</a></div>
    <div class="person-list">${keyPeople.map(personMini).join("")}</div>
  </section>

  <section class="section panel" aria-labelledby="h-about">
    <h2 id="h-about">About this directory</h2>
    <p>An independent, curated guide to where prediction markets show up across TOKEN2049 week. It was compiled from the official TOKEN2049 programme, organiser pages, company announcements and other cited public sources. Every listing links back to its source.</p>
    <p class="small muted">Last updated ${esc(fmtDate(D.site.last_updated))}. This is not live data: schedules and access details can change, so check the organiser link before travelling. Curated by ${curator()}.</p>
    <a href="#/about">How this directory is compiled →</a>
  </section>`;
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
    ["Side event", "Anything around TOKEN2049 that isn’t on the official programme: parties, forums, breakfasts, meetups. Many need approval."],
  ];
  return `
  <p class="eyebrow">Start here</p>
  <h1>New to prediction markets at TOKEN2049?</h1>
  <p class="lede">Prediction markets don’t have one home at TOKEN2049. They show up in four places, and this directory pulls them together.</p>
  <div class="grid grid-2" style="margin-top:16px">
    <a class="path" href="#/events?type=official" style="text-decoration:none;color:inherit"><h3>1 · Official TOKEN2049 sessions</h3><p>${n((e) => e.type === "official")} sessions on the Wed–Thu programme at Marina Bay Sands, from Polymarket and Kalshi to adjacent trading and institutional panels. Needs a TOKEN2049 pass.</p></a>
    <a class="path" href="#/events?type=exhibition" style="text-decoration:none;color:inherit"><h3>2 · The expo floor</h3><p>${n((e) => e.type === "exhibition")} prediction-market-relevant sponsors with a floor presence during the main conference days.</p></a>
    <a class="path" href="#/events?type=side-event,forum,meetup,networking,closed-door" style="text-decoration:none;color:inherit"><h3>3 · Side events all week</h3><p>${n((e) => e.type !== "official" && e.type !== "exhibition")} forums, parties and closed-door rooms from Monday to Friday. Many need approval or an invitation.</p></a>
    <a class="path" href="#/stack" style="text-decoration:none;color:inherit"><h3>4 · The stack around them</h3><p>Data, clearing, risk and market-making companies that make prediction markets work, even when their events aren’t labelled “prediction markets”.</p></a>
  </div>

  <section class="section" aria-labelledby="h-labels">
    <h2 id="h-labels">How to read the labels</h2>
    <div class="grid grid-3">
      <div class="panel"><h3>Relevance</h3>${Object.entries(REL).map(([k, v]) => `<p>${relChip(k)}<span class="def">${esc(v.desc)}</span></p>`).join("")}</div>
      <div class="panel"><h3>Access</h3>${["badge", "open", "registration", "approval", "invite", "waitlist"].map((k) => `<p style="margin:0 0 6px"><span class="chip chip-outline chip-access-${k}">${ACCESS[k]}</span></p>`).join("")}<p class="def">Access is shown separately from relevance. A great event you can’t get into is still worth knowing about.</p></div>
      <div class="panel"><h3>Verification</h3>${Object.entries(STATUS).map(([k, v]) => `<p><strong>${esc(v.label)}</strong><span class="def">${esc(v.desc)}</span></p>`).join("")}</div>
    </div>
  </section>

  <section class="section" aria-labelledby="h-paths">
    <h2 id="h-paths">Pick a route</h2>
    <div class="paths">
      <div class="path"><h3>I only have one day</h3><p>See the prediction-market and strongly relevant listings for a single day, with overlaps grouped so you can choose.</p>
        <div class="btn-row">${D.days.map((d) => `<a class="btn btn-small" href="#/calendar/${d.slug}?show=pm&view=agenda">${esc(d.label.slice(0, 3))}</a>`).join("")}</div>
        <p class="small muted">Thursday has the most prediction-market-specific programming.</p></div>
      <div class="path"><h3>I’m here for the whole week</h3><p>A Monday–Friday route through the focused listings, with the clashes you’ll need to decide between.</p><div class="btn-row"><a class="btn btn-small btn-primary" href="#/week">See the week route</a></div></div>
      <div class="path"><h3>I want to meet people</h3><p>Browse people and companies by role, then jump to the parties, meetups and closed-door rooms where they are listed.</p>
        <div class="btn-row"><a class="btn btn-small" href="#/people">People</a><a class="btn btn-small" href="#/companies">Companies</a><a class="btn btn-small" href="#/events?type=networking,meetup">Networking events</a></div></div>
    </div>
  </section>

  <section class="section panel" id="finder" aria-labelledby="h-finder">
    <h2 id="h-finder">Build your shortlist</h2>
    <p class="muted">A simple rule-based filter over the directory. Nothing is sent anywhere.</p>
    <div id="finder-root">${finderForm(q)}</div>
  </section>

  <section class="section" aria-labelledby="h-eco2">
    <h2 id="h-eco2">The main ecosystems, in plain English</h2>
    <div class="grid grid-2">
      ${[["kalshi", "kalshi"], ["polymarket", "polymarket"], ["hyperliquid", "hyperliquid"], ["predict-fun", "independent"]].map(([cid, eco]) => {
        const c = D.companies.get(cid);
        return `<div class="path"><h3>${esc(eco === "independent" ? "Independent platforms (e.g. Predict.fun)" : c.name)}</h3><p>${esc(c.description)}</p><div class="btn-row"><a class="btn btn-small" href="#/events?eco=${eco}">${n((e) => e.ecosystems.includes(eco))} events</a><a class="btn btn-small" href="#/companies/${cid}">Company profile</a></div></div>`;
      }).join("")}
      <div class="path"><h3>Traders & market makers</h3><p>The firms and individuals who supply liquidity. Wintermute has publicly entered prediction markets, and Susquehanna Crypto is named as a liquidity provider for Predict.fun block trades.</p><div class="btn-row"><a class="btn btn-small" href="#/events?aud=traders,market-makers">Events</a><a class="btn btn-small" href="#/companies?c=trading">Firms</a></div></div>
      <div class="path"><h3>Infrastructure</h3><p>DoubleZero (market-data transport), Chainlink (oracles), ION (clearing), Haruko (portfolio risk) and ChainUp (white-label platforms). The stack view explains where each fits.</p><div class="btn-row"><a class="btn btn-small" href="#/stack">The stack</a><a class="btn btn-small" href="#/companies?c=infrastructure">Companies</a></div></div>
      <div class="path"><h3>Sports</h3><p>Sports pricing, data rights, latency and in-play market making. Most of it is concentrated at The Odds on Thursday.</p><div class="btn-row"><a class="btn btn-small" href="#/events/the-odds-prediction-markets-live">The Odds</a><a class="btn btn-small" href="#/people?g=sports">Sports people</a></div></div>
      <div class="path"><h3>Institutional / TradFi</h3><p>Clearing, margin, portfolio systems and the question of whether event contracts fit existing mandates.</p><div class="btn-row"><a class="btn btn-small" href="#/events?aud=institutions">Events</a><a class="btn btn-small" href="#/companies?c=institutional">Firms</a></div></div>
    </div>
  </section>

  <section class="section" aria-labelledby="h-gloss">
    <h2 id="h-gloss">Ten terms you’ll hear</h2>
    <dl class="glossary">${glossary.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join("")}</dl>
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
  const filt = (e) => (show === "pm" ? e.relevance !== "adjacent" : show === "saved" ? saved.has(e.id) : true);
  const list = eventsOn(d.date).filter(filt);
  const qs = (over) => { const x = new URLSearchParams(q); for (const [k, v] of Object.entries(over)) x.set(k, v); x.delete("at"); return x.toString(); };
  return `
  <h1 class="page-title-sm">Calendar</h1>
  <nav class="day-tabs" aria-label="Choose a day">${D.days.map((x) => {
    const c = eventsOn(x.date).filter(filt).length;
    return `<a class="day-tab" href="#/calendar/${x.slug}?${qs({})}" ${x.date === d.date ? 'aria-current="page"' : ""}><span>${esc(x.label.slice(0, 3))}</span><b>${x.label.slice(4, 6).trim()}</b><span class="n">${c}</span></a>`;
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
  <h2 class="visually-hidden">${esc(d.long)}</h2>
  <p class="day-intro"><strong>${esc(d.long)}</strong> · ${esc(d.note)} · ${plural(list.length, "listing")}${show === "pm" ? " (adjacent hidden)" : ""} · times in SGT</p>
  ${!list.length ? `<p class="empty">${show === "saved" ? "You haven’t saved anything on this day yet." : "Nothing listed for this day."}</p>` : viewMode === "timeline" ? timeline(list, d.date, now) : agenda(list, d.date, { clashSaved: true })}
  <div class="legend" style="margin-top:14px">${Object.entries(REL).map(([k, v]) => `<span><i class="rel-dot dot-${k}"></i>${v.label}</span>`).join("")}<span>★ saved</span><span style="color:var(--clash)">▌ clash between saved</span></div>`;
}
afterRender.calendar = () => {
  document.querySelectorAll("[data-calview]").forEach((a) => a.addEventListener("click", () => calPref.set(a.dataset.calview)));
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
  { key: "type", label: "Event type", opts: TYPE, get: (e) => [e.type] },
  { key: "aud", label: "Audience", opts: AUD, get: (e) => e.audiences },
  { key: "eco", label: "Ecosystem", opts: ECO, get: (e) => e.ecosystems },
  { key: "acc", label: "Access", opts: ACCESS, get: (e) => [e.access] },
  { key: "status", label: "Verification", opts: STATUS, get: (e) => [e.status], lab: (v) => v.label },
  { key: "topic", label: "Topic", opts: TOPIC, get: (e) => e.topics, hidden: true },
];
const filterOpts = (f) => (f.key === "day" ? Object.fromEntries(D.days.map((d) => [d.date, d.label])) : f.opts);
const optLabel = (f, k) => { const v = filterOpts(f)[k]; return f.lab ? f.lab(v) : v; };
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
    html += `<section class="day-group"><h2 class="day-heading">${esc(d.long)} <span class="n">${day.length}</span></h2><div class="event-list">${day.map((e) => eventCard(e, { showDay: false })).join("")}</div></section>`;
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
  <div class="detail">
    <article>
      <div class="chip-row">${relChip(e.relevance)}${typeChip(e)}${e.official && e.type !== "official" ? `<span class="chip chip-official">TOKEN2049 official</span>` : ""}${statusChip(e)}${updatedBadge(e)}</div>
      <h1>${esc(e.title)}</h1>
      <p class="detail-when">${esc(e.end_date ? `${d.label.slice(0, 3)}–${dayOf(e.end_date).label}` : d.long)} · ${esc(timeLabel(e))} <span class="muted small">SGT</span></p>
      <p class="muted" style="margin:0">${esc(e.venue)}</p>
      ${e.status !== "verified" ? `<p class="notice${e.status === "listed" ? " info" : ""}" style="margin-top:14px"><strong>${esc(STATUS[e.status].label)}.</strong> ${esc(e.status_note || STATUS[e.status].desc)}</p>` : ""}

      <section><h2>Why it’s relevant</h2><p>${esc(e.why)}</p><p class="muted">${esc(e.summary)}</p></section>

      ${clashes.length || e.clash_note ? `<section><h2>Clashes</h2>
        ${e.clash_note ? `<p class="notice">${esc(e.clash_note)}</p>` : ""}
        ${clashes.length ? `<p class="small muted">Overlaps ${plural(clashes.length, "other listing")}:</p><div class="event-list">${clashes.map((o) => eventCard(o, { compact: true })).join("")}</div>` : ""}</section>` : ""}

      ${e.people.length || e.also_listed.length ? `<section><h2>People to know</h2>
        ${e.people.length ? `<div class="person-list">${e.people.map((x) => { const p = D.people.get(x.id); const org = D.companies.get(p.org); return `<a class="mini" href="#/people/${p.id}"><span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong><span>${esc(PROLE[x.role])}${org ? ` · ${esc(org.name)}` : p.org_label ? ` · ${esc(p.org_label)}` : ""}</span></span></a>`; }).join("")}</div>` : ""}
        ${e.people.some((x) => x.role === "listed") ? `<p class="small muted" style="margin-top:8px">“Listed” means the person appears in connection with this event in our sources. It doesn’t guarantee they will attend.</p>` : ""}
        ${e.also_listed.length ? `<p class="small" style="margin-top:10px"><span class="muted">Audience described in listings:</span> ${e.also_listed.map(esc).join(", ")}</p>` : ""}</section>` : ""}

      ${e.companies.length ? `<section><h2>Companies</h2><div class="co-list">${e.companies.map((x) => companyMini(D.companies.get(x.id), CROLE[x.role])).join("")}</div></section>` : ""}

      ${e.questions?.length ? `<section><h2>Questions worth asking</h2><ul class="questions">${e.questions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}

      <section><h2>Topics</h2><div class="chip-row">
        ${e.ecosystems.map((x) => `<a class="chip chip-outline" href="#/events?eco=${x}">${esc(ECO[x])}</a>`).join("")}
        ${e.audiences.map((x) => `<a class="chip" href="#/events?aud=${x}">${esc(AUD[x])}</a>`).join("")}
        ${e.topics.map((x) => `<a class="chip" href="#/events?topic=${x}">${esc(TOPIC[x])}</a>`).join("")}
        ${e.stack_layers.map((x) => `<a class="chip chip-outline" href="#/stack/${x}">Stack: ${esc(D.layer.get(x).name)}</a>`).join("")}
      </div></section>

      <section><h2>Sources</h2>${srcs.length ? `<ul class="source-list">${srcs.map(sourceItem).join("")}</ul>` : `<p class="notice">No first-party source has been found for this listing.</p>`}
        <p class="small muted" style="margin-top:10px">Last checked ${esc(fmtDate(e.last_updated))}. <a href="${issueUrl("correction.yml", { title: `Correction: ${e.title}`, record: `events/${e.id}` })}" rel="noopener">Report a correction</a></p></section>

      ${related.length ? `<section><h2>Related events</h2><div class="event-list">${related.map((o) => eventCard(o, { compact: true })).join("")}</div></section>` : ""}
    </article>

    <aside aria-label="Key facts">
      <div class="facts">
        <dl class="kv">
          <dt>When</dt><dd>${esc(e.end_date ? dayRange(e) : d.label)}<br><span class="mono">${esc(timeLabel(e))}</span> SGT</dd>
          <dt>Where</dt><dd>${esc(e.venue)}${map ? `<br><a href="https://www.google.com/maps/search/?api=1&query=${map}" rel="noopener" target="_blank">Google Maps</a> · <a href="https://maps.apple.com/?q=${map}" rel="noopener" target="_blank">Apple Maps</a>` : ""}</dd>
          <dt>Access</dt><dd>${esc(ACCESS[e.access])}<span class="def">${esc(e.access_note || "")}</span></dd>
          <dt>Type</dt><dd>${esc(TYPE[e.type])}</dd>
          <dt>Relevance</dt><dd>${esc(REL[e.relevance].label)}<span class="def">${esc(REL[e.relevance].desc)}</span></dd>
          <dt>Verification</dt><dd>${esc(STATUS[e.status].label)}<span class="def">${esc(e.status_note || STATUS[e.status].desc)}</span></dd>
        </dl>
        <div class="actions">
          ${saveBtn(e, true)}
          ${srcs[0] ? `<a class="btn btn-primary" href="${esc(srcs[0].url)}" rel="noopener" target="_blank">${e.type === "official" ? "Official agenda" : "Organiser / registration"} ↗</a>` : ""}
          ${block ? `<button type="button" class="btn" aria-disabled="true" data-ics-blocked="${esc(block)}">Add to calendar</button><span class="def">${esc(block)}</span>` : `<button type="button" class="btn" data-ics="${e.id}">Add to calendar (.ics)</button>`}
          <button type="button" class="btn" data-share="${e.id}">Share link</button>
        </div>
      </div>
    </aside>
  </div>`;
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
    ${p.note ? `<p class="notice" style="margin-top:14px">${esc(p.note)}</p>` : ""}
    ${p.why ? `<section><h2>Why they’re relevant</h2><p>${esc(p.why)}</p></section>` : ""}
    <section><h2>Appearing at</h2>${ev.length ? `<div class="event-list">${ev.map((x) => `<div><p class="small muted" style="margin:0 0 4px">${esc(PROLE[x.role])}</p>${eventCard(x.event, { compact: true })}</div>`).join("")}</div>` : `<p class="muted">No events recorded.</p>`}</section>
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

// ---------------------------------------------------------------- MY SCHEDULE
function schedule(_, q) {
  setMeta("My TOKEN PM schedule", "Your saved prediction-market events at TOKEN2049 Singapore, with clashes and free time.");
  const share = (q.get("share") || "").split(",").filter((id) => D.ev.has(id));
  if (q.has("share")) {
    const list = share.map((id) => D.ev.get(id));
    return `<h1>Shared schedule</h1>
    <p class="lede">Someone shared ${plural(list.length, "event")} with you. Nothing is saved until you choose to.</p>
    <div class="btn-row" style="margin:14px 0"><button class="btn btn-accent" type="button" data-save-all="${share.join(",")}">★ Add all to my schedule</button><a class="btn" href="#/schedule">Open my schedule</a></div>
    ${scheduleDays(list, false)}`;
  }
  const ids = saved.all().filter((id) => D.ev.has(id));
  const list = ids.map((id) => D.ev.get(id));
  const clashPairs = list.flatMap((a) => list.filter((b) => a.id < b.id && overlaps(a, b)).map((b) => [a, b]));
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
  ${scheduleDays(list, true)}` : `<div class="empty"><p>Nothing saved yet.</p><p>Tap ★ on any event to add it here.</p><div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="#/start?at=finder">Build a shortlist</a><a class="btn" href="#/calendar">Browse the calendar</a></div></div>`}`;
}
function scheduleDays(list, mine) {
  return D.days.map((d) => {
    const day = list.filter((e) => eventDays(e).includes(d.date)).sort((a, b) => sortKey(a, d.date).localeCompare(sortKey(b, d.date)));
    if (!day.length) return "";
    return `<section class="sched-day"><h2 class="day-heading">${esc(d.long)} <span class="n">${day.length}</span></h2>${agenda(day, d.date, { gaps: true, clashLabel: mine ? "Clash: you’ll need to choose" : "Overlap" })}</section>`;
  }).join("");
}

// ---------------------------------------------------------------- ABOUT
function about() {
  setMeta("About & sources", "How this unofficial directory of prediction markets at TOKEN2049 Singapore is compiled, what’s still being checked, and every source.");
  const srcs = [...D.sources.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const updated = D.events.filter((e) => e.last_updated > D.site.last_updated);
  return `<h1>About this directory</h1>
  <p class="lede">An independent, unofficial guide to where prediction markets actually show up during TOKEN2049 Singapore week, 5–9 October 2026. Curated by ${curator()}.</p>
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
      <div class="panel"><h3>Relevance</h3>${Object.entries(REL).map(([k, v]) => `<p>${relChip(k)}<span class="def">${esc(v.desc)}</span></p>`).join("")}<p class="def">These labels describe how directly an event relates to prediction markets. They are not a ranking of quality.</p></div>
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
    <div class="btn-row"><a class="btn btn-primary" href="${issueUrl("missing-event.yml")}" rel="noopener">Suggest a missing event</a><a class="btn" href="${issueUrl("correction.yml")}" rel="noopener">Report a correction</a></div>
  </section>

  <section class="section"><h2>What this directory leaves out</h2>
    <p>This directory is public. It doesn’t include private contact details, relationship notes, outreach status, ticket codes, promo codes or unpublished commercial information. Social-media claims that couldn’t be independently checked have been left out. Inclusion doesn’t mean endorsement, and this site is not affiliated with TOKEN2049 or any listed organiser.</p>
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
    b.closest(".event-card")?.classList.toggle("is-saved", on);
  });
  updateCounts();
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
      b.closest(".event-card")?.classList.toggle("is-saved", on);
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

document.addEventListener("click", (ev) => {
  const t = ev.target;
  const sv = t.closest("[data-save]");
  if (sv) { ev.preventDefault(); ev.stopPropagation(); onSaveToggle(sv.dataset.save, sv); return; }
  const all = t.closest("[data-save-all]");
  if (all) {
    const ids = all.dataset.saveAll.split(",").filter((id) => D.ev.has(id));
    const before = saved.all();
    saved.add(ids);
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
  const sh = t.closest("[data-share]");
  if (sh) { const e = D.ev.get(sh.dataset.share); share(absUrl(evUrl(e)), e.title); return; }
  if (t.closest("[data-share-schedule]")) { share(absUrl(`#/schedule?share=${saved.all().filter((id) => D.ev.has(id)).join(",")}`), "My TOKEN2049 prediction-market schedule"); return; }
  if (t.closest("[data-clear-saved]")) {
    const before = saved.all();
    if (confirm(`Remove all ${before.length} saved events?`)) { saved.clear(); render({ keepScroll: true }); toast("Schedule cleared", { label: "Undo", run: () => { saved.write(before); render({ keepScroll: true }); } }); }
    return;
  }
  const back = t.closest("[data-back]");
  if (back && navDepth > 0) { ev.preventDefault(); history.back(); return; }
  if (t.closest("[data-open-more]")) { document.getElementById("more-sheet").showModal(); return; }
  const more = document.getElementById("more-sheet");
  if (more.open && (t === more || t.closest("#more-sheet [data-close]") || t.closest("#more-sheet a"))) more.close();
});

window.addEventListener("hashchange", () => { navDepth++; render(); });
window.addEventListener("storage", (e) => { if (e.key?.startsWith("tpm2049:saved")) rerenderIfNeeded(); });

(async function init() {
  try {
    await loadData();
  } catch (err) {
    view().innerHTML = `<h1>Couldn’t load the directory</h1><p>${esc(err.message)}</p><p class="muted">If you opened this file directly from your computer, run a local web server instead (see README).</p>`;
    return;
  }
  document.querySelector("[data-footer-meta]").innerHTML =
    `Last updated ${esc(fmtDate(D.site.last_updated))} · Times in ${esc(D.site.timezone)} · Curated by ${curator()} · <a href="#/about">How this is compiled</a> · <a href="${issueUrl("missing-event.yml")}" rel="noopener">Submit something we missed</a>`;
  render();
})();
