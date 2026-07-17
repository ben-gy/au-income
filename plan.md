# Site Plan: Income by Postcode

## Overview
- **Name:** Income by Postcode
- **Repo name:** au-income
- **Tagline:** What people actually earn in every Australian postcode — median vs average income, deductions, negative gearing and HELP debt, straight from the ATO.

### Naming Convention
Plain topic name, no country code. Country lives in the index `country: "AU"` field.

## Target Audience
Curious Australians asking a question they Google constantly: *"what is the average income in my suburb?"* — plus homebuyers sizing up an area, renters comparing where they can afford, journalists chasing a local angle, and policy/economics people who want postcode-level tax data without wrestling a 162-column spreadsheet.

Mostly general public, mixed mobile/desktop, low-to-moderate data literacy. They arrive with a specific postcode in mind and a mild emotional charge ("am I behind?"). The site must answer the postcode question in under five seconds, then reward the curious with depth.

## Value Proposition
Everyone quotes "average income" — and the average is a lie. It's dragged upward by a handful of enormous incomes, so most people in a "rich" suburb earn far less than the headline. This site is built around the **median vs average gap**, which no existing tool surfaces properly:

- **Toorak (3142):** median $82,873, average $277,708 — a **3.35× gap**. A few colossal incomes.
- **Pilbara mining towns (6716, 6754):** the **highest medians in the country** ($142,580), with averages *below* the median. Everyone earns well; no ultra-rich tail.

The typical Toorak earner makes **less** than a Karratha mine worker. That is the story, and it falls straight out of the data. Nowhere else lets you see it per postcode, over 20 years, alongside negative gearing, capital gains, donations and HELP debt.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| ATO Taxation Statistics 2023-24, Individuals Table 8 | data.gov.au (`ts24individual08medianaveragetaxableincomestatepostcode.xlsx`) | Median + average taxable income + individual counts per postcode for 12 year-points (2003-04, 2013-14 … 2023-24) | Annual (~May-June) | No |
| ATO Taxation Statistics 2023-24, Individuals Table 6B | data.gov.au (`ts24individual06taxablestatusstatesa4postcode.xlsx`) | 161 items per postcode: salary, net tax, deductions, work expenses, gifts/donations, net rent (negative gearing), capital gains, HELP debt, franking credits, private health, super contributions | Annual | No |
| ATO Taxation Statistics 2023-24, Individuals Table 7A/7B/7C | data.gov.au (`ts24individual07statepostcodetaxableincomerangeagerangeoccupation.xlsx`) | Per postcode: counts by income band (5), by age band (6), by ANZSCO occupation major group (8 + blank) | Annual | No |
| ABS ASGS 2021 Postal Area digital boundaries | abs.gov.au (`POA_2021_AUST_GDA2020_SHP.zip`) | Real postcode polygons → mapshaper-simplified GeoJSON (~2,640 features) | Static (2021 edition) | No |
| matthewproctor/australianpostcodes | GitHub raw CSV | Postcode → locality name(s), state, SA4 for search + labelling | Continuous | No |

## Key Features
1. **The Gap** (signature) — median-vs-average scatter that separates "broad prosperity" postcodes from "a few very rich people" postcodes.
2. **Leaflet choropleth** of all ~2,640 ABS postal areas, switchable across 7 metrics.
3. **Rankings leaderboard** — rank by median, average, gap ratio, negative gearing, HELP debt, donations.
4. **Explorer** — searchable/sortable table of every postcode with a 20-year median sparkline.
5. **Per-postcode drill-down** (hash-linkable `#pc=3142`) — rank, 20-year history, income bands, age mix, occupation mix, deductions, negative gearing, HELP.
6. **Occupation matrix** — postcode × ANZSCO major group heatmap.
7. **20-year trend** — median income by state, with the 2003-04 → 2023-24 arc.
8. **Distribution** — histogram of postcode medians with click-through + national income-band composition.
9. **Auto-detected insights** — outliers, extreme gaps, negative-gearing hotspots.

## Style Direction
**Tone:** civic / finance — authoritative but warm, not a terminal.
**Colour palette:** light theme, deep navy (`#12345b`-ish) with a gold/amber accent for money values, and a teal secondary. Finance-adjacent (per the audience guide: deep blue + gold), but light and open rather than Bloomberg-dark, because the audience is the general public, not traders. Diverging red↔blue reserved for the gap metric, sequential blues for magnitude.
**UI density:** balanced — generous on the drill-down and hero numbers, dense in the Explorer table.
**Dark/light theme:** light.
**Reference sites for tone:** abs.gov.au data explorer (authoritative, clean), fuelaustralia.org (fast utility, no ceremony).

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (single-page, tab-switched views — no routing tree or heavy component state, so React is unjustified).
- **Data strategy:** pipeline. ATO publishes annually → **yearly cron** (`23 6 9 6 *`, 9 June, staggered), which matches the source cadence. Never daily/weekly.
- **Key libraries:** Leaflet 1.9 (maps) only. All other charts hand-rolled SVG per the patterns rules.

## Layout
Fixed 52px header (title, postcode search, About `?`). Nav tab strip below. Main content fills remaining space, `max-width: 1600px`. Drill-down is a right-side slide-in panel (full-width sheet under 768px). Sticky footer. Panels stack vertically below 768px; Explorer table and matrix get their own `overflow-x: auto` scrollers.

## Pages/Views
Single page, 8 tabs: Map · Rankings · Explorer · The Gap · Occupations · Distribution · Trend · Insights. Plus the drill-down panel and About modal.

## Visualization Strategy

Design research: the bar here is the ABS/ATO's own postcode maps (which are static and shallow) and property-site suburb profiles (which show a single "average income" number with no distribution). Both fail the same way — they collapse a distribution to one number. Every view below is chosen to *un-collapse* it.

- **Map (Leaflet choropleth)** — *Where is it?* Real ABS POA polygons, 7 metrics. Answers "my suburb vs the ones around it" — the spatial clustering of wealth is invisible in a table. Click → drill-down.
- **The Gap (scatter)** — *Broad prosperity or a rich tail?* median (x) vs average (y) with the y=x line and ratio contours. The single most insight-dense view; nothing else distinguishes Toorak from Karratha. Click → drill-down.
- **Rankings (bar leaderboard)** — *Who's top?* Ranks by any of 7 metrics, colour-coded by state.
- **Explorer (table + sparkline)** — *What about my exact postcode?* Search-first, 20-year sparkline per row.
- **Occupations (matrix heatmap)** — *Who overlaps with whom?* postcode × 8 ANZSCO groups; reveals mining towns, professional enclaves, retiree coasts as distinct signatures.
- **Distribution (histogram + bands)** — *What's the spread?* Histogram of the 2,283 postcode medians (click a bin → filter), plus national income-band composition. Shows how few postcodes are near the headline numbers.
- **Trend (multi-line time series)** — *How did it change?* Median by state across 12 year-points, 2003-04 → 2023-24.
- **Insights (cards)** — *What should I have noticed?* Auto-detected: biggest gaps, highest medians, negative-gearing hotspots, HELP-debt concentrations.

Every mark gets a `data-tip` hover tooltip; the scatter and matrix get `attachSvgZoom`; every postcode name anywhere is clickable into the drill-down. Colour is consistent per state across all views.
