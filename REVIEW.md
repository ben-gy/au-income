# Income by Postcode — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **Live:** https://au-income.benrichardson.dev ✅ verified (HTTP 200, TLS cert issued, `https_enforced=true`)
- **GitHub Pages:** https://ben-gy.github.io/au-income/ *(redirects to the custom domain)*

## DNS + cert

Already provisioned during the build — no manual step required:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `au-income` | `ben-gy.github.io` | DNS only (grey cloud) |

## The finding

The site is built around the median-vs-average gap, which separates two kinds of
"rich postcode" that a plain income ranking makes look identical:

- **Toorak (3142)** — median $82,873, average $277,708 → **3.35×**. A few enormous incomes.
- **Rocklea (6751)** / **Fortescue (6716)** — the highest medians in Australia
  ($111,679 / $142,580) with averages *level with or below* the median → **1.03×**.

The typical earner in Toorak makes less than a Pilbara mine worker. The highest
*typical* incomes in the country are in mining towns, not the harbour suburbs.

## Verified on production

- [x] All 8 views render, no NaN/undefined, none blank
- [x] Zero console errors
- [x] Real (trusted) clicks: ranking bar → drill-down, scatter dot → drill-down
- [x] Drag pans the scatter **without** firing a node click; zoom + pan work
- [x] About modal renders **above** the Leaflet map (z-index isolation)
- [x] No horizontal overflow at 375px on any view or the drill-down
- [x] 117 tests pass; `npm run build` clean
