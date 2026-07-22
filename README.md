# Income by Postcode

**What people actually earn in every Australian postcode — median vs average taxable income, deductions, negative gearing and HELP debt, straight from the ATO.**

🔗 **Live:** [https://au-income.benrichardson.dev](https://au-income.benrichardson.dev)

## What is this?

Every year the Australian Taxation Office publishes a statistical summary of every individual tax return, aggregated by postcode. It is one of the richest open datasets in the country — 161 items per postcode, going back to 1994 — and it arrives as a pile of 8 MB spreadsheets that almost nobody opens. This site turns the 2023–24 edition (16,379,323 individuals across 2,283 postcodes) into something you can explore in a few seconds.

It is built around one idea: **the average is a lie**. Nearly every "average income" figure you see quoted is the mean, and the mean is trivially distorted — a handful of enormous incomes lifts a whole postcode's average while leaving the typical earner exactly where they were. So this site shows the median and the average side by side, and treats the ratio between them (the *gap*) as a headline number rather than a footnote.

That single ratio separates two completely different kinds of "rich postcode", which a plain income ranking makes look identical:

- **Toorak (3142)** — median $82,873, average $277,708. A **3.35× gap**: half the suburb earns under $83k while a few very large incomes drag the mean past a quarter of a million.
- **Fortescue (6716)** — median **$142,580**, the highest in Australia, with an average *below* it. Nearly everyone earns a strong mining wage; there is no ultra-rich tail.

The typical earner in Toorak makes **less** than a Pilbara mine worker. That finding falls straight out of the data, and no other tool surfaces it.

## Who is this for?

Australians asking a question they Google constantly — *"what is the average income in my suburb?"* — and deserving a better answer than one misleading number. Also: homebuyers and renters sizing up an area, journalists chasing a local angle, and policy and economics people who want postcode-level tax data without wrestling a 162-column spreadsheet.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| [ATO Taxation Statistics 2023–24, Individuals Table 8](https://data.gov.au/data/dataset/taxation-statistics-2023-24) | Median + average taxable income per postcode across 12 year-points (2003–04, 2013–14 … 2023–24) | Annual |
| [ATO Taxation Statistics 2023–24, Individuals Table 6](https://data.gov.au/data/dataset/taxation-statistics-2023-24) | 161 items per postcode: net tax, deductions, work expenses, donations, net rent (negative gearing), capital gains, HELP debt, franking credits, private health | Annual |
| [ATO Taxation Statistics 2023–24, Individuals Table 7](https://data.gov.au/data/dataset/taxation-statistics-2023-24) | Per postcode: counts by income band, age band, and ANZSCO occupation group | Annual |
| [ABS ASGS 2021 Postal Areas](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026) | Real postcode boundaries → mapshaper-simplified GeoJSON (2,266 polygons) | Static (2021 edition) |
| [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes) | Postcode → locality names for search and labelling | Continuous |

## Features

- **The Gap** — a log-log scatter of median vs average with the *average = median* diagonal, separating broad prosperity from a rich tail. The signature view.
- **Map** — Leaflet choropleth over all 2,266 real ABS postal-area polygons, switchable across 7 metrics, quantile-shaded so the skew doesn't paint the country one colour.
- **Rankings** — leaderboard by any metric, filterable by state and taxpayer count.
- **Explorer** — searchable, sortable table of every postcode with a 20-year median sparkline.
- **Occupations** — postcode × ANZSCO heatmap; each place has a fingerprint (Blackwater is 27% Machinery Operators, Erskineville 38% Professionals).
- **Distribution** — histogram of postcode medians with click-through to the postcodes in any bin, plus the national income-band composition.
- **Trend** — 20 years of median income by state, drawn to a real time axis.
- **Insights** — findings computed from the data, never hand-written.
- **Per-postcode drill-down** — hash-linkable (`#pc=3142`): rank, 20-year history, income spread, age and occupation mix, deductions, negative gearing, HELP debt.

## Tech Stack

- **Runtime:** Vanilla TypeScript (no framework — it's a tab-switched single page)
- **Build:** Vite 6
- **Testing:** Vitest (117 tests)
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, yearly cron matching the ATO's annual release
- **Maps:** Leaflet 1.9 + real ABS boundaries. Every other chart is hand-rolled SVG.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview

# Rebuild the dataset from source (downloads ~70 MB, needs mapshaper via npx)
npm run data
```

## How it works

`pipeline/collect.mjs` downloads the three ATO workbooks, the ABS postal-area shapefile (56 MB) and the postcode reference CSV into a local cache. `pipeline/aggregate.mjs` streams the workbooks with exceljs, joins them by postcode, derives ~25 metrics per postcode, simplifies the boundaries with mapshaper (1.2%, ~1.9 MB), and writes `public/data/{postcodes,poa,meta}.json`. The browser fetches those three static files — there is no backend and no runtime API call.

Two things the pipeline is careful about, both of which silently corrupt this dataset:

1. **`na` means suppressed, not zero.** The ATO withholds small cells for privacy. Coercing those to `0` would drag every average and rate downward. They stay `null` and render as "—".
2. **Table 7A publishes overlapping bands.** It carries both `$180,000 or more` *and* a `$120,001 or more` rollup, the latter only when the finer split is suppressed. Summing them double-counts every high-income postcode, so the rollup is used only as a fallback (232 postcodes need it).

Columns are matched by **header text, never by index** — the ATO reorders columns between editions, and a silent index shift would publish wrong numbers instead of failing loudly.

## Caveats

This is individuals, not households; taxable income, not wealth or take-home pay; and only people who lodged a return. A postcode is not a suburb. See the in-app About panel for the full list.

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
