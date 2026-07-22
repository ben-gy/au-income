// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Small SVG helpers shared by the hand-rolled charts. */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Linear scale factory. Returns a function mapping domain -> range. */
export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (!Number.isFinite(span) || span === 0) return () => r0;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/**
 * Log scale for income axes. Income spans two orders of magnitude and clusters
 * at the low end, so a linear axis wastes most of the canvas.
 */
export function logScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const l0 = Math.log10(Math.max(1, d0));
  const l1 = Math.log10(Math.max(1, d1));
  const span = l1 - l0;
  if (!Number.isFinite(span) || span === 0) return () => r0;
  return (v: number) => r0 + ((Math.log10(Math.max(1, v)) - l0) / span) * (r1 - r0);
}

/** "Nice" round tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [lo];
  const span = hi - lo;
  const step0 = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  // Round the step UP to the next nice number (1, 2, 5, 10 × magnitude).
  // Comparing with >= picked the step above the one wanted — an ideal step of
  // exactly 2 became 5, so a 0–100 axis ticked 0/50/100 instead of every 20.
  const step = (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Log-axis ticks at 1/2/5 × powers of ten within the domain. */
export function logTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  const start = Math.floor(Math.log10(Math.max(1, lo)));
  const end = Math.ceil(Math.log10(Math.max(10, hi)));
  for (let e = start; e <= end; e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= lo && v <= hi) ticks.push(v);
    }
  }
  return ticks;
}

/** Inline sparkline path for a series of values. */
export function sparklinePath(values: number[], w: number, h: number, pad = 1): string {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return '';
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  const x = linearScale(0, clean.length - 1, pad, w - pad);
  const y = linearScale(lo, hi === lo ? lo + 1 : hi, h - pad, pad);
  return clean.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
}
