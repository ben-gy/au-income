import { describe, expect, it } from 'vitest';
import { buildInsights, cagr, histogram, median, quantile, rankOf, substantial } from '../src/analysis';
import type { Postcode } from '../src/types';

function pc(over: Partial<Postcode> & { pc: string; med: number; avg: number; n: number }): Postcode {
  return {
    st: 'NSW',
    sa4: 'Sydney',
    name: `Suburb ${over.pc}`,
    locs: [],
    gap: over.avg / over.med,
    series: [
      ['2003-04', over.med / 2, over.avg / 2],
      ['2023-24', over.med, over.avg],
    ],
    bands: null,
    bandHigh: null,
    bandRolled: false,
    ages: null,
    occ: null,
    taxRate: 0.3,
    salaryAvg: null,
    salaryShare: null,
    dedAvg: null,
    workExpAvg: null,
    giftRate: 0.2,
    giftAvg: 500,
    negGearRate: 0.08,
    negGearAvg: 20000,
    landlordRate: 0.1,
    rentProfitN: 10,
    rentLossN: 10,
    cgRate: 0.05,
    cgAvg: 1000,
    helpRate: 0.1,
    helpAvg: 20000,
    phiRate: 0.5,
    superAvg: null,
    frankingAvg: null,
    netTaxAvg: null,
    totalTax: 1000,
    ...over,
  } as Postcode;
}

describe('median', () => {
  it('returns the middle value for odd counts', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('averages the two middle values for even counts', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('ignores NaN and Infinity', () => {
    expect(median([1, NaN, 3, Infinity])).toBe(2);
  });
  it('returns null for an empty set', () => {
    expect(median([])).toBeNull();
    expect(median([NaN])).toBeNull();
  });
  it('does not mutate the caller array', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('quantile', () => {
  it('interpolates between values', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
  });
  it('returns bounds at 0 and 1', () => {
    expect(quantile([5, 1, 9], 0)).toBe(1);
    expect(quantile([5, 1, 9], 1)).toBe(9);
  });
  it('clamps out-of-range q', () => {
    expect(quantile([1, 2, 3], -5)).toBe(1);
    expect(quantile([1, 2, 3], 5)).toBe(3);
  });
  it('returns null when empty', () => {
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('cagr', () => {
  it('computes compound growth', () => {
    expect(cagr(100, 200, 10)).toBeCloseTo(0.0718, 3);
  });
  it('returns 0 for no change', () => {
    expect(cagr(100, 100, 5)).toBeCloseTo(0, 10);
  });
  it('guards against zero/negative inputs', () => {
    expect(cagr(0, 100, 5)).toBeNull();
    expect(cagr(100, 200, 0)).toBeNull();
    expect(cagr(NaN, 200, 5)).toBeNull();
  });
});

describe('substantial', () => {
  it('filters out postcodes below the taxpayer floor', () => {
    const set = [pc({ pc: '1000', med: 50000, avg: 60000, n: 999 }), pc({ pc: '1001', med: 50000, avg: 60000, n: 1000 })];
    expect(substantial(set).map((p) => p.pc)).toEqual(['1001']);
  });
});

describe('rankOf', () => {
  const set = [
    pc({ pc: '1000', med: 30000, avg: 40000, n: 5000 }),
    pc({ pc: '1001', med: 90000, avg: 95000, n: 5000 }),
    pc({ pc: '1002', med: 60000, avg: 70000, n: 5000 }),
  ];
  it('ranks 1 for the highest value', () => {
    expect(rankOf(set, '1001', (p) => p.med)).toBe(1);
  });
  it('ranks last for the lowest', () => {
    expect(rankOf(set, '1000', (p) => p.med)).toBe(3);
  });
  it('returns null for an unknown postcode', () => {
    expect(rankOf(set, '9999', (p) => p.med)).toBeNull();
  });
  it('skips records with a null metric rather than ranking them top', () => {
    // Distinct taxRates: with ties the rank would be arbitrary and the
    // assertion would be testing sort stability, not null handling.
    const rated = [
      pc({ pc: '2000', med: 1, avg: 1, n: 10, taxRate: 0.4 }),
      pc({ pc: '2001', med: 1, avg: 1, n: 10, taxRate: 0.2 }),
      pc({ pc: '2002', med: 1, avg: 1, n: 10, taxRate: null }),
    ];
    expect(rankOf(rated, '2002', (p) => p.taxRate)).toBeNull();
    expect(rankOf(rated, '2000', (p) => p.taxRate)).toBe(1);
    expect(rankOf(rated, '2001', (p) => p.taxRate)).toBe(2);
  });
});

describe('histogram', () => {
  const set = [
    pc({ pc: '1000', med: 10, avg: 10, n: 100 }),
    pc({ pc: '1001', med: 20, avg: 20, n: 100 }),
    pc({ pc: '1002', med: 30, avg: 30, n: 100 }),
    pc({ pc: '1003', med: 40, avg: 40, n: 100 }),
  ];

  it('places every record in exactly one bin', () => {
    const bins = histogram(set, (p) => p.med, 4);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(set.length);
    expect(bins.reduce((s, b) => s + b.items.length, 0)).toBe(set.length);
  });

  it('puts the maximum value in the final bin rather than overflowing', () => {
    const bins = histogram(set, (p) => p.med, 4);
    expect(bins[bins.length - 1].items.some((p) => p.med === 40)).toBe(true);
  });

  it('produces contiguous, ascending, non-overlapping bins', () => {
    const bins = histogram(set, (p) => p.med, 4);
    for (let i = 0; i < bins.length; i++) {
      expect(bins[i].hi).toBeGreaterThan(bins[i].lo);
      if (i > 0) expect(bins[i].lo).toBeCloseTo(bins[i - 1].hi, 9);
    }
  });

  it('never emits NaN bounds', () => {
    for (const b of histogram(set, (p) => p.med, 7)) {
      expect(Number.isFinite(b.lo)).toBe(true);
      expect(Number.isFinite(b.hi)).toBe(true);
    }
  });

  it('ignores records whose value is null', () => {
    const withNull = [...set, pc({ pc: '1004', med: 50, avg: 50, n: 10, taxRate: null })];
    const bins = histogram(withNull, (p) => p.taxRate, 3);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(set.length);
  });

  it('handles a single distinct value without dividing by zero', () => {
    const same = [pc({ pc: '1', med: 5, avg: 5, n: 10 }), pc({ pc: '2', med: 5, avg: 5, n: 10 })];
    const bins = histogram(same, (p) => p.med, 4);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(2);
    for (const b of bins) expect(Number.isFinite(b.lo)).toBe(true);
  });

  it('returns nothing for empty input or a nonsense bin count', () => {
    expect(histogram([], (p) => p.med, 5)).toEqual([]);
    expect(histogram(set, (p) => p.med, 0)).toEqual([]);
  });
});

describe('buildInsights', () => {
  const realistic = [
    pc({ pc: '3142', med: 82873, avg: 277708, n: 9933, name: 'Toorak', st: 'VIC' }),
    pc({ pc: '6716', med: 142580, avg: 128156, n: 3930, name: 'Fortescue', st: 'WA' }),
    pc({ pc: '2000', med: 40697, avg: 96404, n: 26169, name: 'Sydney', st: 'NSW' }),
    pc({ pc: '3000', med: 34511, avg: 56233, n: 41355, name: 'Melbourne', st: 'VIC' }),
    pc({ pc: '4000', med: 55000, avg: 66000, n: 12000, name: 'Brisbane', st: 'QLD' }),
  ];

  it('produces insights with the fields the view renders', () => {
    const out = buildInsights(realistic);
    expect(out.length).toBeGreaterThan(0);
    for (const i of out) {
      expect(i.id).toBeTruthy();
      expect(i.title).toBeTruthy();
      expect(i.body).toBeTruthy();
      expect(['info', 'notable', 'extreme']).toContain(i.severity);
    }
  });

  it('never renders a raw NaN, undefined or null into insight copy', () => {
    for (const i of buildInsights(realistic)) {
      expect(i.title).not.toMatch(/NaN|undefined|null/);
      expect(i.body).not.toMatch(/NaN|undefined|null/);
    }
  });

  it('identifies the widest gap postcode', () => {
    const gapInsight = buildInsights(realistic).find((i) => i.id === 'gap-extremes');
    expect(gapInsight?.refs[0].pc).toBe('3142');
  });

  it('only references postcodes that exist in the input', () => {
    const known = new Set(realistic.map((p) => p.pc));
    for (const i of buildInsights(realistic)) {
      for (const r of i.refs) expect(known.has(r.pc)).toBe(true);
    }
  });

  it('returns an empty list rather than throwing on empty input', () => {
    expect(buildInsights([])).toEqual([]);
  });

  it('does not throw when every optional metric is null', () => {
    const bare = [
      pc({
        pc: '1000',
        med: 50000,
        avg: 60000,
        n: 5000,
        taxRate: null,
        negGearRate: null,
        helpRate: null,
        giftAvg: null,
        giftRate: null,
      }),
    ];
    expect(() => buildInsights(bare)).not.toThrow();
  });
});
