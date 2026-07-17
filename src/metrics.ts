import { formatMoney, formatPercent, formatRatio } from './format';
import type { Postcode } from './types';

/**
 * Every metric the map / rankings / explorer can switch between. Defined once so
 * a metric's label, formatter, colour ramp and tooltip copy are identical in
 * every view.
 */
export interface Metric {
  key: string;
  label: string;
  short: string;
  /** What the number means, in plain words. Shown under the view title. */
  blurb: string;
  get: (p: Postcode) => number | null;
  format: (v: number | null) => string;
  /** Diverging metrics centre their colour ramp on a midpoint instead of a min. */
  diverging?: boolean;
  /** Value at the centre of a diverging ramp. */
  centre?: number;
  /** Higher is not always "better" — used only for neutral wording. */
  unit: 'money' | 'percent' | 'ratio';
}

export const METRICS: Metric[] = [
  {
    key: 'med',
    label: 'Median taxable income',
    short: 'Median income',
    blurb: 'The middle earner: half the postcode earns more, half earns less. The most honest single number.',
    get: (p) => p.med,
    format: (v) => formatMoney(v),
    unit: 'money',
  },
  {
    key: 'avg',
    label: 'Average taxable income',
    short: 'Average income',
    blurb: 'The mean. A handful of very large incomes can pull this far above what a typical person earns.',
    get: (p) => p.avg,
    format: (v) => formatMoney(v),
    unit: 'money',
  },
  {
    key: 'gap',
    label: 'Average ÷ median (the gap)',
    short: 'The gap',
    blurb:
      'How far the average sits above the middle earner. Near 1.0× means most people earn alike; 3× means a few enormous incomes are lifting the average.',
    get: (p) => p.gap,
    format: (v) => formatRatio(v),
    diverging: true,
    centre: 1.23,
    unit: 'ratio',
  },
  {
    key: 'taxRate',
    label: 'Effective tax rate',
    short: 'Tax rate',
    blurb: 'Net tax paid as a share of taxable income across everyone in the postcode.',
    get: (p) => p.taxRate,
    format: (v) => formatPercent(v),
    unit: 'percent',
  },
  {
    key: 'negGearRate',
    label: 'Negatively geared',
    short: 'Negative gearing',
    blurb: 'Share of taxpayers whose rental property lost money — a loss they deduct from their other income.',
    get: (p) => p.negGearRate,
    format: (v) => formatPercent(v),
    unit: 'percent',
  },
  {
    key: 'helpRate',
    label: 'Has a HELP/HECS debt',
    short: 'HELP debt',
    blurb: 'Share of taxpayers still carrying a student loan balance.',
    get: (p) => p.helpRate,
    format: (v) => formatPercent(v),
    unit: 'percent',
  },
  {
    key: 'giftRate',
    label: 'Claims donations',
    short: 'Donations',
    blurb: 'Share of taxpayers claiming a deduction for gifts or donations to charity.',
    get: (p) => p.giftRate,
    format: (v) => formatPercent(v),
    unit: 'percent',
  },
];

export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

export function getMetric(key: string): Metric {
  return METRIC_BY_KEY.get(key) ?? METRICS[0];
}

/** State colours — identical across table pills, bars, scatter, matrix and map. */
export const STATE_COLOURS: Record<string, string> = {
  NSW: '#2b6cb0',
  VIC: '#6b46c1',
  QLD: '#c53030',
  WA: '#b7791f',
  SA: '#dd6b20',
  TAS: '#2f855a',
  ACT: '#2c7a7b',
  NT: '#b83280',
  OTHER: '#718096',
};

export const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

export function stateColour(st: string): string {
  return STATE_COLOURS[st] ?? STATE_COLOURS.OTHER;
}

/** Sequential ramp (light -> deep navy) for magnitude metrics. */
const SEQUENTIAL = ['#eaf2f8', '#c7ddef', '#9cc3e0', '#6ba3cd', '#3f7fb4', '#245e91', '#123a5c'];

/** Diverging ramp (teal -> neutral -> amber) for the gap metric. */
const DIVERGING = ['#2c7a7b', '#7fb3ad', '#cfe0dc', '#f0ece4', '#f2d5a8', '#e0a35c', '#c2681a'];

/**
 * Quantile breakpoints. Income is extremely skewed — an equal-interval scale
 * paints 95% of the country the same colour and only Toorak stands out, so the
 * choropleth uses quantiles of the actual distribution instead.
 */
export function quantileBreaks(values: number[], buckets: number): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const breaks: number[] = [];
  for (let i = 1; i < buckets; i++) {
    const q = (i / buckets) * (sorted.length - 1);
    const lo = Math.floor(q);
    const hi = Math.ceil(q);
    breaks.push(sorted[lo] + (sorted[hi] - sorted[lo]) * (q - lo));
  }
  return breaks;
}

export interface ColourScale {
  colours: string[];
  breaks: number[];
  of: (v: number | null) => string;
}

const NO_DATA = '#e6eaee';

export function makeScale(values: number[], metric: Metric): ColourScale {
  const colours = metric.diverging ? DIVERGING : SEQUENTIAL;
  const breaks = quantileBreaks(values, colours.length);
  return {
    colours,
    breaks,
    of(v: number | null): string {
      if (v === null || !Number.isFinite(v)) return NO_DATA;
      let i = 0;
      while (i < breaks.length && v >= breaks[i]) i++;
      return colours[Math.min(i, colours.length - 1)];
    },
  };
}

export const NO_DATA_COLOUR = NO_DATA;
export { DIVERGING as DIVERGING_RAMP, SEQUENTIAL as SEQUENTIAL_RAMP };
