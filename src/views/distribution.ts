import { histogram, median, quantile } from '../analysis';
import { escapeHtml, formatMoney, formatMoneyShort, formatNumber, formatPercent } from '../format';
import { gloss } from '../glossary';
import { INCOME_BAND_LABELS } from '../labels';
import type { Dataset, Postcode } from '../types';
import { linearScale, niceTicks } from '../utils/svg';
import type { ViewContext } from './types';

const BINS = 34;

/**
 * Distribution view — two questions in one place:
 *  1. How are postcode medians spread? (histogram, click a bar to list them)
 *  2. How are individuals spread across tax brackets? (national band composition)
 *
 * Together they show how unrepresentative the headline "average" really is.
 */
export function renderDistribution(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const field = ctx.getState('distField', 'med');
  const get = (p: Postcode) => (field === 'med' ? p.med : p.avg);

  const bins = histogram(data.postcodes, get, BINS);
  const values = data.postcodes.map(get);
  const med = median(values);
  const p90 = quantile(values, 0.9);
  const p10 = quantile(values, 0.1);

  root.innerHTML = `
    <div class="view-head">
      <h2>The shape of the country</h2>
      <p>
        How Australia's ${formatNumber(data.postcodes.length)} postcodes are spread across the income range —
        and, below, where individual taxpayers actually sit. Click any bar to list the postcodes inside it.
      </p>
    </div>
    <div class="view-controls">
      <div class="seg" role="group" aria-label="Measure">
        <button data-field="med" aria-pressed="${field === 'med'}">Median income</button>
        <button data-field="avg" aria-pressed="${field === 'avg'}">Average income</button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="stat-label">Typical postcode</div>
        <div class="stat-value money">${formatMoney(med)}</div>
        <div class="stat-note">the median of all postcode ${field === 'med' ? 'medians' : 'averages'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Bottom 10%</div>
        <div class="stat-value">${formatMoney(p10)}</div>
        <div class="stat-note">1 in 10 postcodes sits below this</div>
      </div>
      <div class="stat">
        <div class="stat-label">Top 10%</div>
        <div class="stat-value">${formatMoney(p90)}</div>
        <div class="stat-note">1 in 10 postcodes sits above this</div>
      </div>
      <div class="stat">
        <div class="stat-label">Full range</div>
        <div class="stat-value">${formatMoneyShort(Math.min(...values))}–${formatMoneyShort(Math.max(...values))}</div>
        <div class="stat-note">lowest to highest postcode</div>
      </div>
    </div>

    <div class="chart-wrap">
      <h3 style="font-size:var(--font-size-base);margin-bottom:2px">
        Distribution of postcode ${field === 'med' ? gloss('median', 'medians') : gloss('average', 'averages')}
      </h3>
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-md)">
        Each bar counts how many postcodes fall in that income range. Click a bar to see which.
      </p>
      <div id="dist-hist"></div>
    </div>

    <div id="dist-list"></div>

    <div class="chart-wrap" style="margin-top:var(--space-lg)">
      <h3 style="font-size:var(--font-size-base);margin-bottom:2px">Where taxpayers actually sit</h3>
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-md)">
        All ${formatNumber(data.meta.counts.individuals)} individuals, grouped by
        ${gloss('taxable income')} band. Most people are nowhere near the top brackets.
      </p>
      <div id="dist-bands"></div>
    </div>
  `;

  root.querySelectorAll('[data-field]').forEach((b) =>
    b.addEventListener('click', () => {
      ctx.setState('distField', b.getAttribute('data-field') as string);
      renderDistribution(root, data, ctx);
    }),
  );

  drawHistogram(root.querySelector('#dist-hist') as HTMLElement, bins, root.querySelector('#dist-list') as HTMLElement, ctx);
  drawBands(root.querySelector('#dist-bands') as HTMLElement, data);
}

function drawHistogram(
  host: HTMLElement,
  bins: ReturnType<typeof histogram>,
  list: HTMLElement,
  ctx: ViewContext,
): void {
  const W = 960;
  const H = 300;
  const padL = 48;
  const padR = 12;
  const padT = 10;
  const padB = 40;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const bw = (W - padL - padR) / bins.length;
  const y = linearScale(0, maxCount, H - padB, padT);
  const ticks = niceTicks(0, maxCount, 5);

  host.innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of postcode incomes">
      ${ticks
        .map(
          (t) => `<line class="grid-line" x1="${padL}" y1="${y(t).toFixed(1)}" x2="${W - padR}" y2="${y(t).toFixed(1)}" />
            <text class="tick-label" x="${padL - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${formatNumber(t)}</text>`,
        )
        .join('')}
      ${bins
        .map((b, i) => {
          const h = Math.max(0, H - padB - y(b.count));
          const x = padL + i * bw;
          return `<rect class="bar" data-bin="${i}" x="${x.toFixed(1)}" y="${y(b.count).toFixed(1)}"
            width="${Math.max(1, bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="var(--accent-primary)"
            data-tip="${formatMoney(b.lo)} – ${formatMoney(b.hi)}&#10;${formatNumber(b.count)} postcode${
              b.count === 1 ? '' : 's'
            }&#10;Click to list them"
            aria-label="${formatMoney(b.lo)} to ${formatMoney(b.hi)}: ${b.count} postcodes" />`;
        })
        .join('')}
      <line class="axis-line" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" />
      ${bins
        .filter((_, i) => i % 4 === 0)
        .map((b, j) => {
          const x = padL + j * 4 * bw;
          return `<text class="tick-label" x="${x.toFixed(1)}" y="${H - padB + 15}" text-anchor="middle">${formatMoneyShort(
            b.lo,
          )}</text>`;
        })
        .join('')}
      <text class="axis-title" x="${(W + padL) / 2}" y="${H - 4}" text-anchor="middle">Taxable income →</text>
      <text class="axis-title" x="${-(H - padB) / 2}" y="12" transform="rotate(-90)" text-anchor="middle">Postcodes</text>
    </svg>
  `;

  host.querySelector('svg')?.addEventListener('click', (e) => {
    const bar = (e.target as Element).closest('[data-bin]');
    if (!bar) return;
    const bin = bins[Number(bar.getAttribute('data-bin'))];
    if (!bin) return;
    showBin(list, bin, ctx);
  });
}

function showBin(list: HTMLElement, bin: ReturnType<typeof histogram>[number], ctx: ViewContext): void {
  const items = bin.items.slice().sort((a, b) => b.n - a.n);
  list.innerHTML = `
    <div class="panel" style="margin-top:var(--space-md)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-md);flex-wrap:wrap">
        <h3 style="font-size:var(--font-size-base)">
          ${formatNumber(bin.count)} postcode${bin.count === 1 ? '' : 's'} between
          ${formatMoney(bin.lo)} and ${formatMoney(bin.hi)}
        </h3>
        <button class="btn" id="bin-close">Clear</button>
      </div>
      <div class="insight-refs" style="margin-top:var(--space-md)">
        ${items
          .slice(0, 90)
          .map(
            (p) =>
              `<button class="ref-chip" data-pc="${p.pc}">${p.pc} ${escapeHtml(p.name)} · ${formatMoney(p.med)}</button>`,
          )
          .join('')}
        ${items.length > 90 ? `<span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">+${formatNumber(items.length - 90)} more</span>` : ''}
      </div>
    </div>`;
  list.querySelectorAll('.ref-chip').forEach((b) =>
    b.addEventListener('click', () => ctx.openPostcode(b.getAttribute('data-pc') as string)),
  );
  list.querySelector('#bin-close')?.addEventListener('click', () => (list.innerHTML = ''));
  list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * National income-band composition. Postcodes where the $120k+ split was
 * suppressed contribute only to the combined figure, so bands d/e are summed
 * from the postcodes that published them — stated plainly in the note.
 */
function drawBands(host: HTMLElement, data: Dataset): void {
  const totals = [0, 0, 0, 0, 0];
  let suppressed = 0;
  for (const p of data.postcodes) {
    if (!p.bands) continue;
    let anyNull = false;
    p.bands.forEach((v, i) => {
      if (v === null) anyNull = true;
      else totals[i] += v;
    });
    if (anyNull) suppressed++;
  }
  const sum = totals.reduce((a, b) => a + b, 0);
  const W = 960;
  const H = 74;
  let x = 0;
  const colours = ['#c7ddef', '#9cc3e0', '#3f7fb4', '#245e91', '#123a5c'];

  const segs = totals
    .map((v, i) => {
      const w = (v / sum) * W;
      const seg = `<g class="bar" data-tip="${INCOME_BAND_LABELS[i]}&#10;${formatNumber(v)} taxpayers&#10;${formatPercent(
        v / sum,
      )} of all returns" aria-label="${INCOME_BAND_LABELS[i]}: ${formatPercent(v / sum)}">
        <rect x="${x.toFixed(1)}" y="0" width="${Math.max(0, w - 1).toFixed(1)}" height="34" fill="${colours[i]}" rx="2" />
        ${
          w > 58
            ? `<text x="${(x + w / 2).toFixed(1)}" y="22" text-anchor="middle"
                style="font-size:11px;font-weight:600;fill:${i >= 3 ? '#fff' : 'var(--text-primary)'}">${formatPercent(v / sum, 0)}</text>`
            : ''
        }
        ${
          w > 78
            ? `<text x="${(x + w / 2).toFixed(1)}" y="50" text-anchor="middle" style="font-size:10px;fill:var(--text-secondary)">${
                INCOME_BAND_LABELS[i]
              }</text>`
            : ''
        }
      </g>`;
      x += w;
      return seg;
    })
    .join('');

  host.innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of taxpayers by income band">${segs}</svg>
    <div class="legend">
      ${INCOME_BAND_LABELS.map(
        (l, i) => `<span class="legend-item"><span class="legend-swatch" style="background:${colours[i]}"></span>${l}</span>`,
      ).join('')}
    </div>
    ${
      suppressed
        ? `<p style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:var(--space-sm)">
            ${formatNumber(suppressed)} postcodes had at least one band ${gloss('suppressed', 'suppressed for privacy')}
            and contribute only to the bands they published.
          </p>`
        : ''
    }
  `;
}
