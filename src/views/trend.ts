// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { median } from '../analysis';
import { escapeHtml, formatMoney, formatMoneyShort, formatPercent, formatYear } from '../format';
import { gloss } from '../glossary';
import { stateColour, STATES } from '../metrics';
import type { Dataset, Postcode } from '../types';
import { linearScale, niceTicks } from '../utils/svg';
import type { ViewContext } from './types';

/**
 * Twenty years of median income by state.
 *
 * Question it answers: has your part of the country kept up? Note the 2003-04 →
 * 2013-14 jump: the ATO publishes those two points and then every year after, so
 * the axis is drawn to scale with the gap visible rather than pretending the
 * points are evenly spaced.
 */
export function renderTrend(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const measure = ctx.getState('trendMeasure', 'med');

  const years = data.meta.years;
  const byState = new Map<string, Array<{ year: string; v: number | null }>>();
  for (const st of STATES) {
    const pcs = data.postcodes.filter((p) => p.st === st);
    byState.set(
      st,
      years.map((y) => ({ year: y, v: medianForYear(pcs, y, measure) })),
    );
  }
  const national = years.map((y) => ({ year: y, v: medianForYear(data.postcodes, y, measure) }));

  root.innerHTML = `
    <div class="view-head">
      <h2>Twenty years of income</h2>
      <p>
        The ${gloss('median')} of every postcode's ${measure === 'med' ? 'median' : 'average'}
        ${gloss('taxable income')}, by state, from ${formatYear(years[0])} to ${formatYear(years[years.length - 1])}.
        These are nominal dollars — not adjusted for inflation — so the rise overstates how much better off
        people actually are. Hover any point for its figures.
      </p>
    </div>
    <div class="view-controls">
      <div class="seg" role="group" aria-label="Measure">
        <button data-measure="med" aria-pressed="${measure === 'med'}">Median income</button>
        <button data-measure="avg" aria-pressed="${measure === 'avg'}">Average income</button>
      </div>
    </div>
    <div class="chart-wrap" id="tr-wrap"></div>
    <div class="legend" id="tr-legend"></div>
    <div class="stat-row" style="margin-top:var(--space-lg)" id="tr-stats"></div>
  `;

  root.querySelectorAll('[data-measure]').forEach((b) =>
    b.addEventListener('click', () => {
      ctx.setState('trendMeasure', b.getAttribute('data-measure') as string);
      renderTrend(root, data, ctx);
    }),
  );

  const W = 960;
  const H = 420;
  const padL = 60;
  const padR = 58;
  const padT = 16;
  const padB = 42;

  // Position points by their real year so the 2004 -> 2014 gap reads honestly.
  const yearNum = (y: string) => Number(y.slice(0, 4));
  const xs = years.map(yearNum);
  const x = linearScale(Math.min(...xs), Math.max(...xs), padL, W - padR);

  const allVals = [...byState.values()].flat().map((d) => d.v).filter((v): v is number => v !== null);
  const hi = Math.max(...allVals) * 1.06;
  const y = linearScale(0, hi, H - padB, padT);
  const ticks = niceTicks(0, hi, 6);

  const line = (pts: Array<{ year: string; v: number | null }>) =>
    pts
      .filter((p) => p.v !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(yearNum(p.year)).toFixed(1)},${y(p.v as number).toFixed(1)}`)
      .join(' ');

  // End-of-line labels collide when states converge (NSW/QLD/VIC/TAS/SA all sit
  // within a few hundred dollars in 2023-24, which stacked five labels into an
  // unreadable pile). Nudge them apart vertically, preserving their order.
  const labelPts = STATES.map((st) => {
    const last = [...(byState.get(st) ?? [])].reverse().find((p) => p.v !== null);
    return last ? { st, y: y(last.v as number) } : null;
  }).filter((v): v is { st: string; y: number } => v !== null);
  const labelY = declutter(labelPts, 11);

  const stateLines = STATES.map((st) => {
    const pts = byState.get(st) ?? [];
    const last = [...pts].reverse().find((p) => p.v !== null);
    const ly = labelY.get(st);
    const dots = pts
      .filter((p) => p.v !== null)
      .map(
        (p) => `<circle class="dot" cx="${x(yearNum(p.year)).toFixed(1)}" cy="${y(p.v as number).toFixed(1)}" r="3"
          fill="${stateColour(st)}"
          data-tip="${st} — ${formatYear(p.year)}&#10;${measure === 'med' ? 'Median' : 'Average'} ${formatMoney(p.v)}"
          aria-label="${st} ${formatYear(p.year)}: ${formatMoney(p.v)}" />`,
      )
      .join('');
    return `
      <g>
        <path d="${line(pts)}" fill="none" stroke="${stateColour(st)}" stroke-width="2" stroke-linejoin="round" />
        ${dots}
        ${
          last && ly !== undefined
            ? `${
                // Leader line when the label had to move off its data point.
                Math.abs(ly - y(last.v as number)) > 1.5
                  ? `<line x1="${W - padR + 1}" y1="${y(last.v as number).toFixed(1)}" x2="${W - padR + 4}" y2="${ly.toFixed(
                      1,
                    )}" stroke="${stateColour(st)}" stroke-width="1" opacity="0.5" />`
                  : ''
              }
              <text x="${W - padR + 5}" y="${(ly + 3.5).toFixed(1)}"
                style="font-size:11px;font-weight:600;fill:${stateColour(st)}">${st}</text>`
            : ''
        }
      </g>`;
  }).join('');

  (root.querySelector('#tr-wrap') as HTMLElement).innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Median taxable income by state, ${formatYear(years[0])} to ${formatYear(years[years.length - 1])}">
      ${ticks
        .map(
          (t) => `<line class="grid-line" x1="${padL}" y1="${y(t).toFixed(1)}" x2="${W - padR}" y2="${y(t).toFixed(1)}" />
            <text class="tick-label" x="${padL - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${formatMoneyShort(t)}</text>`,
        )
        .join('')}
      ${years
        .map(
          (yr) =>
            `<text class="tick-label" x="${x(yearNum(yr)).toFixed(1)}" y="${H - padB + 15}" text-anchor="middle">${yr.slice(
              2,
            )}</text>`,
        )
        .join('')}
      <path d="${line(national)}" fill="none" stroke="var(--text-primary)" stroke-width="2.5" stroke-dasharray="5 4" />
      ${stateLines}
      <line class="axis-line" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" />
      <line class="axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" />
      <text class="axis-title" x="${(W + padL) / 2}" y="${H - 4}" text-anchor="middle">Income year (ending)</text>
    </svg>
  `;

  (root.querySelector('#tr-legend') as HTMLElement).innerHTML = `
    ${STATES.map(
      (s) => `<span class="legend-item"><span class="legend-swatch" style="background:${stateColour(s)}"></span>${s}</span>`,
    ).join('')}
    <span class="legend-item"><span class="legend-swatch" style="background:var(--text-primary)"></span>Australia</span>
  `;

  // Growth callouts.
  const first = national[0];
  const last = national[national.length - 1];
  const growth = first.v && last.v ? last.v / first.v - 1 : null;
  const spanYears = yearNum(last.year) - yearNum(first.year);
  const fastest = STATES.map((st) => {
    const pts = byState.get(st) ?? [];
    const f = pts.find((p) => p.v !== null);
    const l = [...pts].reverse().find((p) => p.v !== null);
    return { st, g: f?.v && l?.v ? l.v / f.v - 1 : null };
  })
    .filter((r) => r.g !== null)
    .sort((a, b) => (b.g as number) - (a.g as number));

  (root.querySelector('#tr-stats') as HTMLElement).innerHTML = `
    <div class="stat">
      <div class="stat-label">National, ${formatYear(first.year)}</div>
      <div class="stat-value">${formatMoney(first.v)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">National, ${formatYear(last.year)}</div>
      <div class="stat-value money">${formatMoney(last.v)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Growth over ${spanYears} years</div>
      <div class="stat-value">${growth !== null ? `+${formatPercent(growth, 0)}` : '—'}</div>
      <div class="stat-note">nominal, before inflation</div>
    </div>
    <div class="stat">
      <div class="stat-label">Fastest growing state</div>
      <div class="stat-value">${fastest[0] ? escapeHtml(fastest[0].st) : '—'}</div>
      <div class="stat-note">${fastest[0] ? `+${formatPercent(fastest[0].g as number, 0)} since ${formatYear(first.year)}` : ''}</div>
    </div>
  `;
}

/**
 * Push overlapping labels apart so each keeps a `minGap` slot, preserving the
 * original vertical ordering. Single downward pass, then a corrective upward
 * pass so the whole stack stays centred on where the lines actually end.
 */
export function declutter(points: Array<{ st: string; y: number }>, minGap: number): Map<string, number> {
  const sorted = [...points].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    if (gap < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  // The downward pass can push the last label past where the group started;
  // pull the tail back up so the labels stay near their lines.
  for (let i = sorted.length - 2; i >= 0; i--) {
    const gap = sorted[i + 1].y - sorted[i].y;
    if (gap < minGap) sorted[i].y = sorted[i + 1].y - minGap;
  }
  return new Map(sorted.map((p) => [p.st, p.y]));
}

/**
 * Median across postcodes of their value for a given year. Weighting by taxpayer
 * count would give a population-weighted figure — but each postcode's published
 * number is already a median of its own residents, and the ATO doesn't publish
 * the underlying distribution, so a median-of-medians is the honest summary.
 */
function medianForYear(postcodes: Postcode[], year: string, measure: string): number | null {
  const idx = measure === 'med' ? 1 : 2;
  const vals: number[] = [];
  for (const p of postcodes) {
    const row = p.series.find((s) => s[0] === year);
    if (row && Number.isFinite(row[idx])) vals.push(row[idx] as number);
  }
  return median(vals);
}
