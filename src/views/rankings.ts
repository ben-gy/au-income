import { escapeHtml, formatMoney, formatNumber } from '../format';
import { getMetric, METRICS, stateColour, STATES } from '../metrics';
import type { Dataset } from '../types';
import type { ViewContext } from './types';

const TOP_N = 25;

/** Ranked leaderboard: who is top (or bottom) on any metric. */
export function renderRankings(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const metric = getMetric(ctx.getState('rankMetric', 'med'));
  const dir = ctx.getState('rankDir', 'desc');
  const minN = Number(ctx.getState('rankMinN', '1000'));
  const stateFilter = ctx.getState('rankState', 'ALL');

  const pool = data.postcodes
    .filter((p) => p.n >= minN && (stateFilter === 'ALL' || p.st === stateFilter))
    .filter((p) => metric.get(p) !== null)
    .sort((a, b) => {
      const av = metric.get(a) as number;
      const bv = metric.get(b) as number;
      return dir === 'desc' ? bv - av : av - bv;
    });

  const top = pool.slice(0, TOP_N);

  root.innerHTML = `
    <div class="view-head">
      <h2>Rankings</h2>
      <p>
        The ${dir === 'desc' ? 'highest' : 'lowest'} postcodes by ${escapeHtml(metric.label.toLowerCase())}.
        ${escapeHtml(metric.blurb)}
      </p>
    </div>
    <div class="view-controls">
      <label class="control">Rank by
        <select id="rk-metric">
          ${METRICS.map((m) => `<option value="${m.key}"${m.key === metric.key ? ' selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </label>
      <div class="seg" role="group" aria-label="Sort direction">
        <button data-dir="desc" aria-pressed="${dir === 'desc'}">Highest</button>
        <button data-dir="asc" aria-pressed="${dir === 'asc'}">Lowest</button>
      </div>
      <label class="control">State
        <select id="rk-state">
          <option value="ALL"${stateFilter === 'ALL' ? ' selected' : ''}>All of Australia</option>
          ${STATES.map((s) => `<option value="${s}"${stateFilter === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <label class="control">Minimum taxpayers
        <select id="rk-minn">
          ${[0, 500, 1000, 5000]
            .map((v) => `<option value="${v}"${minN === v ? ' selected' : ''}>${v === 0 ? 'No minimum' : formatNumber(v)}</option>`)
            .join('')}
        </select>
      </label>
    </div>
    <div class="chart-wrap" id="rk-wrap"></div>
    <div class="legend">
      ${STATES.map(
        (s) => `<span class="legend-item"><span class="legend-swatch" style="background:${stateColour(s)}"></span>${s}</span>`,
      ).join('')}
    </div>
  `;

  root.querySelector('#rk-metric')?.addEventListener('change', (e) => {
    ctx.setState('rankMetric', (e.target as HTMLSelectElement).value);
    renderRankings(root, data, ctx);
  });
  root.querySelector('#rk-state')?.addEventListener('change', (e) => {
    ctx.setState('rankState', (e.target as HTMLSelectElement).value);
    renderRankings(root, data, ctx);
  });
  root.querySelector('#rk-minn')?.addEventListener('change', (e) => {
    ctx.setState('rankMinN', (e.target as HTMLSelectElement).value);
    renderRankings(root, data, ctx);
  });
  root.querySelectorAll('[data-dir]').forEach((b) =>
    b.addEventListener('click', () => {
      ctx.setState('rankDir', b.getAttribute('data-dir') as string);
      renderRankings(root, data, ctx);
    }),
  );

  const wrap = root.querySelector('#rk-wrap') as HTMLElement;
  if (!top.length) {
    wrap.innerHTML = '<div class="empty-state">No postcodes match these filters.</div>';
    return;
  }

  const rowH = 26;
  const padL = 210;
  const padR = 92;
  const padT = 6;
  const W = 960;
  const H = padT + top.length * rowH + 8;
  const max = Math.max(...top.map((p) => metric.get(p) as number));

  const bars = top
    .map((p, i) => {
      const v = metric.get(p) as number;
      const w = Math.max(1, (v / max) * (W - padL - padR));
      const yy = padT + i * rowH;
      return `
        <g class="bar" data-pc="${p.pc}"
          data-tip="${escapeHtml(p.name)} ${p.pc} (${p.st})&#10;${metric.short}: ${metric.format(v)}&#10;Median ${formatMoney(
            p.med,
          )} · Average ${formatMoney(p.avg)}&#10;${formatNumber(p.n)} taxpayers"
          aria-label="${i + 1}. ${escapeHtml(p.name)}: ${metric.format(v)}">
          <text x="${padL - 8}" y="${yy + 15}" text-anchor="end" style="font-size:11px;fill:var(--text-primary)">
            ${i + 1}. ${escapeHtml(truncate(p.name, 22))}
          </text>
          <text x="${padL - 8}" y="${yy + 15}" text-anchor="end" style="font-size:11px;fill:transparent">x</text>
          <rect x="${padL}" y="${yy + 4}" width="${w.toFixed(1)}" height="${rowH - 9}" rx="2" fill="${stateColour(p.st)}" />
          <text x="${(padL + w + 6).toFixed(1)}" y="${yy + 15}" style="font-size:11px;font-family:var(--font-mono);fill:var(--text-secondary)">
            ${metric.format(v)}
          </text>
        </g>`;
    })
    .join('');

  wrap.innerHTML = `
    <div class="chart-scroll">
      <svg class="chart" id="rk-svg" viewBox="0 0 ${W} ${H}" style="min-width:640px" role="img"
        aria-label="Top ${top.length} postcodes by ${escapeHtml(metric.label)}">
        ${bars}
      </svg>
    </div>
  `;

  wrap.querySelector('#rk-svg')?.addEventListener('click', (e) => {
    const g = (e.target as Element).closest('[data-pc]');
    if (g) ctx.openPostcode(g.getAttribute('data-pc') as string);
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
