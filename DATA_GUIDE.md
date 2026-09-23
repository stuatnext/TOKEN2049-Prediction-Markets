# Data guide

Everything on the site comes from the JSON files in `/data`. To change the site, edit those files. You never need to touch the HTML.

After any edit, run:

```bash
node scripts/validate-data.mjs
```

It will tell you about typos in IDs, missing people or companies, bad times and unknown sources.

## The golden rules

1. **Only add what a public source supports.** Every event needs at least one entry in `sources`.
2. **Don't guess times.** If the end time isn't published, set `"end": null`. The site will show "end TBC" and won't offer a calendar download.
3. **Keep uncertainty visible.** If two sources disagree, set `"status": "conflict"` and explain it in `status_note`.
4. **Don't assume attendance.** Only add a person to an event if a source lists them for it.
5. **Nothing private.** No emails, phone numbers, invite codes, CRM notes or relationship details.
6. When you change a record, set its `last_updated` to today (`YYYY-MM-DD`). Records newer than `last_updated` in `site.json` get an "Updated" badge. When you publish a batch of changes, also bump `last_updated` in `site.json`.

## How records link together

Everything links by **ID**: lowercase words joined by hyphens, e.g. `the-odds-prediction-markets-live`. The ID is also the page address (`#/events/the-odds-prediction-markets-live`), so don't rename IDs after sharing links.

```
event ──people[].id────▶ person ──org──▶ company ──stack_layers──▶ stack layer
  │  ──companies[].id──▶ company
  │  ──stack_layers────▶ stack layer
  └──sources───────────▶ source
```

The site works out the reverse links for you (a person's events, a company's events and people, the events in each stack layer).

## Adding an event

Copy an existing event in `data/events.json` and change the fields. Order in the file doesn't matter; the site sorts by date and time.

```json
{
  "id": "example-traders-breakfast",
  "legacy_id": "",
  "title": "Example Traders Breakfast",
  "date": "2026-10-08",
  "end_date": null,
  "start": "08:00",
  "end": "09:30",
  "time_note": null,
  "venue": "Example Hotel, 1 Example Road",
  "map_query": "Example Hotel, 1 Example Road, Singapore",
  "type": "networking",
  "official": false,
  "relevance": "core",
  "score": 9,
  "access": "approval",
  "access_note": "Approval required",
  "audiences": ["traders", "market-makers"],
  "ecosystems": ["polymarket"],
  "topics": ["trading", "liquidity"],
  "stack_layers": ["liquidity"],
  "summary": "One or two factual sentences from the organiser's description.",
  "why": "One or two sentences on why this matters to prediction markets.",
  "questions": [],
  "people": [{ "id": "jane-example", "role": "speaker" }],
  "companies": [{ "id": "example-co", "role": "host" }],
  "also_listed": ["Traders"],
  "sources": ["src-example-breakfast"],
  "status": "listed",
  "status_note": "Organiser event page (Luma).",
  "clash_note": null,
  "last_updated": "2026-09-30"
}
```

Then add its source to `data/sources.json`:

```json
{ "id": "src-example-breakfast", "name": "Example Traders Breakfast", "type": "Organiser / event page", "url": "https://…", "note": "Thursday breakfast." }
```

If the event mentions a person or company that doesn't exist yet, add them to `people.json` / `companies.json` (see below). Otherwise the validator will complain.

### Field reference

| Field | What to put |
|---|---|
| `date` | `2026-10-05` to `2026-10-09` |
| `end_date` | Only for multi-day items (e.g. expo booths); otherwise `null` |
| `start` / `end` | 24-hour `HH:MM` in Singapore time, or `null` if not published |
| `time_note` | Use when there's no start time: `"Full day"`, `"Expo hours"`, `"Time TBC"`, `"Evening (time not recorded)"`. "Full day" and "Expo hours" export as all-day calendar entries |
| `map_query` | Only when the venue is a specific, verified place. Leave `null` for "venue after approval" |
| `type` | `official` (TOKEN2049 programme session), `side-event`, `forum`, `meetup`, `networking` (party/networking), `closed-door`, `exhibition`, `other` |
| `official` | `true` for TOKEN2049's own events (sessions, AFTER2049) |
| `relevance` | `core` = directly about prediction markets · `strong` = not exclusively PM but highly relevant · `adjacent` = useful market-structure context · `wildcard` = strange/experimental |
| `score` | Relevance score, 1–10, shown as "8/10". It must sit inside its tier: `core` 8–10 (10 = wholly about prediction markets), `strong` 6–7, `adjacent` 3–5, `wildcard` 1–4. The validator rejects anything outside the band |
| `access` | `open`, `registration`, `approval`, `invite`, `waitlist`, `sold-out`, `badge` (TOKEN2049 pass), `unknown`. Put the organiser's wording in `access_note` |
| `audiences` | any of `traders`, `market-makers`, `founders`, `builders`, `institutions`, `investors`, `sports`, `media`, `regulators`, `general` |
| `ecosystems` | any of `kalshi`, `polymarket`, `hyperliquid`, `independent` |
| `topics` | any of `infrastructure`, `defi`, `institutional`, `risk`, `liquidity`, `data`, `tokenisation`, `distribution`, `regulation`, `market-making`, `trading`, `ai-agents`, `clearing`, `category`, `sports`, `consumer` |
| `stack_layers` | IDs from `stack.json`: `frontend`, `venue`, `liquidity`, `execution`, `data-transport`, `oracle`, `clearing`, `portfolio-risk`, `margin`, `policy` |
| `people[].role` | `speaker`, `moderator`, `host`, `listed` ("listed" = named in connection with the event; not a promise they'll attend) |
| `companies[].role` | `host`, `sponsor`, `exhibitor`, `partner`, `participant`, `speaker-affiliation`, `subject` |
| `also_listed` | Generic groups the listing describes ("Traders", "Market makers"). Never individuals |
| `questions` | Optional "Questions worth asking" shown on the event page |
| `status` | `verified` = on the official TOKEN2049 programme/partner list/site · `listed` = organiser page or side-event directory · `provisional` = no first-party source · `conflict` = sources disagree on timing |
| `clash_note` | Only for clashes the site can't calculate itself (e.g. an event whose time is TBC). Timed overlaps are detected automatically |

## Adding a person (`data/people.json`)

```json
{
  "id": "jane-example",
  "name": "Jane Example",
  "org": "example-co",
  "org_label": null,
  "role": "Head of Trading, Example Co",
  "group": "trading",
  "why": "One sentence on why they matter to prediction markets.",
  "sources": ["src-example-breakfast"],
  "note": null,
  "last_updated": "2026-09-30"
}
```

- `org` is a company ID, or `null`. Use `org_label` for free text when there's no company record.
- Only fill in `role` if a source states it.
- `group`: `platforms`, `trading`, `infrastructure`, `institutional`, `builders`, `sports`, `policy`, `media`, `investors`, `speakers`.
- `note` shows as a warning on their page (e.g. "Confirm on the organiser page").

## Adding a company (`data/companies.json`)

```json
{
  "id": "example-co",
  "name": "Example Co",
  "category": "trading",
  "description": "Plain-English description, and which events it appears at.",
  "stack_layers": ["liquidity"],
  "ecosystems": [],
  "sources": ["src-example-breakfast"],
  "note": null,
  "last_updated": "2026-09-30"
}
```

Describe company claims as claims ("company claim", "announced", "reported"), not as facts.

## Who's Going: adding an attendance record (`data/attendance.json`)

Attendance is its own dataset, so you can add people quickly without touching any page layout. **Every public record needs its own evidence.** Never add someone just because they work for a sponsor, run a booth, organise an event, liked a post, or because their company has a launch planned.

```json
{
  "id": "jane-example-publicly-attending",
  "entity_type": "person",
  "person_id": "jane-example",
  "company_id": "example-co",
  "name": null,
  "confidence": "confirmed",
  "public": true,
  "attendance_status": "publicly_attending",
  "attendance_scope": "TOKEN2049 week",
  "dates": [],
  "pm_relevance": "core",
  "ecosystems": ["polymarket"],
  "interests": ["market-making"],
  "event_ids": [],
  "source_type": "linkedin",
  "source_id": null,
  "source_url": "https://www.linkedin.com/posts/…",
  "source_date": "2026-09-25",
  "evidence_summary": "Posted that she will be at TOKEN2049 Singapore and wants to meet prediction-market builders.",
  "first_confirmed": "2026-09-25",
  "last_verified": "2026-09-25"
}
```

| Field | What to put |
|---|---|
| `attendance_status` | `official_speaker` · `publicly_attending` (the person said so themselves) · `company_attending` (the company's own site or account says its team is going; don't add individual employees) · `exhibitor` · `sponsor` (sponsor or partner) · `side_event_host` · `side_event_speaker` · `confirmed_participant` (an organiser names them as a confirmed participant) · `meeting_signal` (asked for meetings but didn't clearly say they're attending) · `launch_signal` (launch timed around TOKEN2049; not proof anyone attends) |
| `confidence` / `public` | `"confirmed"` + `true` to publish with a source. `"unverified"` + `true` publishes a lead without a source link, shown with an **Unverified** label (and it never counts someone as "expected" at an event). For leads without a recovered public source, use `"pending"` + `false`. They then only appear at `#/going?research=1`. **This repository is public, so anyone can read pending records.** Keep them factual and free of private notes |
| `dates` | Only days the evidence itself supports (e.g. the day of their session). Leave `[]` for a generic "I'll be at TOKEN2049" post |
| `event_ids` | Events this evidence ties them to. It makes them appear under "People you can expect there" |
| `source_url` | The original public post or page. Prefer the person's or company's own post over third-party attendee trackers |
| `first_confirmed` | The date you added it. Records added within the last 7 days get a **New** badge and appear under "Recently confirmed" |

One person or company can have several records (e.g. a sponsor that is also a side-event host). They're combined into one card.

A person must exist in `people.json` before they can go public. When you add one, give them `roles` (any of `founder`, `trader`, `market-maker`, `investor`, `builder`, `institutional`, `infrastructure`, `sports`, `media`, `regulation`, `business`, `other`). Companies have `types` (any of `venue`, `trading-firm`, `market-maker`, `infrastructure`, `data`, `oracle`, `exchange`, `institutional`, `sports`, `media`, `investor`, `compliance`, `other`). These drive the filters and the discovery groups.

People can also submit themselves through the "I'm going" GitHub issue form.

## Promo code and curator details

`site.json` → `curator` holds Stuart's name, LinkedIn and summit link. `promo` holds the NEXTPredict NYC code and the claim link. The site shows it as a button on the home, Who’s Going, schedule and About pages.

## Changing the "What we're still checking" list

Edit `open_questions` in `data/site.json`. Each item links to event IDs and source IDs. Remove an item once it's resolved.

## Where the data came from

The first version was extracted from *NEXTPredict TOKEN2049 Prediction Markets Master Field Guide 2026* (research cut-off 22 September 2026). Each event keeps its original ID in `legacy_id`. Internal material from that guide was deliberately not carried over: outreach routes, priority tiers, CRM references, story plans and unverified social-media intelligence.


## Play-money questions (the Play tab)

`data/markets.json` holds the questions on the **Play** tab. Visitors trade with play credits only; there is no real money, no prizes and no sign-up, and every visitor's balance and prices live only in their own browser.

| Field | What it means |
| --- | --- |
| `starting_balance` | Play credits each visitor starts with |
| `liquidity` | How much a trade moves the price. Higher = prices move less |
| `question` | Keep it light, factual and checkable. Avoid questions about anyone's wrongdoing, health or private life, and avoid token-price bets |
| `seed` | Starting Yes probability (0.01–0.99), the curators' estimate |
| `resolves` | The exact rule and source used to settle it |
| `event_id` | Optional link to a related event |
| `status` / `outcome` | `open` + `null` while trading. To settle, set `"status": "resolved"` and `"outcome": "yes"`, `"no"` or `"void"` (void refunds half a credit per share) |

Winning shares pay 1 credit each, automatically, the next time a visitor opens the Play tab.
