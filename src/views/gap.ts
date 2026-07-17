import { escapeHtml, formatMoney, formatMoneyShort, formatNumber, formatRatio } from '../format';
import { gloss } from '../glossary';
import { stateColour, STATES } from '../metrics';
import type { Dataset, Postcode } from '../types';
import { attachSvgZoom } from '../utils/svgZoom';
import { logScale, logTicks } from '../utils/svg';
import type { ViewContext } from './types';

/**
 * The signature view: median (x) vs average (y), log-log, with the y=x line.
 *
 * Question it answers: is this postcode well-off across the board, or does it
 * just contain a few very rich people? Nothing else in the site separates
 * Toorak (median $83k, average $278k) from Fortescue (median $143k, average
 * $128k) — on a plain income ranking they look like the same kind of place.
 */
export function renderGap(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const minN = Number(ctx.getState('gapMinN', '1000'));
  const stateFilter = ctx.getState('gapState', 'ALL');

  const pool = data.postcodes.filter(
    (p) => p.n >= minN && p.gap !== null && (stateFilter === 'ALL' || p.st === stateFilter),
  );

  root.innerHTML = `
    <div class="view-head">
      <h2>The gap: average vs median</h2>
      <p>
        Each dot is a postcode. Its position left-to-right is what the
        ${gloss('median', 'middle earner')} makes; up-and-down is the
        ${gloss('average')}. The diagonal is where the two are equal. The further a postcode
        floats <strong>above</strong> the line, the more its average is being lifted by a small number of
        very large incomes — and the less that "average income" describes anyone who actually lives there.
      </p>
    </div>
    <div class="view-controls">
      <label class="control">State
        <select id="gap-state">
          <option value="ALL"${stateFilter === 'ALL' ? ' selected' : ''}>All of Australia</option>
          ${STATES.map((s) => `<option value="${s}"${stateFilter === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <label class="control">Minimum taxpayers
        <select id="gap-minn">
          ${[0, 500, 1000, 5000]
            .map((v) => `<option value="${v}"${minN === v ? ' selected' : ''}>${v === 0 ? 'No minimum' : formatNumber(v)}</option>`)
            .join('')}
        </select>
      </label>
      <span style="font-size:var(--font-size-sm);color:var(--text-tertiary)">
        Scroll to zoom · drag to pan · double-click to reset · click a dot to open it
      </span>
    </div>
    <div class="chart-wrap" id="gap-wrap"></div>
    <div class="legend" id="gap-legend"></div>
    <div class="insight-grid" style="margin-top:var(--space-lg)" id="gap-callouts"></div>
  `;

  root.querySelector('#gap-state')?.addEventListener('change', (e) => {
    ctx.setState('gapState', (e.target as HTMLSelectElement).value);
    renderGap(root, data, ctx);
  });
  root.querySelector('#gap-minn')?.addEventListener('change', (e) => {
    ctx.setState('gapMinN', (e.target as HTMLSelectElement).value);
    renderGap(root, data, ctx);
  });

  const wrap = root.querySelector('#gap-wrap') as HTMLElement;
  if (!pool.length) {
    wrap.innerHTML = '<div class="empty-state">No postcodes match these filters.</div>';
    return;
  }

  const W = 960;
  const H = 560;
  const padL = 62;
  const padR = 16;
  const padT = 14;
  const padB = 48;

  const medVals = pool.map((p) => p.med);
  const avgVals = pool.map((p) => p.avg);
  // Log-log: incomes span ~$20k to ~$320k and cluster hard at the low end, so a
  // linear axis would squash 90% of the country into the bottom-left corner.
  const loX = Math.min(...medVals) * 0.9;
  const hiX = Math.max(...medVals) * 1.1;
  const loY = Math.min(...avgVals) * 0.9;
  const hiY = Math.max(...avgVals) * 1.1;
  const lo = Math.min(loX, loY);
  const hi = Math.max(hiX, hiY);

  const x = logScale(lo, hi, padL, W - padR);
  const y = logScale(lo, hi, H - padB, padT);

  const ticks = logTicks(lo, hi);

  const dots = pool
    .slice()
    // Draw the biggest gaps last so they sit on top of the cloud.
    .sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))
    .map((p) => {
      const r = Math.max(2.2, Math.min(9, Math.sqrt(p.n) / 26));
      return `<circle class="dot" data-pc="${p.pc}"
        cx="${x(p.med).toFixed(1)}" cy="${y(p.avg).toFixed(1)}" r="${r.toFixed(1)}"
        fill="${stateColour(p.st)}" fill-opacity="0.62" stroke="${stateColour(p.st)}" stroke-width="0.7"
        data-tip="${escapeHtml(p.name)} ${p.pc} (${p.st})&#10;Median ${formatMoney(p.med)}&#10;Average ${formatMoney(
          p.avg,
        )}&#10;Gap ${formatRatio(p.gap)}&#10;${formatNumber(p.n)} taxpayers"
        aria-label="${escapeHtml(p.name)}: median ${formatMoney(p.med)}, average ${formatMoney(p.avg)}" />`;
    })
    .join('');

  // Reference lines at 1x (equal), 2x and 3x the median.
  const refLine = (mult: number, label: string, dash: string) => {
    const x1 = lo;
    const y1 = lo * mult;
    const x2 = hi / mult;
    const y2 = hi;
    if (y1 > hi || x2 < lo) return '';
    return `
      <line x1="${x(x1).toFixed(1)}" y1="${y(y1).toFixed(1)}" x2="${x(x2).toFixed(1)}" y2="${y(y2).toFixed(1)}"
        stroke="${mult === 1 ? 'var(--text-tertiary)' : 'var(--border-strong)'}" stroke-width="${mult === 1 ? 1.6 : 1}"
        stroke-dasharray="${dash}" />
      <text class="tick-label" x="${(x(x2) - 4).toFixed(1)}" y="${(y(y2) + 12).toFixed(1)}" text-anchor="end"
        style="font-weight:600">${label}</text>`;
  };

  wrap.innerHTML = `
    <svg class="chart" id="gap-svg" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Scatter plot of median versus average taxable income for ${formatNumber(pool.length)} postcodes">
      ${ticks
        .map(
          (t) => `
        <line class="grid-line" x1="${x(t).toFixed(1)}" y1="${padT}" x2="${x(t).toFixed(1)}" y2="${H - padB}" />
        <line class="grid-line" x1="${padL}" y1="${y(t).toFixed(1)}" x2="${W - padR}" y2="${y(t).toFixed(1)}" />
        <text class="tick-label" x="${x(t).toFixed(1)}" y="${H - padB + 14}" text-anchor="middle">${formatMoneyShort(t)}</text>
        <text class="tick-label" x="${padL - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${formatMoneyShort(t)}</text>`,
        )
        .join('')}
      ${refLine(3, '3× median', '2 4')}
      ${refLine(2, '2× median', '4 4')}
      ${refLine(1, 'average = median', '6 4')}
      ${dots}
      <line class="axis-line" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" />
      <line class="axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" />
      <text class="axis-title" x="${(W + padL) / 2}" y="${H - 8}" text-anchor="middle">Median taxable income →</text>
      <text class="axis-title" x="${-(H - padB + padT) / 2}" y="14" transform="rotate(-90)" text-anchor="middle">
        Average taxable income →
      </text>
    </svg>
  `;

  const svg = wrap.querySelector('#gap-svg') as SVGSVGElement;
  const zoom = attachSvgZoom(svg, { maxScale: 14 });
  ctx.onTeardown(() => zoom.destroy());

  svg.addEventListener('click', (e) => {
    const dot = (e.target as Element).closest('[data-pc]');
    if (dot) ctx.openPostcode(dot.getAttribute('data-pc') as string);
  });

  const legend = root.querySelector('#gap-legend') as HTMLElement;
  legend.innerHTML = `
    ${STATES.map(
      (s) => `<span class="legend-item"><span class="legend-swatch" style="background:${stateColour(s)}"></span>${s}</span>`,
    ).join('')}
    <span class="legend-item" style="color:var(--text-tertiary)">Dot size = number of taxpayers</span>
  `;

  renderCallouts(root.querySelector('#gap-callouts') as HTMLElement, pool, ctx);
}

function renderCallouts(host: HTMLElement, pool: Postcode[], ctx: ViewContext): void {
  const withGap = pool.filter((p) => p.gap !== null);
  const widest = withGap.slice().sort((a, b) => (b.gap as number) - (a.gap as number))[0];
  const evenest = withGap.slice().sort((a, b) => (a.gap as number) - (b.gap as number))[0];
  if (!widest || !evenest) return;

  const card = (p: Postcode, title: string, body: string, cls: string) => `
    <div class="insight ${cls}">
      <h3>${title}</h3>
      <p>${body}</p>
      <div class="insight-refs">
        <button class="ref-chip" data-pc="${p.pc}">${p.pc} ${escapeHtml(p.name)} →</button>
      </div>
    </div>`;

  host.innerHTML =
    card(
      widest,
      `Widest gap: ${escapeHtml(widest.name)}`,
      `The average income is <strong>${formatRatio(widest.gap)}</strong> the median. Half of ${escapeHtml(
        widest.name,
      )} earns under ${formatMoney(widest.med)}, while the average reads ${formatMoney(
        widest.avg,
      )} — the arithmetic of a few very large incomes, not a prosperous middle.`,
      'extreme',
    ) +
    card(
      evenest,
      `Most even: ${escapeHtml(evenest.name)}`,
      `Here the average (${formatMoney(evenest.avg)}) sits at just ${formatRatio(
        evenest.gap,
      )} the median (${formatMoney(evenest.med)}). Incomes are tightly clustered — almost everyone earns
      something close to everyone else, so the average is an honest description of the place.`,
      'info',
    );

  host.querySelectorAll('.ref-chip').forEach((b) =>
    b.addEventListener('click', () => ctx.openPostcode(b.getAttribute('data-pc') as string)),
  );
}
