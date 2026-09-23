#!/usr/bin/env node
// Builds one tiny page per event under /share/<id>/ so a shared link shows the
// event's own title and summary in LinkedIn, X, WhatsApp and Slack previews.
// Each page sends people straight on to the event in the directory.
// Run from the repository root:  node scripts/build-share-pages.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const BASE = "https://stuatnext.github.io/TOKEN2049-Prediction-Markets/";
const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const events = load("events.json");
const site = load("site.json");
const dayLabel = Object.fromEntries(site.days.map((d) => [d.date, d.label]));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const out = new URL("../share/", import.meta.url);

rmSync(out, { recursive: true, force: true });
for (const e of events) {
  const when = `${dayLabel[e.date] || e.date}${e.start ? `, ${e.start}${e.end ? `–${e.end}` : ""} SGT` : ""}`;
  const desc = `${when} · ${e.venue}. ${e.why}`.slice(0, 280);
  const target = `../../#/events/${e.id}`;
  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<title>${esc(e.title)} · Prediction Markets at TOKEN2049</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Prediction Markets at TOKEN2049">
<meta property="og:title" content="${esc(e.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}share/${e.id}/">
<meta property="og:image" content="${BASE}assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${BASE}#/events/${e.id}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body><p><a href="${target}">${esc(e.title)}: open in the directory</a></p></body></html>
`;
  const dir = new URL(`${e.id}/`, out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("index.html", dir), html);
}
console.log(`Built ${events.length} share pages in /share`);
