/**
 * Positional correctness for the hand-rolled chart geometry.
 *
 * WHY positions, not just "it returned a number": area/count-only assertions pass
 * on visually broken layouts. These assert that every mark lands inside the
 * canvas, that ordering is preserved, and that no coordinate is ever NaN — the
 * failure modes that actually ship.
 */
import { describe, expect, it } from 'vitest';
import { histogram } from '../src/analysis';
import { linearScale, logScale, logTicks, niceTicks, sparklinePath } from '../src/utils/svg';
import { clampViewBox, zoomViewBox, type ViewBox } from '../src/utils/svgZoom';
import { makeScale, quantileBreaks, METRICS } from '../src/metrics';
import { declutter } from '../src/views/trend';
import type { Postcode } from '../src/types';

const W = 960;
const H = 560;
const PAD = 60;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('linearScale', () => {
  it('maps domain endpoints onto range endpoints', () => {
    const s = linearScale(0, 100, 0, 500);
    expect(s(0)).toBe(0);
    expect(s(100)).toBe(500);
    expect(s(50)).toBe(250);
  });
  it('supports an inverted range (SVG y axis grows downward)', () => {
    const s = linearScale(0, 100, 500, 0);
    expect(s(0)).toBe(500);
    expect(s(100)).toBe(0);
  });
  it('collapses to the range start instead of dividing by zero', () => {
    const s = linearScale(5, 5, 10, 100);
    expect(s(5)).toBe(10);
    expect(Number.isFinite(s(5))).toBe(true);
  });
});

describe('logScale', () => {
  it('maps endpoints and is monotonic in between', () => {
    const s = logScale(1000, 100000, PAD, W - PAD);
    expect(s(1000)).toBeCloseTo(PAD, 6);
    expect(s(100000)).toBeCloseTo(W - PAD, 6);
    expect(s(10000)).toBeGreaterThan(s(1000));
    expect(s(100000)).toBeGreaterThan(s(10000));
  });
  it('places a decade at the midpoint of a two-decade span', () => {
    const s = logScale(100, 10000, 0, 100);
    expect(s(1000)).toBeCloseTo(50, 6);
  });
  it('never returns NaN for zero or negative input', () => {
    const s = logScale(1000, 100000, 0, 100);
    expect(Number.isFinite(s(0))).toBe(true);
    expect(Number.isFinite(s(-500))).toBe(true);
  });
  it('collapses safely on a degenerate domain', () => {
    const s = logScale(1000, 1000, 0, 100);
    expect(Number.isFinite(s(1000))).toBe(true);
  });
});

describe('scatter geometry (The Gap view)', () => {
  const rand = mulberry32(11);
  const points = Array.from({ length: 400 }, () => {
    const med = 20000 + rand() * 130000;
    return { med, avg: med * (0.85 + rand() * 2.6) };
  });

  it('keeps every dot inside the plot area, with no NaN coordinates', () => {
    const lo = Math.min(...points.map((p) => Math.min(p.med, p.avg))) * 0.9;
    const hi = Math.max(...points.map((p) => Math.max(p.med, p.avg))) * 1.1;
    const x = logScale(lo, hi, PAD, W - 16);
    const y = logScale(lo, hi, H - 48, 14);

    for (const p of points) {
      const cx = x(p.med);
      const cy = y(p.avg);
      expect(Number.isFinite(cx)).toBe(true);
      expect(Number.isFinite(cy)).toBe(true);
      expect(cx).toBeGreaterThanOrEqual(PAD - 1e-6);
      expect(cx).toBeLessThanOrEqual(W - 16 + 1e-6);
      expect(cy).toBeGreaterThanOrEqual(14 - 1e-6);
      expect(cy).toBeLessThanOrEqual(H - 48 + 1e-6);
    }
  });

  it('puts a postcode above the y=x line exactly when its average exceeds its median', () => {
    const x = logScale(10000, 400000, PAD, W - 16);
    const y = logScale(10000, 400000, H - 48, 14);
    // Toorak: average far above median -> plotted above the diagonal (smaller y).
    expect(y(277708)).toBeLessThan(y(82873));
    // Fortescue: average below median -> plotted below the diagonal (larger y).
    expect(y(128156)).toBeGreaterThan(y(142580));
    // Equal values land exactly on the diagonal.
    expect(y(50000)).toBeCloseTo(H - 48 - (x(50000) - PAD) * ((H - 48 - 14) / (W - 16 - PAD)), 6);
  });
});

describe('niceTicks', () => {
  it('produces ascending ticks covering the domain', () => {
    const ticks = niceTicks(0, 1000, 5);
    expect(ticks.length).toBeGreaterThan(1);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(1000);
  });
  it('uses round step values', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it('degenerates safely when hi <= lo', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(10, 5)).toEqual([10]);
    expect(niceTicks(NaN, 5)).toEqual([NaN]);
  });
});

describe('logTicks', () => {
  it('emits 1/2/5 ticks inside the domain only', () => {
    const ticks = logTicks(1000, 100000);
    expect(ticks).toContain(1000);
    expect(ticks).toContain(20000);
    expect(ticks).toContain(50000);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(1000);
      expect(t).toBeLessThanOrEqual(100000);
    }
  });
  it('returns ascending values', () => {
    const ticks = logTicks(500, 250000);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
  });
});

describe('histogram bar geometry', () => {
  function fake(pc: string, med: number): Postcode {
    return { pc, med, avg: med, n: 1000 } as Postcode;
  }
  const rand = mulberry32(3);
  const set = Array.from({ length: 500 }, (_, i) => fake(String(1000 + i), 20000 + rand() * 120000));

  it('lays every bar inside the canvas with no overlap between neighbours', () => {
    const bins = histogram(set, (p) => p.med, 34);
    const padL = 48;
    const padR = 12;
    const bw = (W - padL - padR) / bins.length;
    const y = linearScale(0, Math.max(...bins.map((b) => b.count)), H - 40, 10);

    let prevRight = padL - 1e-9;
    for (let i = 0; i < bins.length; i++) {
      const x = padL + i * bw;
      const w = Math.max(1, bw - 1.5);
      const top = y(bins[i].count);
      expect(Number.isFinite(x) && Number.isFinite(w) && Number.isFinite(top)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(prevRight - 1e-6); // no overlap with the previous bar
      expect(x + w).toBeLessThanOrEqual(W - padR + 1e-6); // inside the canvas
      expect(top).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(top).toBeLessThanOrEqual(H - 40 + 1e-6);
      prevRight = x + w;
    }
  });

  it('gives the tallest bar the full plot height and an empty bar zero height', () => {
    const bins = histogram(set, (p) => p.med, 20);
    const maxCount = Math.max(...bins.map((b) => b.count));
    const y = linearScale(0, maxCount, H - 40, 10);
    expect(y(maxCount)).toBeCloseTo(10, 6);
    expect(H - 40 - y(0)).toBeCloseTo(0, 6);
  });
});

describe('quantileBreaks', () => {
  it('returns buckets-1 ascending breakpoints', () => {
    const breaks = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(breaks).toHaveLength(4);
    for (let i = 1; i < breaks.length; i++) expect(breaks[i]).toBeGreaterThanOrEqual(breaks[i - 1]);
  });
  it('splits a uniform distribution evenly', () => {
    const breaks = quantileBreaks([0, 25, 50, 75, 100], 2);
    expect(breaks[0]).toBe(50);
  });
  it('handles empty input and a single value', () => {
    expect(quantileBreaks([], 5)).toEqual([]);
    expect(quantileBreaks([7], 3)).toEqual([7, 7]);
  });
});

describe('makeScale', () => {
  const metric = METRICS[0];
  it('assigns a colour from the ramp for in-range values', () => {
    const scale = makeScale([10, 20, 30, 40, 50, 60, 70], metric);
    expect(scale.colours).toContain(scale.of(10));
    expect(scale.colours).toContain(scale.of(70));
  });
  it('gives the lowest and highest values different colours', () => {
    const scale = makeScale([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric);
    expect(scale.of(1)).not.toBe(scale.of(10));
  });
  it('is monotonic — a higher value never gets an earlier ramp colour', () => {
    const scale = makeScale(Array.from({ length: 100 }, (_, i) => i), metric);
    let prev = -1;
    for (let v = 0; v < 100; v += 5) {
      const idx = scale.colours.indexOf(scale.of(v));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });
  it('returns the no-data colour for null rather than the bottom of the ramp', () => {
    const scale = makeScale([1, 2, 3], metric);
    expect(scale.colours).not.toContain(scale.of(null));
  });
});

describe('zoomViewBox / clampViewBox', () => {
  const base: ViewBox = { x: 0, y: 0, w: 100, h: 100 };

  it('never zooms out beyond the base view', () => {
    const out = zoomViewBox(base, base, 0.2, 50, 50, 1, 8);
    expect(out.w).toBeLessThanOrEqual(base.w + 1e-9);
    expect(out).toEqual(base);
  });
  it('respects the maximum zoom', () => {
    let vb = base;
    for (let i = 0; i < 40; i++) vb = zoomViewBox(vb, base, 2, 50, 50, 1, 8);
    expect(vb.w).toBeCloseTo(base.w / 8, 6);
  });
  it('keeps the view inside the base bounds after zooming at a corner', () => {
    const vb = zoomViewBox(base, base, 4, 0, 0, 1, 8);
    expect(vb.x).toBeGreaterThanOrEqual(base.x - 1e-9);
    expect(vb.y).toBeGreaterThanOrEqual(base.y - 1e-9);
    expect(vb.x + vb.w).toBeLessThanOrEqual(base.x + base.w + 1e-9);
    expect(vb.y + vb.h).toBeLessThanOrEqual(base.y + base.h + 1e-9);
  });
  it('holds the focus point steady while zooming in the middle', () => {
    const vb = zoomViewBox(base, base, 2, 50, 50, 1, 8);
    expect(vb.x + vb.w / 2).toBeCloseTo(50, 6);
    expect(vb.y + vb.h / 2).toBeCloseTo(50, 6);
  });
  it('clamps a panned view back inside the base', () => {
    const out = clampViewBox({ x: -50, y: 200, w: 50, h: 50 }, base);
    expect(out.x).toBe(0);
    expect(out.y).toBe(50);
  });
  it('never produces NaN dimensions', () => {
    const vb = zoomViewBox(base, base, 1.4, 25, 75, 1, 8);
    for (const v of [vb.x, vb.y, vb.w, vb.h]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('sparklinePath', () => {
  it('starts with a move command and stays within the box', () => {
    const d = sparklinePath([1, 5, 3, 9, 2], 74, 20);
    expect(d.startsWith('M')).toBe(true);
    const coords = d.match(/-?\d+\.?\d*/g)!.map(Number);
    for (let i = 0; i < coords.length; i += 2) {
      expect(coords[i]).toBeGreaterThanOrEqual(0);
      expect(coords[i]).toBeLessThanOrEqual(74);
      expect(coords[i + 1]).toBeGreaterThanOrEqual(0);
      expect(coords[i + 1]).toBeLessThanOrEqual(20);
    }
  });
  it('emits one point per value', () => {
    const d = sparklinePath([1, 2, 3, 4], 100, 20);
    expect(d.split(/[ML]/).filter(Boolean)).toHaveLength(4);
  });
  it('returns empty (not a broken path) for too few points', () => {
    expect(sparklinePath([], 74, 20)).toBe('');
    expect(sparklinePath([5], 74, 20)).toBe('');
  });
  it('does not produce NaN when every value is identical', () => {
    const d = sparklinePath([7, 7, 7], 74, 20);
    expect(d).not.toContain('NaN');
  });
});

describe('declutter (trend end-labels)', () => {
  it('separates colliding labels to at least minGap apart', () => {
    // NSW/QLD/VIC/TAS/SA converge within a few hundred dollars in 2023-24 and
    // stacked into one unreadable pile before this existed.
    const out = declutter(
      [
        { st: 'NSW', y: 100 },
        { st: 'QLD', y: 101 },
        { st: 'VIC', y: 102 },
        { st: 'TAS', y: 103 },
        { st: 'SA', y: 104 },
      ],
      11,
    );
    const ys = [...out.values()].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(11 - 1e-9);
  });

  it('preserves the vertical ordering of the lines', () => {
    const out = declutter(
      [
        { st: 'A', y: 100 },
        { st: 'B', y: 102 },
        { st: 'C', y: 104 },
      ],
      20,
    );
    expect(out.get('A')!).toBeLessThan(out.get('B')!);
    expect(out.get('B')!).toBeLessThan(out.get('C')!);
  });

  it('leaves well-separated labels untouched', () => {
    const out = declutter(
      [
        { st: 'ACT', y: 10 },
        { st: 'NT', y: 60 },
      ],
      11,
    );
    expect(out.get('ACT')).toBe(10);
    expect(out.get('NT')).toBe(60);
  });

  it('keeps the decluttered stack centred near the original group', () => {
    const before = [
      { st: 'A', y: 100 },
      { st: 'B', y: 101 },
      { st: 'C', y: 102 },
    ];
    const mean0 = before.reduce((s, p) => s + p.y, 0) / before.length;
    const out = declutter(before.map((p) => ({ ...p })), 11);
    const mean1 = [...out.values()].reduce((s, y) => s + y, 0) / out.size;
    expect(Math.abs(mean1 - mean0)).toBeLessThan(11);
  });

  it('handles empty and single-label input', () => {
    expect(declutter([], 11).size).toBe(0);
    expect(declutter([{ st: 'X', y: 5 }], 11).get('X')).toBe(5);
  });

  it('never emits NaN', () => {
    for (const y of declutter([{ st: 'A', y: 1 }, { st: 'B', y: 1 }], 11).values()) {
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});
