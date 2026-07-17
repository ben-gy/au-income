#!/usr/bin/env node
/**
 * aggregate.mjs — turn the cached ATO workbooks + ABS boundaries into the JSON
 * the browser reads.
 *
 * Outputs to public/data/:
 *   postcodes.json — one record per postcode (latest year + 20-year series + drill-down detail)
 *   poa.geojson    — ABS postal-area polygons, filtered to postcodes we have data for
 *   meta.json      — national totals, medians, extremes, source provenance
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable } from './lib/csv.mjs';
import { columnFinder, normPostcode, num, readSheet } from './lib/xlsx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'pipeline', '.cache');
const OUT = path.join(ROOT, 'public', 'data');

const LATEST = '2023-24';

const log = (m) => process.stdout.write(`[aggregate] ${m}\n`);

/** Ratio that returns null rather than Infinity/NaN when the denominator is absent. */
const ratio = (a, b) => (a !== null && b !== null && b > 0 ? a / b : null);
const per = (n, total) => (n !== null && total > 0 ? n / total : null);
const absOrNull = (v) => (v === null ? null : Math.abs(v));
// Full float precision on 2,283 x ~25 derived fields costs ~700 KB of JSON for
// digits no view can render. Round at the edge: rates keep 4dp, dollars 0dp.
const r4 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const r0 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v));

// ── Table 8: median/average taxable income per postcode across 12 year-points ──
async function readTable8() {
  const file = path.join(CACHE, 'table8.xlsx');
  const { headers, rows } = await readSheet(file, 'Table 8');
  const col = columnFinder(headers, 'table8.xlsx');

  // Discover every year present rather than hardcoding — the ATO appends a year
  // each edition, and the 2003-04 -> 2013-14 jump means they aren't contiguous.
  const years = [];
  for (const h of headers) {
    const m = h && h.match(/^median\d* taxable income (\d{4}[–-]\d{2})/);
    if (m) years.push(m[1].replace('–', '-'));
  }
  if (!years.length) throw new Error('Table 8: no median-income year columns found');
  if (!years.includes(LATEST)) throw new Error(`Table 8: expected latest year ${LATEST}, got ${years.join(',')}`);
  log(`table8: ${years.length} year-points (${years[0]} … ${years[years.length - 1]})`);

  const cPc = col('Postcode');
  const cSt = col('State/ Territory');
  const yearCols = years.map((y) => {
    const yy = y.replace('-', '[–-]');
    const find = (kind) => {
      const re = new RegExp(`^${kind}\\d* taxable income ${yy}`);
      const i = headers.findIndex((h) => h && re.test(h));
      if (i === -1) throw new Error(`Table 8: missing ${kind} column for ${y}`);
      return i;
    };
    const iN = headers.findIndex((h) => h && new RegExp(`^individuals ${yy}`).test(h));
    return { year: y, n: iN, med: find('median'), avg: find('average') };
  });

  const byPc = new Map();
  for (const r of rows) {
    const pc = normPostcode(r[cPc]);
    if (!pc) continue;
    const series = yearCols.map(({ year, n, med, avg }) => ({
      year,
      n: n === -1 ? null : num(r[n]),
      med: num(r[med]),
      avg: num(r[avg]),
    }));
    const latest = series.find((s) => s.year === LATEST);
    if (!latest || latest.med === null || latest.avg === null) continue; // suppressed postcode
    byPc.set(pc, { pc, state: String(r[cSt] ?? '').trim(), series, ...latest });
  }
  log(`table8: ${byPc.size} postcodes with ${LATEST} income`);
  return { byPc, years };
}

// ── Table 7A/7B/7C: income bands, age bands, occupation groups per postcode ──
async function readTable7() {
  const file = path.join(CACHE, 'table7.xlsx');
  const out = new Map();
  const touch = (pc) => {
    if (!out.has(pc)) out.set(pc, {});
    return out.get(pc);
  };

  // 7A — income bands. TRAP: the sheet carries BOTH 'e. $180,000 or more' and
  // 'f. $120,001 or more'. (f) is a rollup that OVERLAPS (d)+(e), published only
  // when privacy suppression hides the finer split. Summing a..f double-counts
  // every high-income postcode. Use a-e; fall back to f only when d/e are absent.
  {
    const { headers, rows } = await readSheet(file, 'Table 7A');
    const col = columnFinder(headers, 'table7A');
    const cPc = col('Postcode');
    const cSa4 = col('Statistical Area Level 4 (SA4)');
    const idx = {
      a: col('a. Less than or equal to $18,200'),
      b: col('b. $18,201 to $45,000'),
      c: col('c. $45,001 to $120,000'),
      d: col('d. $120,001 to $180,000'),
      e: col('e. $180,000 or more'),
      f: col('f. $120,001 or more', { optional: true }),
    };
    let rolled = 0;
    for (const r of rows) {
      const pc = normPostcode(r[cPc]);
      if (!pc) continue;
      const rec = touch(pc);
      rec.sa4 = String(r[cSa4] ?? '').trim();
      const a = num(r[idx.a]);
      const b = num(r[idx.b]);
      const c = num(r[idx.c]);
      let d = num(r[idx.d]);
      let e = num(r[idx.e]);
      const f = idx.f === -1 ? null : num(r[idx.f]);
      let highRolled = false;
      if (d === null && e === null && f !== null) {
        // Only the combined $120k+ figure survived suppression.
        highRolled = true;
        rolled++;
      }
      rec.bands = { a, b, c, d, e, high: highRolled ? f : d !== null || e !== null ? (d ?? 0) + (e ?? 0) : null, highRolled };
    }
    log(`table7A: ${out.size} postcodes (${rolled} with rolled-up $120k+ band)`);
  }

  // 7B — age bands.
  {
    const { headers, rows } = await readSheet(file, 'Table 7B');
    const col = columnFinder(headers, 'table7B');
    const cPc = col('Postcode');
    const keys = ['a. Under 25', 'b. 25 - 34', 'c. 35 - 44', 'd. 45 - 54', 'e. 55 - 64', 'f. 65 and over'];
    const cols = keys.map((k) => col(k));
    for (const r of rows) {
      const pc = normPostcode(r[cPc]);
      if (!pc) continue;
      touch(pc).ages = cols.map((i) => num(r[i]));
    }
  }

  // 7C — ANZSCO occupation major groups.
  {
    const { headers, rows } = await readSheet(file, 'Table 7C');
    const col = columnFinder(headers, 'table7C');
    const cPc = col('Postcode');
    const cols = OCCUPATIONS.map((o) => col(o.header));
    for (const r of rows) {
      const pc = normPostcode(r[cPc]);
      if (!pc) continue;
      touch(pc).occ = cols.map((i) => num(r[i]));
    }
  }

  return out;
}

// ANZSCO major groups exactly as Table 7C names them. '0 Blank' = no occupation
// stated (retirees, investors, those on government payments) — kept, because in
// retiree postcodes it is the largest group and hiding it would distort the mix.
export const OCCUPATIONS = [
  { header: '0 Blank', label: 'Not stated' },
  { header: '1 Managers', label: 'Managers' },
  { header: '2 Professionals', label: 'Professionals' },
  { header: '3 Technicians and Trades Workers', label: 'Technicians & Trades' },
  { header: '4 Community and Personal Service Workers', label: 'Community & Personal Service' },
  { header: '5 Clerical and Administrative Workers', label: 'Clerical & Admin' },
  { header: '6 Sales Workers', label: 'Sales' },
  { header: '7 Machinery Operators and Drivers', label: 'Machinery Operators & Drivers' },
  { header: '8 Labourers', label: 'Labourers' },
  { header: '9 Apprentices and trainees', label: 'Apprentices & Trainees' },
];

// ── Table 6B: the 161-item detail sheet, totals per postcode ──
async function readTable6() {
  const file = path.join(CACHE, 'table6.xlsx');
  // 6B is the all-taxable-statuses total (6A splits taxable / non-taxable and
  // would double-count if summed naively).
  const { headers, rows } = await readSheet(file, 'Table 6B');
  const col = columnFinder(headers, 'table6B');
  const cPc = col('Postcode');

  const F = {
    individuals: col('Individuals no.'),
    taxableIncomeN: col('Taxable income or loss4 no.'),
    taxableIncome$: col('Taxable income or loss4 $'),
    totalIncome$: col('Total Income or Loss4 $'),
    netTaxN: col('Net tax no.'),
    netTax$: col('Net tax $'),
    salaryN: col('Salary or wages no.'),
    salary$: col('Salary or wages $'),
    deductionsN: col('Total deductions4 no.'),
    deductions$: col('Total deductions4 $'),
    workExpenses$: col('Total work related expenses $'),
    giftsN: col('Gifts or donations no.'),
    gifts$: col('Gifts or donations $'),
    grossRentN: col('Gross rent no.'),
    rentLossN: col('Net rent - loss no.'),
    rentLoss$: col('Net rent - loss $'),
    rentProfitN: col('Net rent - profit no.'),
    capitalGainsN: col('Capital gains net capital gain no.'),
    capitalGains$: col('Capital gains net capital gain $'),
    helpN: col('HELP debt balance no.'),
    help$: col('HELP debt balance $'),
    phiN: col('People with private health insurance no.'),
    superN: col('Personal superannuation contributions no.'),
    super$: col('Personal superannuation contributions $'),
    interest$: col('Gross interest $'),
    frankingCredits$: col('Dividends franking credit $'),
  };

  const byPc = new Map();
  for (const r of rows) {
    const pc = normPostcode(r[cPc]);
    if (!pc) continue;
    const g = {};
    for (const [k, i] of Object.entries(F)) g[k] = num(r[i]);
    byPc.set(pc, g);
  }
  log(`table6B: ${byPc.size} postcodes x ${Object.keys(F).length} items`);
  return byPc;
}

// ── Postcode -> locality names ──
// Every value in this CSV is quoted, so it MUST go through a real RFC4180 parser —
// a naive line.split(',') leaves the quotes attached ('"3142"'), no postcode
// matches, and every suburb silently falls back to "Postcode 3142".
function readLocalities() {
  const csv = fs.readFileSync(path.join(CACHE, 'postcodes_ref.csv'), 'utf8');
  const { header, rows } = parseTable(csv);
  const head = header.map((h) => h.trim().toLowerCase());
  const iPc = head.indexOf('postcode');
  const iLoc = head.indexOf('locality');
  const iType = head.indexOf('type');
  const iStatus = head.indexOf('status');
  if (iPc === -1 || iLoc === -1) throw new Error('postcodes_ref.csv: missing postcode/locality columns');

  const byPc = new Map();
  for (const f of rows) {
    const pc = normPostcode(f[iPc]);
    const loc = (f[iLoc] || '').trim();
    if (!pc || !loc) continue;
    const type = iType === -1 ? '' : (f[iType] || '').trim();
    if (/^(LVR|Post Office Boxes)$/i.test(type)) continue; // PO-box-only ranges aren't places
    if (iStatus !== -1 && /deleted/i.test(f[iStatus] || '')) continue;
    if (!byPc.has(pc)) byPc.set(pc, new Set());
    byPc.get(pc).add(toTitle(loc));
  }
  if (byPc.size < 2000) throw new Error(`postcodes_ref.csv: only ${byPc.size} postcodes parsed — CSV parse is broken`);
  log(`localities: ${byPc.size} postcodes named`);
  return byPc;
}

function toTitle(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (m, c) => 'Mc' + c.toUpperCase());
}

function median(xs) {
  const s = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const { byPc: t8, years } = await readTable8();
  const t7 = await readTable7();
  const t6 = await readTable6();
  const localities = readLocalities();

  const postcodes = [];
  for (const [pc, base] of t8) {
    const d = t6.get(pc) ?? {};
    const x = t7.get(pc) ?? {};
    const n = d.individuals ?? base.n;
    if (!n) continue;

    const locs = [...(localities.get(pc) ?? [])].sort();
    // Primary label: shortest name is almost always the suburb the postcode is
    // known by (e.g. 3142 -> "Toorak", not "Hawksburn").
    const name = locs.length ? locs.slice().sort((a, b) => a.length - b.length)[0] : `Postcode ${pc}`;

    postcodes.push({
      pc,
      st: base.state,
      sa4: x.sa4 ?? '',
      name,
      locs: locs.slice(0, 8),
      n,
      med: base.med,
      avg: base.avg,
      // The signature metric: how far the average sits above the median.
      gap: r4(ratio(base.avg, base.med)),
      // 20-year median history, compacted to [year, median, average] triples.
      series: base.series.filter((s) => s.med !== null).map((s) => [s.year, s.med, s.avg]),
      bands: x.bands ? [x.bands.a, x.bands.b, x.bands.c, x.bands.d, x.bands.e] : null,
      bandHigh: x.bands?.high ?? null,
      bandRolled: !!x.bands?.highRolled,
      ages: x.ages ?? null,
      occ: x.occ ?? null,
      // Effective tax rate on taxable income — what people actually pay.
      taxRate: r4(ratio(d.netTax$, d.taxableIncome$)),
      salaryAvg: r0(ratio(d.salary$, d.salaryN)),
      salaryShare: r4(per(d.salaryN, n)),
      dedAvg: r0(ratio(d.deductions$, d.deductionsN)),
      workExpAvg: r0(ratio(d.workExpenses$, d.deductionsN)),
      giftRate: r4(per(d.giftsN, n)),
      giftAvg: r0(ratio(d.gifts$, d.giftsN)),
      // Negative gearing: individuals whose rental property ran at a loss.
      // The ATO reports the loss as a negative dollar amount; store the magnitude
      // so the UI can say "average loss of $33,067" without a stray minus sign.
      negGearRate: r4(per(d.rentLossN, n)),
      negGearAvg: r0(absOrNull(ratio(d.rentLoss$, d.rentLossN))),
      landlordRate: r4(per(d.grossRentN, n)),
      rentProfitN: d.rentProfitN ?? null,
      rentLossN: d.rentLossN ?? null,
      cgRate: r4(per(d.capitalGainsN, n)),
      cgAvg: r0(ratio(d.capitalGains$, d.capitalGainsN)),
      helpRate: r4(per(d.helpN, n)),
      helpAvg: r0(ratio(d.help$, d.helpN)),
      phiRate: r4(per(d.phiN, n)),
      superAvg: r0(ratio(d.super$, d.superN)),
      frankingAvg: r0(ratio(d.frankingCredits$, n)),
      netTaxAvg: r0(ratio(d.netTax$, n)),
      totalTax: d.netTax$ ?? null,
    });
  }

  postcodes.sort((a, b) => a.pc.localeCompare(b.pc));
  log(`joined ${postcodes.length} postcodes`);

  // Filter boundaries to postcodes we actually have data for, so the map never
  // renders a grey polygon with no record behind it.
  const geoRaw = JSON.parse(fs.readFileSync(path.join(CACHE, 'poa.geojson'), 'utf8'));
  const have = new Set(postcodes.map((p) => p.pc));
  const features = [];
  for (const f of geoRaw.features) {
    const pc = normPostcode(f.properties.POA_CODE21);
    if (!pc || !have.has(pc)) continue;
    features.push({ type: 'Feature', properties: { pc }, geometry: f.geometry });
  }
  const geo = { type: 'FeatureCollection', features };
  log(`geo: ${features.length}/${geoRaw.features.length} POA polygons matched to data`);
  if (features.length < 1500) throw new Error(`Only ${features.length} polygons matched — join is broken`);

  const totalIndividuals = postcodes.reduce((s, p) => s + p.n, 0);
  const totalTax = postcodes.reduce((s, p) => s + (p.totalTax ?? 0), 0);
  const sorted = (key) => postcodes.filter((p) => p[key] !== null).sort((a, b) => b[key] - a[key]);
  const big = postcodes.filter((p) => p.n >= 1000);

  const meta = {
    year: LATEST,
    years,
    generated: new Date().toISOString(),
    counts: {
      postcodes: postcodes.length,
      individuals: totalIndividuals,
      polygons: features.length,
    },
    national: {
      medianOfMedians: median(postcodes.map((p) => p.med)),
      medianOfAverages: median(postcodes.map((p) => p.avg)),
      medianGap: median(postcodes.map((p) => p.gap)),
      totalNetTax: totalTax,
    },
    extremes: {
      topMedian: sorted('med')
        .slice(0, 3)
        .map((p) => ({ pc: p.pc, name: p.name, st: p.st, v: p.med })),
      topAverage: sorted('avg')
        .slice(0, 3)
        .map((p) => ({ pc: p.pc, name: p.name, st: p.st, v: p.avg })),
      topGap: big
        .filter((p) => p.gap !== null)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 3)
        .map((p) => ({ pc: p.pc, name: p.name, st: p.st, v: p.gap })),
    },
    sources: [
      {
        name: `ATO Taxation Statistics ${LATEST} — Individuals Table 6, 7, 8`,
        url: 'https://data.gov.au/data/dataset/taxation-statistics-2023-24',
        note: 'Individual tax return data by postcode. Small cells suppressed for privacy.',
      },
      {
        name: 'ABS ASGS 2021 Postal Areas (digital boundaries)',
        url: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026',
        note: 'Postcode polygons, mapshaper-simplified to 1.2%.',
      },
      {
        name: 'matthewproctor/australianpostcodes',
        url: 'https://github.com/matthewproctor/australianpostcodes',
        note: 'Postcode to locality names.',
      },
    ],
  };

  fs.writeFileSync(path.join(OUT, 'postcodes.json'), JSON.stringify(postcodes));
  fs.writeFileSync(path.join(OUT, 'poa.geojson'), JSON.stringify(geo));
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  for (const f of ['postcodes.json', 'poa.geojson', 'meta.json']) {
    log(`wrote ${f} (${fs.statSync(path.join(OUT, f)).size.toLocaleString()} bytes)`);
  }
  log(
    `done: ${postcodes.length} postcodes, ${totalIndividuals.toLocaleString()} individuals, ` +
      `median of medians $${Math.round(meta.national.medianOfMedians).toLocaleString()}`,
  );
}

main().catch((e) => {
  process.stderr.write(`[aggregate] FAILED: ${e.stack}\n`);
  process.exit(1);
});
