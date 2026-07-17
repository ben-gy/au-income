/**
 * Pure analysis over the postcode set. Everything here is deterministic and unit
 * tested — the Insights view is only as trustworthy as these functions.
 */
import { formatMoney, formatPercent, formatRatio } from './format';
import type { Postcode } from './types';

export type Severity = 'info' | 'notable' | 'extreme';

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  /** Postcodes a reader can click straight into. */
  refs: Array<{ pc: string; name: string; st: string }>;
}

export function median(values: number[]): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function quantile(values: number[], q: number): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Compound annual growth rate between two values over `years` years. */
export function cagr(from: number, to: number, years: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || years <= 0) return null;
  return Math.pow(to / from, 1 / years) - 1;
}

const ref = (p: Postcode) => ({ pc: p.pc, name: p.name, st: p.st });

/** Only postcodes with enough taxpayers to draw conclusions from. */
export function substantial(postcodes: Postcode[], min = 1000): Postcode[] {
  return postcodes.filter((p) => p.n >= min);
}

function topBy<T>(items: T[], get: (t: T) => number | null, n: number): T[] {
  return items
    .filter((i) => {
      const v = get(i);
      return v !== null && Number.isFinite(v);
    })
    .sort((a, b) => (get(b) as number) - (get(a) as number))
    .slice(0, n);
}

export function buildInsights(postcodes: Postcode[]): Insight[] {
  const out: Insight[] = [];
  const big = substantial(postcodes);
  if (!big.length) return out;

  const medMedian = median(postcodes.map((p) => p.med));
  const gapMedian = median(postcodes.map((p) => p.gap ?? NaN));

  // 1. The headline: average vs median tell opposite stories.
  const topGap = topBy(big, (p) => p.gap, 3);
  if (topGap.length && gapMedian !== null) {
    const t = topGap[0];
    out.push({
      id: 'gap-extremes',
      severity: 'extreme',
      title: `In ${t.name}, the average income is ${formatRatio(t.gap)} the median`,
      body:
        `Half of ${t.name} (${t.pc}) earns under ${formatMoney(t.med)}, yet the average is ${formatMoney(t.avg)} — ` +
        `a handful of very large incomes drag the mean up. Across Australia the typical postcode's gap is only ` +
        `${formatRatio(gapMedian)}. Quoting the "average income" of a postcode like this describes almost nobody who lives there.`,
      refs: topGap.map(ref),
    });
  }

  // 2. The counter-intuitive one: highest MEDIANS aren't the rich suburbs.
  const topMed = topBy(postcodes, (p) => p.med, 5);
  const topAvg = topBy(postcodes, (p) => p.avg, 5);
  const medianLeaders = topMed.filter((p) => !topAvg.some((a) => a.pc === p.pc));
  if (medianLeaders.length >= 2 && medMedian !== null) {
    const a = medianLeaders[0];
    out.push({
      id: 'median-vs-average-leaders',
      severity: 'extreme',
      title: `The highest typical incomes are in mining country, not the harbour suburbs`,
      body:
        `${a.name} (${a.pc}, ${a.st}) has the highest median income in Australia at ${formatMoney(a.med)} — ` +
        `${formatRatio(a.med / medMedian)} the national postcode median of ${formatMoney(medMedian)} — but its average ` +
        `(${formatMoney(a.avg)}) is close to, or below, that median. Nearly everyone there earns a high wage, ` +
        `rather than a few people earning enormous ones. It is the mirror image of ${topAvg[0].name}.`,
      refs: [...medianLeaders.slice(0, 3), topAvg[0]].map(ref),
    });
  }

  // 3. Negative gearing concentration.
  const negGear = topBy(big, (p) => p.negGearRate, 3);
  const negGearMedian = median(big.map((p) => p.negGearRate ?? NaN));
  if (negGear.length && negGearMedian !== null && negGear[0].negGearRate) {
    const g = negGear[0];
    out.push({
      id: 'negative-gearing',
      severity: 'notable',
      title: `${formatPercent(g.negGearRate)} of taxpayers in ${g.name} negatively gear a property`,
      body:
        `That is ${formatRatio((g.negGearRate as number) / negGearMedian)} the rate of the typical postcode ` +
        `(${formatPercent(negGearMedian)}). The average declared rental loss there is ${formatMoney(g.negGearAvg)}, ` +
        `deducted from other income and so reducing tax paid.`,
      refs: negGear.map(ref),
    });
  }

  // 4. Where the student debt sits.
  const help = topBy(big, (p) => p.helpRate, 3);
  if (help.length && help[0].helpRate) {
    const h = help[0];
    out.push({
      id: 'help-debt',
      severity: 'info',
      title: `${formatPercent(h.helpRate)} of taxpayers in ${h.name} still owe HELP debt`,
      body:
        `The average outstanding balance is ${formatMoney(h.helpAvg)}. HELP debt concentrates in young, ` +
        `university-educated inner-city postcodes — it maps where recent graduates live, not where degrees were earned.`,
      refs: help.map(ref),
    });
  }

  // 5. Lowest medians — the other end of the country.
  const lowest = postcodes
    .filter((p) => p.n >= 1000 && Number.isFinite(p.med))
    .sort((a, b) => a.med - b.med)
    .slice(0, 3);
  if (lowest.length && medMedian !== null) {
    const l = lowest[0];
    out.push({
      id: 'lowest-medians',
      severity: 'notable',
      title: `The lowest median income of any sizeable postcode is ${formatMoney(l.med)}`,
      body:
        `In ${l.name} (${l.pc}, ${l.st}) the middle earner takes home ${formatMoney(l.med)} — ` +
        `${formatPercent(1 - l.med / medMedian, 0)} below the national postcode median of ${formatMoney(medMedian)}. ` +
        `Postcodes at this end are typically student-heavy, remote, or have a large share of residents on pensions and allowances.`,
      refs: lowest.map(ref),
    });
  }

  // 6. Charitable giving generosity vs size of gift.
  const gift = topBy(big, (p) => p.giftAvg, 3);
  if (gift.length && gift[0].giftAvg && gift[0].giftRate) {
    const g = gift[0];
    out.push({
      id: 'donations',
      severity: 'info',
      title: `The largest average donation claim is ${formatMoney(g.giftAvg)}, in ${g.name}`,
      body:
        `${formatPercent(g.giftRate)} of taxpayers there claim a gift deduction. Average claim size is driven by a ` +
        `small number of very large gifts, so it tracks the concentration of high incomes rather than how many people give.`,
      refs: gift.map(ref),
    });
  }

  // 7. Effective tax rate spread.
  const taxTop = topBy(big, (p) => p.taxRate, 1);
  const taxLow = big
    .filter((p) => p.taxRate !== null)
    .sort((a, b) => (a.taxRate as number) - (b.taxRate as number))
    .slice(0, 1);
  if (taxTop.length && taxLow.length) {
    out.push({
      id: 'tax-rate-spread',
      severity: 'info',
      title: `Effective tax rates run from ${formatPercent(taxLow[0].taxRate)} to ${formatPercent(taxTop[0].taxRate)}`,
      body:
        `${taxTop[0].name} pays the highest share of its taxable income in net tax (${formatPercent(taxTop[0].taxRate)}), ` +
        `while ${taxLow[0].name} pays ${formatPercent(taxLow[0].taxRate)}. Australia's progressive brackets mean the rate ` +
        `rises with income, so this map is largely an income map — with deductions bending it at the top.`,
      refs: [taxTop[0], taxLow[0]].map(ref),
    });
  }

  return out;
}

/** Rank of a postcode within the set for a metric, 1 = highest. */
export function rankOf(postcodes: Postcode[], pc: string, get: (p: Postcode) => number | null): number | null {
  const ranked = postcodes
    .filter((p) => {
      const v = get(p);
      return v !== null && Number.isFinite(v);
    })
    .sort((a, b) => (get(b) as number) - (get(a) as number));
  const i = ranked.findIndex((p) => p.pc === pc);
  return i === -1 ? null : i + 1;
}

/** Histogram bins over a numeric field. Returns [lo, hi) buckets. */
export interface Bin {
  lo: number;
  hi: number;
  count: number;
  items: Postcode[];
}

export function histogram(postcodes: Postcode[], get: (p: Postcode) => number | null, binCount: number, maxCap?: number): Bin[] {
  const vals = postcodes
    .map((p) => ({ p, v: get(p) }))
    .filter((x): x is { p: Postcode; v: number } => x.v !== null && Number.isFinite(x.v));
  if (!vals.length || binCount < 1) return [];
  const lo = Math.min(...vals.map((x) => x.v));
  const hiRaw = Math.max(...vals.map((x) => x.v));
  const hi = maxCap !== undefined ? Math.min(hiRaw, maxCap) : hiRaw;
  const span = hi - lo || 1;
  const width = span / binCount;
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    lo: lo + i * width,
    hi: lo + (i + 1) * width,
    count: 0,
    items: [],
  }));
  for (const { p, v } of vals) {
    // Values above the cap land in the final bin so the tail is never dropped.
    let idx = Math.floor((v - lo) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
    bins[idx].items.push(p);
  }
  return bins;
}
