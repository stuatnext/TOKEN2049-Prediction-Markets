// Shared helpers: escaping, time maths, clash detection, .ics export, local storage.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const initials = (name) =>
  name.replace(/[()]/g, "").split(/[\s/-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

// ---------- Time ----------
export const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fmtMin = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const fmtDuration = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** All dates an event covers (booths can span two days). */
export const eventDays = (e) => {
  const out = [e.date];
  if (e.end_date) for (let d = addDays(e.date, 1); d <= e.end_date; d = addDays(d, 1)) out.push(d);
  return out;
};

/** True when the event has a real start AND end time. */
export const isTimed = (e) => Boolean(e.start && e.end);

export const timeLabel = (e) => {
  if (e.start && e.end) return `${e.start}–${e.end}`;
  if (e.start) return `${e.start} · end TBC`;
  return e.time_note || "Time TBC";
};

/** Sort key within a day: all-day items first, timed by start, unknown times last. */
export const sortKey = (e, day = e.date) => {
  const allDay = /full day|expo hours/i.test(e.time_note || "");
  const t = e.start ? e.start : allDay ? "00:00" : "99:99";
  return `${day} ${t} ${e.end || "99:99"} ${e.title}`;
};

/** Does the event count as an all-day block (full-day forum, expo hours)? */
export const isAllDay = (e) => !e.start && /full day|expo hours/i.test(e.time_note || "");

// Interval used for overlap checks. Events with only a start time get a
// zero-length interval so we never invent a duration.
const span = (e) => {
  const s = toMin(e.start);
  if (s == null) return null;
  const en = toMin(e.end);
  return [s, en == null ? s : en];
};

export const overlaps = (a, b) => {
  if (a.id === b.id) return false;
  if (!eventDays(a).some((d) => eventDays(b).includes(d))) return false;
  const x = span(a), y = span(b);
  if (!x || !y) return false;
  if (x[0] === x[1]) return y[0] <= x[0] && x[0] < y[1];
  if (y[0] === y[1]) return x[0] <= y[0] && y[0] < x[1];
  return x[0] < y[1] && y[0] < x[1];
};

/** Group a day's timed events into clusters of mutually-connected overlaps. */
export const clusters = (list) => {
  const timed = list.filter((e) => e.start).sort((a, b) => toMin(a.start) - toMin(b.start) || (toMin(b.end) ?? 0) - (toMin(a.end) ?? 0));
  const out = [];
  let cur = null, curEnd = -1;
  for (const e of timed) {
    const [s, en] = span(e);
    if (cur && s < curEnd) { cur.push(e); curEnd = Math.max(curEnd, en); }
    else { cur = [e]; out.push(cur); curEnd = Math.max(en, s + 1); }
  }
  return out;
};

// ---------- "Now" in Singapore ----------
/** Current Singapore wall-clock time as {date: "YYYY-MM-DD", min: minutes}. Allows ?now= override for testing. */
export const sgtNow = (override) => {
  let ms = Date.now();
  if (override) {
    const t = Date.parse(override.length <= 16 ? override + ":00+08:00" : override);
    if (!Number.isNaN(t)) ms = t;
  }
  const d = new Date(ms + 8 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), ms };
};

// ---------- Calendar export ----------
/** Can we build a calendar entry without inventing times? Returns a reason string if not. */
export const icsBlocker = (e) => {
  if (e.status === "provisional") return "This event is provisional, so it can't be added to a calendar.";
  if (isTimed(e) || isAllDay(e)) return null;
  if (e.start && !e.end) return "The end time hasn't been published, so we can't create a calendar entry.";
  return "The time hasn't been published yet, so we can't create a calendar entry.";
};

const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const fold = (line) => {
  const out = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 74) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
};
const utcStamp = (date, hhmm) => {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h - 8, m));
  return t.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
};

export const buildICS = (events, { sources, pageUrl }) => {
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prediction Markets at TOKEN2049//Directory//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    if (icsBlocker(e)) continue;
    const src = (e.sources || []).map((id) => sources.get(id)).filter(Boolean);
    const desc = [
      e.summary,
      "",
      `Access: ${e.access_note || e.access}`,
      e.status_note ? `Status: ${e.status_note}` : "",
      src[0] ? `Organiser / source: ${src[0].url}` : "",
      `Details: ${pageUrl(e)}`,
      "",
      "Unofficial listing. Schedules and access can change, so check the organiser link before travelling.",
    ].filter((x) => x !== "").join("\n");
    lines.push("BEGIN:VEVENT", `UID:${e.id}@token2049-prediction-markets`, `DTSTAMP:${now}`);
    if (isTimed(e)) {
      lines.push(`DTSTART:${utcStamp(e.date, e.start)}`, `DTEND:${utcStamp(e.date, e.end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(e.end_date || e.date, 1).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`, `LOCATION:${icsText(e.venue)}`, `DESCRIPTION:${icsText(desc)}`, `URL:${pageUrl(e)}`);
    if (e.status === "conflict") lines.push("STATUS:TENTATIVE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
};

export const download = (filename, text, type = "text/calendar;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// ---------- Saved events (browser only) ----------
const KEY = "tpm2049:saved:v1";
let memory = [];
export const saved = {
  all() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch { return memory.slice(); }
  },
  write(list) {
    memory = [...new Set(list)];
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* private mode: keep in memory */ }
  },
  has(id) { return this.all().includes(id); },
  toggle(id) {
    const list = this.all();
    const on = !list.includes(id);
    this.write(on ? [...list, id] : list.filter((x) => x !== id));
    return on;
  },
  add(ids) { this.write([...this.all(), ...ids]); },
  clear() { this.write([]); },
};

// ---------- Search ----------
export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_/.’']/g, " ").replace(/\s+/g, " ");
/** Every word of the query must appear (allowing plural/singular) somewhere in the haystack. */
export const matches = (hay, q) => {
  const words = norm(q).split(" ").filter(Boolean);
  return words.every((w) => hay.includes(w) || (w.endsWith("s") && hay.includes(w.slice(0, -1))));
};

// ---------------------------------------------------------------- Play-money market maker
// Logarithmic market scoring rule (LMSR) for a YES/NO market with liquidity b.
// q = { yes, no } outstanding shares. Prices always sum to 1.
export const lmsr = {
  /** Starting share balance that makes the YES price equal `p`. */
  seed: (p, b) => ({ yes: b * Math.log(p / (1 - p)), no: 0 }),
  price: (q, b) => 1 / (1 + Math.exp((q.no - q.yes) / b)),
  cost: (q, b) => { const m = Math.max(q.yes, q.no); return m + b * Math.log(Math.exp((q.yes - m) / b) + Math.exp((q.no - m) / b)); },
  /** Shares received for spending `amount` credits on `side`. */
  sharesFor(q, b, side, amount) {
    const other = side === "yes" ? q.no : q.yes, mine = side === "yes" ? q.yes : q.no;
    const target = lmsr.cost(q, b) + amount;
    return b * Math.log(Math.exp((target - other) / b) - 1) + other - mine;
  },
  /** Credits returned for selling `shares` of `side`. */
  proceeds(q, b, side, shares) {
    const after = { ...q, [side]: q[side] - shares };
    return lmsr.cost(q, b) - lmsr.cost(after, b);
  },
};
