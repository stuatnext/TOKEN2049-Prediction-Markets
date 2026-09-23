# Prediction Markets at TOKEN2049 Singapore 2026

The unofficial directory of prediction-market events, sessions, companies and people across TOKEN2049 week (5–9 October 2026).
It's a calendar, a searchable directory, a "Who's Going?" attendance directory with linked evidence, a guide to the prediction-market "stack", and a personal schedule builder with clash detection and calendar export.

Curated by [Stuart Crowley](https://sg.linkedin.com/in/stuart-crowley-b2b561104) of [NEXTPredict](https://nextpredict.io/) ([NEXTPredict NYC 2026](https://nextpredict.io/summits/the-worlds-prediction-markets-summit/)). Not affiliated with TOKEN2049.

## What's in here

```
index.html                 The page shell (header, navigation, footer, SEO tags)
assets/css/styles.css      All styling (light + dark mode, mobile first)
assets/js/app.js           The app: pages, filters, calendar, finder, schedule
assets/js/util.js          Helpers: times, clash detection, .ics export, saved events
data/events.json           40 events and sessions   ← edit these files to update the site
data/people.json           People
data/companies.json        Companies / organisations
data/stack.json            The 10 layers of the prediction-market stack
data/sources.json          Every source link
data/attendance.json       Who's Going evidence records (one per piece of evidence)
data/site.json             Site settings: last-updated date, days, curator, promo, "still checking" list
manifest.webmanifest       Lets phones add the site to the home screen
sw.js                      Offline helper (network first, saved copy when offline)
assets/icons/              Home-screen icons
scripts/validate-data.mjs  Checks the data files for mistakes
.github/ISSUE_TEMPLATE/    "Suggest a missing event" and "Report a correction" forms
DATA_GUIDE.md              How to add or change an event, person or company
```

There's no build step and no framework. The browser loads the JSON files and builds each page from them.

## Preview it on your computer

The site loads its data with `fetch`, so opening `index.html` by double-clicking won't work. Run a tiny local web server from this folder instead:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

After editing any file in `data/`, check it:

```bash
node scripts/validate-data.mjs
```

## Publish on GitHub Pages

1. On GitHub, go to the repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. That's the only setting needed.
3. Every push to `main` then runs `.github/workflows/pages.yml`, which checks the data and publishes the site. You can also run it by hand from the **Actions** tab ("Deploy site to GitHub Pages" → "Run workflow").
4. The site is live at `https://stuatnext.github.io/TOKEN2049-Prediction-Markets/`.

Notes:
- GitHub Pages on a **private** repository needs a paid GitHub plan. On a free plan, make the repository public.
- The "Submit something we missed" buttons open GitHub issue forms. The public can only use them if the repository is public.
- If you use a custom domain or a different repository name, update the `canonical` and `og:` URLs at the top of `index.html`.

## Page addresses

Pages use `#` links so they work on GitHub Pages without server configuration, for example:

- `#/events/polymarket-singapore-kickoff`
- `#/companies/kalshi`
- `#/people/john-wang`
- `#/calendar/thu`
- `#/stack/clearing`
- `#/going` (Who's Going), e.g. `#/going?role=trader,market-maker`
- `#/schedule?share=…` (a shared schedule)
