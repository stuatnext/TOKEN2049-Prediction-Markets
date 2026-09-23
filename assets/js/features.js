// On-the-day and planning features: Now & Next, Plan my day, travel times,
// application tracker, following people, week grid, "changed since your last
// visit", search, readable mode, daily briefing, share image and the post-week recap.
//
// Kept separate from app.js so the core directory stays readable. app.js calls
// installFeatures(ctx) once at start-up and places the returned hooks where they belong.

export async function installFeatures(C) {
  const { D, esc, plural, dayOf, eventsOn, sortKey, toMin, fmtMin, fmtDuration, isAllDay, timeLabel, sgtNow,
    saved, toast, setMeta, parseHash, setQuery, render, eventRow, saveBtn, evUrl, absUrl, download, icsBlocker,
    REL, ACCESS, INTERESTS, ROLES, fmtDate, issueUrl, norm, matches, eventDays } = C;

  // ---------------------------------------------------------------- storage
  const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const K = { apps: "tpm2049:apps:v1", follow: "tpm2049:follow:v1", snap: "tpm2049:snap:v1", changes: "tpm2049:changes:v1", readable: "tpm2049:readable" };
  const rerender = () => render({ keepScroll: true });

  // ---------------------------------------------------------------- venues & travel
  let VENUES = [];
  try { VENUES = await fetch("data/venues.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])); } catch { VENUES = []; }
  const venueOf = (e) => { const v = (e.venue || "").toLowerCase(); return VENUES.find((x) => x.match.some((m) => v.includes(m))) || null; };
  const metres = (a, b) => {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  /** Rough door-to-door estimate between two events' venues. Null when a venue is unknown. */
  function travel(a, b) {
    const va = venueOf(a), vb = venueOf(b);
    if (!va || !vb) return null;
    if (va.id === vb.id) return { mins: 3, text: "same venue", same: true, from: va, to: vb };
    const d = metres(va, vb) * 1.3; // streets aren't straight lines
    const walk = Math.max(3, Math.round(d / 80));
    if (walk <= 20) return { mins: walk, text: `about ${walk} min walk`, from: va, to: vb };
    const taxi = Math.round(d / 400) + 8;
    return { mins: taxi, text: `about ${taxi} min by taxi or MRT (${walk} min on foot)`, from: va, to: vb };
  }
  const dirUrl = (e) => `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${encodeURIComponent(e.map_query || e.venue)}`;

  // ---------------------------------------------------------------- application tracker
  const APP = { applied: "Applied", approved: "Approved", waitlist: "Waitlisted", declined: "Declined" };
  const needsApply = (e) => ["approval", "invite", "waitlist", "registration"].includes(e.access);
  const apps = { all: () => store.get(K.apps, {}), get: (id) => store.get(K.apps, {})[id] || null, set(id, v) { const m = this.all(); if (v) m[id] = v; else delete m[id]; store.set(K.apps, m); } };
  const appPill = (id) => { const s = apps.get(id); return s ? `<span class="app-pill app-${s}">${esc(APP[s])}${s === "approved" ? " ✓" : ""}</span>` : ""; };

  // ---------------------------------------------------------------- following people
  const follow = { all: () => new Set(store.get(K.follow, [])), has: (id) => follow.all().has(id), toggle(id) { const s = follow.all(); const on = !s.has(id); on ? s.add(id) : s.delete(id); store.set(K.follow, [...s]); return on; } };

  // ---------------------------------------------------------------- changed since last visit
  const sig = (e) => [e.date, e.end_date, e.start, e.end, e.venue, e.access, e.status].join("|");
  (function trackChanges() {
    const cur = Object.fromEntries(D.events.map((e) => [e.id, sig(e)]));
    const prev = store.get(K.snap, null);
    if (prev?.ev) {
      const changed = Object.keys(cur).filter((id) => prev.ev[id] && prev.ev[id] !== cur[id]);
      const added = Object.keys(cur).filter((id) => !prev.ev[id]);
      if (changed.length || added.length) {
        const old = store.get(K.changes, { changed: [], added: [] });
        store.set(K.changes, { changed: [...new Set([...old.changed, ...changed])], added: [...new Set([...old.added, ...added])], since: prev.t });
      }
    }
    store.set(K.snap, { t: Date.now(), ev: cur });
  })();
  const changes = () => { const c = store.get(K.changes, { changed: [], added: [] }); return { changed: c.changed.filter((id) => D.ev.has(id)), added: c.added.filter((id) => D.ev.has(id)), since: c.since }; };
  function changesBanner() {
    const c = changes();
    const n = c.changed.length + c.added.length;
    if (!n) return "";
    const mine = [...c.changed, ...c.added].filter((id) => saved.has(id)).length;
    const list = [...c.changed.map((id) => [id, "Changed"]), ...c.added.map((id) => [id, "New"])];
    return `<div class="changes-banner" role="status">
      <p><strong>Since your last visit:</strong> ${[c.changed.length ? plural(c.changed.length, "listing") + " changed" : "", c.added.length ? plural(c.added.length, "new listing") : ""].filter(Boolean).join(" and ")}${mine ? `, including <b>${plural(mine, "event")} in your schedule</b>` : ""}.</p>
      <details class="fold"><summary>Show what changed</summary><div class="row-list">${list.map(([id]) => eventRow(D.ev.get(id))).join("")}</div></details>
      <button type="button" class="btn btn-small" data-changes-dismiss>Got it</button></div>`;
  }

  // ---------------------------------------------------------------- scoring shared by Plan and Now
  function scoreFor(e, { ints = [], role = "", inv = false } = {}) {
    let s = { core: 6, strong: 4, wildcard: 2, adjacent: 1 }[e.relevance] + (e.score || 0) * 0.5;
    for (const i of ints) if (INTERESTS[i]?.test(e)) s += 3;
    const R = ROLES[role];
    if (R) { let a = 0; for (const x of e.audiences) a = Math.max(a, R.aud[x] || 0); s += a; }
    if (["invite", "waitlist", "sold-out"].includes(e.access)) s += inv ? -1 : -5;
    if (e.status === "provisional") s -= 4;
    if (saved.has(e.id)) s += 3;
    if (apps.get(e.id) === "approved") s += 4;
    if (apps.get(e.id) === "declined") s -= 20;
    return s;
  }

  // ---------------------------------------------------------------- PLAN MY DAY
  function buildPlan(day, opts) {
    const timed = eventsOn(day).filter((e) => e.start && e.end && !e.end_date && e.status !== "provisional")
      .map((e) => ({ e, s: scoreFor(e, opts), a: toMin(e.start), b: toMin(e.end) })).filter((x) => x.s > 2)
      .sort((x, y) => x.b - y.b || x.a - y.a);
    // Weighted interval scheduling, with travel time between venues as the gap rule.
    const best = [], prev = [];
    timed.forEach((x, i) => {
      best[i] = x.s; prev[i] = -1;
      for (let j = 0; j < i; j++) {
        const y = timed[j];
        const t = travel(y.e, x.e);
        if (y.b + (t ? t.mins : 10) <= x.a && best[j] + x.s > best[i]) { best[i] = best[j] + x.s; prev[i] = j; }
      }
    });
    let k = best.length ? best.indexOf(Math.max(...best)) : -1;
    const chosen = [];
    while (k >= 0) { chosen.unshift(timed[k]); k = prev[k]; }
    const ids = new Set(chosen.map((x) => x.e.id));
    const backups = new Map(chosen.map((c) => [c.e.id, timed.filter((x) => !ids.has(x.e.id) && x.a < c.b && c.a < x.b).sort((p, q) => q.s - p.s).slice(0, 2).map((x) => x.e)]));
    const anytime = eventsOn(day).filter((e) => isAllDay(e) && e.status !== "provisional" && scoreFor(e, opts) >= 6);
    const unconfirmed = eventsOn(day).filter((e) => (e.start && !e.end) || (!e.start && !isAllDay(e))).filter((e) => scoreFor(e, opts) >= 6);
    return { chosen: chosen.map((x) => x.e), backups, anytime, unconfirmed };
  }

  function plan(_, q) {
    setMeta("Plan my day", "Pick a TOKEN2049 day and your interests, and get a clash-free prediction-market plan with travel time and backups.");
    const now = sgtNow(q.get("now"));
    const day = D.dayBy.has(q.get("day")) ? q.get("day") : D.dayBy.has(now.date) ? now.date : D.site.main_days[D.site.main_days.length - 1];
    const ints = (q.get("int") || "").split(",").filter((x) => INTERESTS[x]);
    const role = ROLES[q.get("role")] ? q.get("role") : "";
    const inv = q.get("inv") === "1";
    const P = buildPlan(day, { ints, role, inv });
    const link = (over) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(over)) v ? n.set(k, v) : n.delete(k); return `#/plan?${n.toString().replace(/%2C/g, ",")}`; };
    const toggleInt = (i) => { const s = new Set(ints); s.has(i) ? s.delete(i) : s.add(i); return link({ int: [...s].join(",") }); };
    let body = "";
    P.chosen.forEach((e, i) => {
      if (i > 0) {
        const p = P.chosen[i - 1], t = travel(p, e), free = toMin(e.start) - toMin(p.end);
        body += `<div class="plan-leg"><span aria-hidden="true">${t?.same ? "📍" : "🚶"}</span> ${t ? esc(t.same ? "Same venue" : cap(t.text)) : "Venue not confirmed: allow extra time"} · ${free > 0 ? `${fmtDuration(free)} between` : "back to back"}</div>`;
      }
      const bu = P.backups.get(e.id) || [];
      body += `<div class="plan-stop">${eventRow(e)}${bu.length ? `<p class="plan-backup">Backup: ${bu.map((b) => `<a href="${evUrl(b)}">${esc(b.title)}</a> <span class="muted">(${esc(timeLabel(b))})</span>`).join(" · ")}</p>` : ""}</div>`;
    });
    return `<section class="hero hero-sm"><p class="eyebrow">Plan my day</p><h1>Your day, planned for you</h1>
      <p class="lede">Pick a day and what you care about. We pick the best event from each clash, leave time to get between venues, and suggest backups.</p></section>
    <div class="panel plan-form">
      <p class="pf-label">Day</p><div class="day-pills">${D.days.map((d) => `<a href="${link({ day: d.date })}"${d.date === day ? ' aria-current="true"' : ""}>${esc(d.label.slice(0, 3))} ${d.label.slice(4, 6).trim()}</a>`).join("")}</div>
      <p class="pf-label">I care most about <span class="muted">(optional)</span></p><div class="chip-row chip-scroll">${Object.entries(INTERESTS).map(([k, v]) => `<a class="toggle" href="${toggleInt(k)}" aria-pressed="${ints.includes(k)}">${esc(v.label)}</a>`).join("")}</div>
      <p class="pf-label">I am a… <span class="muted">(optional)</span></p><div class="chip-row chip-scroll">${Object.entries(ROLES).map(([k, v]) => `<a class="toggle" href="${link({ role: role === k ? "" : k })}" aria-pressed="${role === k}">${esc(v.label)}</a>`).join("")}</div>
      <label class="pf-check"><input type="checkbox" data-plan-inv ${inv ? "checked" : ""}> Include invite-only and waitlisted events</label>
    </div>
    <section class="section" aria-labelledby="h-plan">
      <div class="section-head"><div><h2 id="h-plan">${esc(dayOf(day).long)}</h2><p class="section-sub">${P.chosen.length ? `${plural(P.chosen.length, "event")}, no clashes. Walking times are estimates.` : "Nothing fits these choices yet."}</p></div>
        ${P.chosen.length ? `<button type="button" class="btn btn-accent" data-save-all="${P.chosen.map((e) => e.id).join(",")}">★ Save this plan</button>` : ""}</div>
      ${P.chosen.length ? `<div class="plan-list">${body}</div>` : `<p class="empty">Try another day, or include invite-only events.</p>`}
      ${P.anytime.length ? `<h3 class="subhead">Drop in any time that day</h3><div class="row-list">${P.anytime.map(eventRow).join("")}</div>` : ""}
      ${P.unconfirmed.length ? `<h3 class="subhead">Worth a look, times not confirmed</h3><div class="row-list">${P.unconfirmed.map(eventRow).join("")}</div>` : ""}
    </section>`;
  }
  C.afterRender.plan = () => {
    C.PAGE().querySelector("[data-plan-inv]")?.addEventListener("change", (ev) => { const { q } = parseHash(); ev.target.checked ? q.set("inv", "1") : q.delete("inv"); setQuery(q); rerender(); });
  };

  // ---------------------------------------------------------------- NOW & NEXT
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const inMins = (m) => (m < 60 ? `${m} min` : fmtDuration(m));
  let nowTimer = null;
  function nowPage(_, q) {
    setMeta("Now & next", "What’s on right now and in the next two hours at TOKEN2049 Singapore, with walking times.");
    const real = sgtNow(q.get("now"));
    const inWeek = D.dayBy.has(real.date);
    const pday = D.dayBy.has(q.get("pday")) ? q.get("pday") : D.site.main_days[D.site.main_days.length - 1];
    const t = inWeek ? real : { date: pday, min: toMin(q.get("pt") || "15:00") };
    const scope = ["pm", "all", "saved"].includes(q.get("scope")) ? q.get("scope") : "pm";
    const pass = (e) => (scope === "all" ? true : scope === "saved" ? saved.has(e.id) : e.relevance !== "adjacent");
    const today = eventsOn(t.date).filter(pass);
    const live = today.filter((e) => e.start && e.end && !e.end_date && toMin(e.start) <= t.min && t.min < toMin(e.end));
    const soon = today.filter((e) => e.start && toMin(e.start) > t.min && toMin(e.start) <= t.min + 120);
    const later = today.filter((e) => e.start && toMin(e.start) > t.min + 120);
    const allday = today.filter(isAllDay);
    // Where you probably are: a saved event on now, else the last saved one earlier today.
    const mineToday = eventsOn(t.date).filter((e) => saved.has(e.id) && e.start);
    const here = mineToday.find((e) => e.end && toMin(e.start) <= t.min && t.min < toMin(e.end)) || mineToday.filter((e) => toMin(e.end || e.start) <= t.min).pop();
    const nextMine = D.events.filter((e) => saved.has(e.id) && e.start && (e.date > t.date || (e.date === t.date && toMin(e.start) >= t.min))).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))[0];
    const item = (e, kind) => {
      const tr = here && here.id !== e.id ? travel(here, e) : null;
      const when = kind === "live" ? `Ends in ${inMins(toMin(e.end) - t.min)}` : kind === "soon" ? `Starts in ${inMins(toMin(e.start) - t.min)}` : "";
      return `<div class="now-item">${eventRow(e)}<p class="now-meta">${when ? `<b>${when}</b>` : ""}${tr ? `<span>${tr.same ? "📍 Same venue as where you are" : `🚶 ${esc(cap(tr.text))} from ${esc(tr.from.name)}`}</span>` : ""}<a href="${dirUrl(e)}" target="_blank" rel="noopener">Directions ↗</a></p></div>`;
    };
    const scopeLink = (s) => { const n = new URLSearchParams(q); n.set("scope", s); return `#/now?${n}`; };
    const d = dayOf(t.date);
    return `<section class="hero hero-sm"><p class="eyebrow">Now & next</p><h1>${inWeek ? "What’s on now" : "Now & next (preview)"}</h1>
      <p class="lede now-clock"><b>${esc(d.long)}</b> · <span class="mono">${fmtMin(t.min)}</span> Singapore time</p></section>
    ${inWeek ? "" : `<div class="notice info"><p style="margin:0 0 8px">During TOKEN week (5–9 Oct) this page shows what’s on right now. Until then, preview any day and time:</p>
      <div class="day-pills">${D.days.map((x) => `<a href="#/now?pday=${x.date}&pt=${fmtMin(t.min)}&scope=${scope}"${x.date === t.date ? ' aria-current="true"' : ""}>${esc(x.label.slice(0, 3))}</a>`).join("")}</div>
      <div class="day-pills" style="margin-top:6px">${["09:30", "11:00", "13:00", "15:00", "17:30", "19:30"].map((hm) => `<a href="#/now?pday=${t.date}&pt=${hm}&scope=${scope}"${hm === fmtMin(t.min) ? ' aria-current="true"' : ""}>${hm}</a>`).join("")}</div></div>`}
    <div class="segmented" role="group" aria-label="Show" style="margin-top:16px"><a href="${scopeLink("pm")}" aria-pressed="${scope === "pm"}">Prediction markets</a><a href="${scopeLink("all")}" aria-pressed="${scope === "all"}">Everything</a><a href="${scopeLink("saved")}" aria-pressed="${scope === "saved"}">★ My schedule</a></div>
    ${nextMine ? `<div class="next-mine"><p class="eyebrow">Your next saved event</p>${item(nextMine, nextMine.date === t.date ? "soon" : "")}</div>` : ""}
    <section class="section"><div class="section-head"><h2>Happening now</h2><span class="muted small">${live.length}</span></div>
      ${live.length ? live.map((e) => item(e, "live")).join("") : `<p class="muted">Nothing ${scope === "saved" ? "from your schedule " : ""}is on right now.</p>`}
      ${allday.length ? `<details class="fold"><summary>Also open all day (${allday.length})</summary><div class="row-list">${allday.map(eventRow).join("")}</div></details>` : ""}</section>
    <section class="section"><div class="section-head"><h2>Starting in the next 2 hours</h2><span class="muted small">${soon.length}</span></div>
      ${soon.length ? soon.map((e) => item(e, "soon")).join("") : `<p class="muted">Nothing starting soon.</p>`}</section>
    ${later.length ? `<section class="section"><div class="section-head"><h2>Later today</h2><a class="more" href="#/calendar/${d.slug}">Full day →</a></div><div class="row-list">${later.map(eventRow).join("")}</div></section>` : ""}
    <p class="small muted" style="margin-top:24px">Walking times are rough estimates between approximate venue locations. <a href="#/plan?day=${t.date}">Plan the rest of the day →</a></p>`;
  }
  C.afterRender.now = () => {
    clearInterval(nowTimer);
    const { q } = parseHash();
    if (D.dayBy.has(sgtNow(q.get("now")).date)) nowTimer = setInterval(() => { if (parseHash().parts[0] === "now") rerender(); else clearInterval(nowTimer); }, 60000);
  };

  // ---------------------------------------------------------------- DAILY BRIEFING
  function briefing(parts) {
    const d = D.days.find((x) => x.slug === parts[0]) || dayOf(D.site.main_days[0]);
    setMeta(`Briefing: ${d.long}`, `The prediction-market events at TOKEN2049 on ${d.long}, ready to copy and post.`);
    const list = eventsOn(d.date).filter((e) => (e.relevance === "core" || e.relevance === "strong") && e.status !== "provisional").slice(0, 12);
    const url = absUrl(`#/calendar/${d.slug}`);
    const text = [`Prediction markets at TOKEN2049: ${d.long} (SGT)`, "", ...list.map((e) => `${e.start || (isAllDay(e) ? "All day" : "TBC")}  ${e.title} (${e.venue.split(",")[0]})`), "", `Full guide: ${url}`].join("\n");
    const short = `Prediction markets at TOKEN2049, ${d.label}: ${list.slice(0, 4).map((e) => e.title).join("; ")}…`;
    return `<section class="hero hero-sm"><p class="eyebrow">Daily briefing</p><h1>${esc(d.long)}</h1>
      <p class="lede">A ready-to-post list of the day’s prediction-market events. Copy it into LinkedIn, X, Telegram or a group chat.</p></section>
    <div class="day-pills">${D.days.map((x) => `<a href="#/briefing/${x.slug}"${x.date === d.date ? ' aria-current="true"' : ""}>${esc(x.label.slice(0, 3))}</a>`).join("")}</div>
    <textarea class="brief-text" readonly rows="${Math.min(18, list.length + 5)}" aria-label="Briefing text">${esc(text)}</textarea>
    <div class="btn-row"><button type="button" class="btn btn-accent" data-copy="${esc(text)}">Copy text</button>
      <a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/tweet?text=${encodeURIComponent(short)}&url=${encodeURIComponent(url)}">Post on X ↗</a>
      <a class="btn" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">Share on LinkedIn ↗</a></div>`;
  }

  // ---------------------------------------------------------------- SEARCH (events, people, companies)
  function searchResults(text) {
    if (!text.trim()) return `<p class="muted small">Try a name, company, venue or topic: “Andy Ross”, “Kalshi”, “Suntec”, “sports”.</p>`;
    const ev = D.events.filter((e) => matches(e._hay, text)).slice(0, 6);
    const pp = [...D.people.values()].filter((p) => matches(norm(`${p.name} ${p.role || ""} ${p.org_label || ""} ${D.companies.get(p.org)?.name || ""}`), text)).slice(0, 6);
    const cc = [...D.companies.values()].filter((c) => matches(norm(c.name), text)).slice(0, 5);
    if (!ev.length && !pp.length && !cc.length) return `<p class="muted">No matches. Try fewer words.</p>`;
    const nextFor = (p) => (D.personEvents.get(p.id) || []).map((x) => x.event).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))[0];
    return `${pp.length ? `<p class="sr-head">People</p>${pp.map((p) => { const n = nextFor(p); return `<a class="sr-item" href="#/people/${p.id}"><strong>${esc(p.name)}</strong><span>${esc(p.role || D.companies.get(p.org)?.name || p.org_label || "")}${n ? ` · next: ${esc(dayOf(n.date).label.slice(0, 3))} ${esc(n.start || "")} ${esc(n.title)}` : ""}</span></a>`; }).join("")}` : ""}
      ${ev.length ? `<p class="sr-head">Events</p>${ev.map((e) => `<a class="sr-item" href="${evUrl(e)}"><strong>${esc(e.title)}</strong><span>${esc(dayOf(e.date).label)} · ${esc(timeLabel(e))} · ${esc(e.venue)}</span></a>`).join("")}` : ""}
      ${cc.length ? `<p class="sr-head">Companies</p>${cc.map((c) => `<a class="sr-item" href="#/companies/${c.id}"><strong>${esc(c.name)}</strong></a>`).join("")}` : ""}`;
  }
  function openSearch() {
    const dlg = document.getElementById("search-sheet");
    if (!dlg) return;
    document.getElementById("more-sheet")?.open && document.getElementById("more-sheet").close();
    dlg.showModal();
    const input = dlg.querySelector("input");
    input.value = "";
    dlg.querySelector("[data-search-results]").innerHTML = searchResults("");
    setTimeout(() => input.focus(), 30);
  }
  const sdlg = document.getElementById("search-sheet");
  if (sdlg) {
    sdlg.querySelector("input").addEventListener("input", (ev) => { sdlg.querySelector("[data-search-results]").innerHTML = searchResults(ev.target.value); });
    sdlg.addEventListener("click", (ev) => { if (ev.target === sdlg || ev.target.closest("[data-close]") || ev.target.closest("a")) sdlg.close(); });
  }

  // ---------------------------------------------------------------- readable (large text / sunlight) mode
  const applyReadable = () => { const on = store.get(K.readable, false); document.documentElement.toggleAttribute("data-readable", !!on); document.querySelectorAll("[data-readable-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(!!on))); };
  applyReadable();

  // ---------------------------------------------------------------- offline status
  async function offlineStatus() {
    const el = document.querySelector("[data-offline-status]");
    if (!el) return;
    let ready = false;
    try { ready = !!(navigator.serviceWorker?.controller && (await caches.match("data/events.json"))); } catch { ready = false; }
    el.textContent = !navigator.onLine ? "You’re offline: showing the saved copy" : ready ? "✓ Saved for offline use" : "Open once online to save an offline copy";
  }
  window.addEventListener("online", () => { offlineStatus(); toast("Back online"); });
  window.addEventListener("offline", () => { offlineStatus(); toast("You’re offline. Showing the saved copy."); });
  setTimeout(offlineStatus, 1500);

  // ---------------------------------------------------------------- week grid, travel check, follow list, share image (My schedule)
  const PARTS = [["Morning", 0, 12 * 60], ["Afternoon", 12 * 60, 17 * 60], ["Evening", 17 * 60, 24 * 60]];
  function weekGrid(list) {
    const cell = (d, a, b) => {
      const es = list.filter((e) => eventDays(e).includes(d.date) && (isAllDay(e) ? a === 0 : e.start && toMin(e.start) >= a && toMin(e.start) < b));
      if (!es.length) return `<td class="wg-free">Free</td>`;
      return `<td>${es.slice(0, 2).map((e) => `<a href="${evUrl(e)}">${esc(e.title.length > 34 ? e.title.slice(0, 32) + "…" : e.title)}</a>`).join("")}${es.length > 2 ? `<span class="muted">+${es.length - 2}</span>` : ""}</td>`;
    };
    return `<div class="week-grid"><table><thead><tr><th scope="col"></th>${PARTS.map(([p]) => `<th scope="col">${p}</th>`).join("")}</tr></thead>
      <tbody>${D.days.map((d) => `<tr><th scope="row">${esc(d.label.slice(0, 3))}<small>${d.label.slice(4, 6).trim()}</small></th>${PARTS.map(([, a, b]) => cell(d, a, b)).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function travelCheck(list) {
    const warn = [], ok = [];
    for (const d of D.days) {
      const day = list.filter((e) => e.date === d.date && e.start && e.end && !e.end_date).sort((a, b) => toMin(a.start) - toMin(b.start));
      for (let i = 1; i < day.length; i++) {
        const a = day[i - 1], b = day[i];
        const gap = toMin(b.start) - toMin(a.end);
        if (gap < 0) continue; // an overlap: already shown as a clash
        const t = travel(a, b);
        if (t && t.mins > gap) warn.push(`⚠ <b>${esc(d.label.slice(0, 3))}:</b> ${esc(a.title)} ends ${esc(a.end)}; ${esc(b.title)} starts ${esc(b.start)}. Getting there takes ${esc(t.text)}${gap ? `, but you only have ${gap} min` : ""}.`);
        else if (!t && gap < 20) warn.push(`⚠ <b>${esc(d.label.slice(0, 3))}:</b> only ${gap} min between ${esc(a.title)} and ${esc(b.title)}, and one venue isn’t confirmed.`);
        else ok.push(1);
      }
    }
    if (!warn.length && !ok.length) return "";
    return `<div class="heads-up"><p class="eyebrow">Travel check</p>${warn.map((w) => `<p class="hu-warn">${w}</p>`).join("")}${ok.length ? `<p class="hu-ok">✓ ${plural(ok.length, "other transfer")} ${ok.length === 1 ? "looks" : "look"} fine.</p>` : ""}</div>`;
  }
  function applicationsSummary(list) {
    const need = list.filter(needsApply);
    if (!need.length) return "";
    const by = (s) => need.filter((e) => apps.get(e.id) === s).length;
    const none = need.filter((e) => !apps.get(e.id));
    return `<div class="heads-up"><p class="eyebrow">Applications</p><p>${plural(need.length, "saved event")} ${need.length === 1 ? "needs" : "need"} registration or approval: <b>${by("approved")} approved</b>, ${by("applied")} applied, ${by("waitlist")} waitlisted${by("declined") ? `, ${by("declined")} declined` : ""}.</p>
      ${none.length ? `<p class="small">Not applied yet: ${none.map((e) => `<a href="${evUrl(e)}">${esc(e.title)}</a>`).join(" · ")}</p>` : ""}<p class="small muted">Track each one on its event page.</p></div>`;
  }
  function followList() {
    const ids = [...follow.all()].filter((id) => D.people.has(id));
    if (!ids.length) return `<p class="muted small">Tap “Follow” on anyone’s profile to see where they’ll be here.</p>`;
    return ids.map((id) => {
      const p = D.people.get(id);
      const evs = (D.personEvents.get(id) || []).map((x) => x.event).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      return `<div class="follow-item"><p><a href="#/people/${id}"><strong>${esc(p.name)}</strong></a> <span class="muted">${esc(p.role || D.companies.get(p.org)?.name || "")}</span></p>
        ${evs.length ? `<div class="row-list">${evs.map(eventRow).join("")}</div>` : `<p class="small muted">No events recorded yet.</p>`}</div>`;
    }).join("");
  }
  const gcalUrl = (e) => {
    if (icsBlocker(e)) return null;
    const stamp = (date, hm) => { const [y, m, dd] = date.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, dd, h - 8, mi)).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };
    const nextDay = (iso) => { const x = new Date(iso + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
    const dates = e.start && e.end ? `${stamp(e.date, e.start)}/${stamp(e.date, e.end)}` : `${e.date.replace(/-/g, "")}/${nextDay(e.end_date || e.date)}`;
    const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, location: e.venue, details: `${e.summary}\n\nDetails: ${absUrl(evUrl(e))}` });
    return `https://calendar.google.com/calendar/render?${p}`;
  };
  function shareImage(list, name) {
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0b0b0b"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#FFD100"; g.fillRect(0, H - 24, W, 24);
    g.font = "600 34px system-ui, sans-serif"; g.fillText("TOKEN2049 SINGAPORE · 5–9 OCT 2026", 80, 120);
    g.fillStyle = "#fff"; g.font = "700 76px Georgia, serif";
    g.fillText(name ? `${name}’s TOKEN week` : "My TOKEN2049 week", 80, 220);
    g.fillStyle = "#cfcfc9"; g.font = "400 34px system-ui, sans-serif"; g.fillText("Prediction-market events I’m going to:", 80, 290);
    const items = list.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b))).slice(0, 9);
    let y = 380;
    for (const e of items) {
      g.fillStyle = "#FFD100"; g.font = "600 32px ui-monospace, Menlo, monospace";
      g.fillText(`${dayOf(e.date).label.slice(0, 3)} ${e.start || "·····"}`, 80, y);
      g.fillStyle = "#fff"; g.font = "600 34px system-ui, sans-serif";
      let t = e.title; while (g.measureText(t).width > 700 && t.length > 4) t = t.slice(0, -2);
      g.fillText(t === e.title ? t : t + "…", 300, y);
      y += 86;
    }
    if (list.length > items.length) { g.fillStyle = "#cfcfc9"; g.font = "400 30px system-ui, sans-serif"; g.fillText(`+ ${list.length - items.length} more`, 300, y); }
    g.fillStyle = "#cfcfc9"; g.font = "400 30px system-ui, sans-serif"; g.fillText("Find me there · Prediction Markets @ TOKEN2049", 80, H - 70);
    return cv;
  }

  // ---------------------------------------------------------------- AFTER THE WEEK
  function recap(q) {
    const now = sgtNow(q.get("now"));
    if (now.date <= D.days[D.days.length - 1].date) return "";
    const core = D.events.filter((e) => e.relevance === "core" && e.status !== "provisional");
    const S = D.site.curator.summit;
    return `<section class="recap panel"><p class="eyebrow">TOKEN2049 week has wrapped</p><h2>What happened in prediction markets</h2>
      <p>${plural(core.length, "prediction-market event")} and ${D.going.length} people and companies across five days. The directory stays online as a record.</p>
      <details class="fold"><summary>The prediction-market events</summary><div class="row-list">${core.map(eventRow).join("")}</div></details>
      <div class="btn-row" style="margin-top:12px"><a class="btn btn-accent" href="${esc(S.url)}" target="_blank" rel="noopener">Next: ${esc(S.name)}, ${esc(S.dates)} ↗</a><a class="btn" href="#/nextpredict">Stay in touch with NEXTPredict</a></div></section>`;
  }

  // ---------------------------------------------------------------- navigation changes during the week
  (function weekNav() {
    const { q } = parseHash();
    if (!D.dayBy.has(sgtNow(q.get("now")).date)) return;
    const bar = document.querySelector(".tabbar");
    const events = bar?.querySelector('[data-nav="events"]');
    if (events) {
      events.href = "#/now"; events.dataset.nav = "now";
      events.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13 3L5 13h6l-1 8 8-10h-6z"/></svg><span>Now</span>`;
      bar.prepend(events); // "Now" becomes the first tab during TOKEN week
    }
    const nav = document.querySelector(".main-nav");
    if (nav && !nav.querySelector('[data-nav="now"]')) nav.insertAdjacentHTML("afterbegin", `<a href="#/now" data-nav="now">⚡ Now</a>`);
  })();

  // ---------------------------------------------------------------- click handling for all of the above
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    const a = t.closest("[data-app-set]");
    if (a) { const [id, v] = a.dataset.appSet.split(":"); apps.set(id, apps.get(id) === v ? null : v); rerender(); return; }
    const f = t.closest("[data-follow]");
    if (f) { const on = follow.toggle(f.dataset.follow); toast(on ? "Following. They’ll show up in My schedule." : "Unfollowed"); rerender(); return; }
    if (t.closest("[data-changes-dismiss]")) { store.set(K.changes, { changed: [], added: [] }); rerender(); return; }
    if (t.closest("[data-open-search]")) { ev.preventDefault(); openSearch(); return; }
    if (t.closest("[data-readable-toggle]")) { store.set(K.readable, !store.get(K.readable, false)); applyReadable(); toast(store.get(K.readable, false) ? "Larger text and higher contrast on" : "Standard text"); return; }
    const img = t.closest("[data-share-image]");
    if (img) {
      const list = saved.all().map((id) => D.ev.get(id)).filter(Boolean);
      if (!list.length) { toast("Save some events first"); return; }
      const name = (document.querySelector("[data-share-name]")?.value || "").trim().slice(0, 30);
      shareImage(list, name).toBlob(async (blob) => {
        const file = new File([blob], "my-token2049-week.png", { type: "image/png" });
        try {
          if (img.dataset.shareImage === "share" && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "My TOKEN2049 week" }); return; }
        } catch { /* fall back to download */ }
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement("a"), { href: url, download: "my-token2049-week.png" });
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, "image/png");
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && !ev.target.closest("input, textarea, select, [contenteditable]")) { ev.preventDefault(); openSearch(); }
  });

  C.ROUTES.now = nowPage;
  C.ROUTES.plan = plan;
  C.ROUTES.briefing = briefing;

  // ---------------------------------------------------------------- hooks placed by app.js
  return {
    /** Home, just under the hero: quick tools, changes banner, post-week recap. */
    homeTop(q) {
      const inWeek = D.dayBy.has(sgtNow(q.get("now")).date);
      return `${recap(q)}${changesBanner()}
      <nav class="quick-tools" aria-label="Quick tools">
        <a href="#/now"><span aria-hidden="true">⚡</span><strong>${inWeek ? "What’s on now" : "Now & next"}</strong><small>${inWeek ? "Live, with walking times" : "Preview the on-the-day view"}</small></a>
        <a href="#/plan"><span aria-hidden="true">🗺️</span><strong>Plan my day</strong><small>A clash-free day, built for you</small></a>
        <button type="button" data-open-search><span aria-hidden="true">🔎</span><strong>Find anyone</strong><small>People, events, companies</small></button>
      </nav>`;
    },
    /** Small extras on every event row: named people, people you follow, changes, application status. */
    rowBadge(e) {
      const c = changes();
      const named = e.people.filter((p) => p.role !== "listed").length;
      const fol = e.people.filter((p) => follow.has(p.id)).map((p) => D.people.get(p.id)?.name).filter(Boolean);
      return `${c.changed.includes(e.id) ? `<span class="chip chip-warn">Changed</span>` : c.added.includes(e.id) ? `<span class="chip chip-warn">New</span>` : ""}${appPill(e.id)}${fol.length ? `<span class="row-follow">★ ${esc(fol[0])}${fol.length > 1 ? ` +${fol.length - 1}` : ""}</span>` : ""}${named ? `<span class="row-people" title="${plural(named, "person", "people")} named">👥 ${named}</span>` : ""}`;
    },
    /** Extra action buttons on an event page. */
    eventActions(e) {
      const g = gcalUrl(e);
      return `<div class="pa-row">${g ? `<a class="pa-btn" href="${esc(g)}" target="_blank" rel="noopener">Google Calendar ↗</a>` : ""}<a class="pa-btn" href="${esc(issueUrl("correction.yml", { title: `Correction: ${e.title}`, record: `events/${e.id}` }))}" target="_blank" rel="noopener">Report a problem</a></div>`;
    },
    /** Event page extras: getting there, application tracker, deadline. */
    eventExtras(e) {
      const v = venueOf(e);
      const cur = apps.get(e.id);
      return `${e.deadline ? `<p class="notice"><strong>Apply by ${esc(e.deadline)}.</strong> ${esc(e.deadline_note || "")}</p>` : ""}
      ${needsApply(e) ? `<div class="app-tracker"><p class="app-q">${e.access === "registration" ? "Registered?" : "Applied?"} Track it here <span class="muted">(saved on this phone only)</span></p>
        <div class="segmented" role="group" aria-label="Your application status">${Object.entries(APP).map(([k, l]) => `<button type="button" data-app-set="${e.id}:${k}" aria-pressed="${cur === k}">${esc(l)}</button>`).join("")}</div></div>` : ""}
      ${v ? `<div class="getting-there"><p><span aria-hidden="true">🚇</span> <b>Nearest MRT:</b> ${esc(v.mrt)}</p>
        <p><a href="${dirUrl(e)}" target="_blank" rel="noopener">Walking directions ↗</a>${v.approx ? ` <span class="muted">· area only; exact address from the organiser</span>` : ""}</p></div>` : ""}`;
    },
    /** Follow button on a person page. */
    personActions(p) {
      const on = follow.has(p.id);
      return `<button type="button" class="btn btn-small${on ? " btn-accent" : ""}" data-follow="${p.id}" aria-pressed="${on}">${on ? "★ Following" : "☆ Follow"}</button>`;
    },
    /** My schedule extras. Folded so the page stays calm. */
    scheduleExtras(list) {
      if (!list.length) return changesBanner();
      return `${changesBanner()}
      <div class="sched-tools">
        <a class="btn btn-small" href="#/plan">🗺️ Plan a day for me</a>
        <a class="btn btn-small" href="#/now">⚡ Now & next</a>
      </div>
      ${travelCheck(list)}
      ${applicationsSummary(list)}
      <details class="fold fold-card" open><summary>Your week at a glance</summary>${weekGrid(list)}</details>
      <details class="fold fold-card"><summary>People you follow (${[...follow.all()].filter((id) => D.people.has(id)).length})</summary>${followList()}</details>
      <details class="fold fold-card"><summary>Add to Google Calendar</summary><p class="small muted">Google Calendar adds events one at a time. For Apple Calendar or Outlook, use “Export to calendar (.ics)” above to add them all at once.</p>
        <ul class="gcal-list">${list.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((e) => { const g = gcalUrl(e); return `<li>${esc(dayOf(e.date).label.slice(0, 3))} ${esc(e.start || "")} ${esc(e.title)} ${g ? `<a href="${esc(g)}" target="_blank" rel="noopener">Add ↗</a>` : `<span class="muted">time not published</span>`}</li>`; }).join("")}</ul></details>
      <details class="fold fold-card"><summary>Share my week as an image</summary>
        <p class="small">Makes a picture of your schedule to post on LinkedIn, X or in a chat, so people know where to find you.</p>
        <label class="pf-label" for="share-name">Your name (optional)</label><input id="share-name" class="text-input" data-share-name maxlength="30" placeholder="e.g. Stuart">
        <div class="btn-row" style="margin-top:10px"><button type="button" class="btn btn-accent" data-share-image="share">Share image</button><button type="button" class="btn" data-share-image="download">Download</button></div></details>`;
    },
    /** Shared-schedule view: compare with your own. */
    shareCompare(ids) {
      const mine = new Set(saved.all());
      if (!mine.size) return "";
      const both = ids.filter((id) => mine.has(id));
      return `<div class="heads-up"><p class="eyebrow">Compared with your schedule</p><p>You’re both going to <b>${plural(both.length, "event")}</b>${both.length ? `: ${both.map((id) => `<a href="${evUrl(D.ev.get(id))}">${esc(D.ev.get(id).title)}</a>`).join(" · ")}` : ""}. ${plural(ids.length - both.length, "event")} below ${ids.length - both.length === 1 ? "isn’t" : "aren’t"} in yours yet.</p></div>`;
    },
    /** Decorate saved-schedule cards with application status after render. */
    decorateSchedule(root) {
      root.querySelectorAll(".prog-item[data-id]").forEach((el) => { const pill = appPill(el.dataset.id); if (pill) el.querySelector(".prog-eyebrow")?.insertAdjacentHTML("beforeend", pill); });
    },
    shareUrl: (e) => `${location.origin}${location.pathname}share/${e.id}/`,
    refreshOffline: offlineStatus,
  };
}
