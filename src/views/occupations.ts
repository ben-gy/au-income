import { escapeHtml, formatMoney, formatNumber, formatPercent } from '../format';
import { gloss } from '../glossary';
import { OCCUPATION_LABELS, OCCUPATION_SHORT } from '../labels';
import { stateColour, STATES } from '../metrics';
import type { Dataset, Postcode } from '../types';
import type { ViewContext } from './types';

const ROWS = 40;

/**
 * Postcode × occupation heatmap.
 *
 * Question it answers: what kind of place is this? A postcode's occupation mix
 * is a fingerprint — mining towns run on Machinery Operators, harbour suburbs on
 * Managers, retiree coasts on "Not stated". A ranking of income can't show that.
 */
export function renderOccupations(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const sortBy = ctx.getState('occSort', 'med');
  const stateFilter = ctx.getState('occState', 'ALL');
  const minN = 2000;

  const pool = data.postcodes
    .filter((p) => p.n >= minN && p.occ && (stateFilter === 'ALL' || p.st === stateFilter))
    .map((p) => ({ p, shares: shares(p) }))
    .filter((r) => r.shares !== null) as Array<{ p: Postcode; shares: number[] }>;

  const sorted = pool.slice().sort((a, b) => {
    if (sortBy === 'med') return b.p.med - a.p.med;
    const i = Number(sortBy);
    return b.shares[i] - a.shares[i];
  });
  const top = sorted.slice(0, ROWS);

  root.innerHTML = `
    <div class="view-head">
      <h2>What people do</h2>
      <p>
        The ${gloss('anzsco', 'occupation mix')} of each postcode — the share of taxpayers in each major
        group. Read across a row to see a place's fingerprint: mining towns light up under Machinery
        Operators, harbour suburbs under Managers, retirement coasts under "Not stated". Click any
        column header to rank by that occupation, or a row to open the postcode.
      </p>
    </div>
    <div class="view-controls">
      <label class="control">Rank by
        <select id="oc-sort">
          <option value="med"${sortBy === 'med' ? ' selected' : ''}>Median income</option>
          ${OCCUPATION_LABELS.map(
            (l, i) => `<option value="${i}"${sortBy === String(i) ? ' selected' : ''}>Share: ${l}</option>`,
          ).join('')}
        </select>
      </label>
      <label class="control">State
        <select id="oc-state">
          <option value="ALL"${stateFilter === 'ALL' ? ' selected' : ''}>All</option>
          ${STATES.map((s) => `<option value="${s}"${stateFilter === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <span style="font-size:var(--font-size-sm);color:var(--text-tertiary)">
        Postcodes with ${formatNumber(minN)}+ taxpayers · darker = larger share
      </span>
    </div>
    <div class="matrix-scroll" id="oc-wrap"></div>
    <div class="legend">
      <span>Share of taxpayers:</span>
      <span class="legend-ramp">
        ${[0, 0.1, 0.2, 0.3, 0.45, 0.6]
          .map((v) => `<span class="legend-swatch" style="background:${cellColour(v)}" data-tip="${formatPercent(v, 0)}"></span>`)
          .join('')}
      </span>
      <span style="font-family:var(--font-mono)">0%</span>
      <span style="color:var(--text-muted)">→</span>
      <span style="font-family:var(--font-mono)">60%+</span>
    </div>
  `;

  root.querySelector('#oc-sort')?.addEventListener('change', (e) => {
    ctx.setState('occSort', (e.target as HTMLSelectElement).value);
    renderOccupations(root, data, ctx);
  });
  root.querySelector('#oc-state')?.addEventListener('change', (e) => {
    ctx.setState('occState', (e.target as HTMLSelectElement).value);
    renderOccupations(root, data, ctx);
  });

  const wrap = root.querySelector('#oc-wrap') as HTMLElement;
  if (!top.length) {
    wrap.innerHTML = '<div class="empty-state">No postcodes match these filters.</div>';
    return;
  }

  wrap.innerHTML = `
    <table class="matrix">
      <thead>
        <tr>
          <th style="min-width:180px">Postcode</th>
          <th class="numeric" style="text-align:right">Median</th>
          ${OCCUPATION_SHORT.map(
            (l, i) =>
              `<th data-col="${i}" style="cursor:pointer" title="Rank by ${OCCUPATION_LABELS[i]}"><span class="rot">${l}</span></th>`,
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${top
          .map(
            ({ p, shares: sh }) => `
          <tr>
            <th data-pc="${p.pc}" title="${escapeHtml(p.name)}">
              <span style="color:${stateColour(p.st)};font-family:var(--font-mono);font-size:0.7rem">${p.pc}</span>
              ${escapeHtml(truncate(p.name, 20))}
            </th>
            <td style="font-family:var(--font-mono);text-align:right;background:none;color:var(--text-secondary)">
              ${formatMoney(p.med)}
            </td>
            ${sh
              .map(
                (v, i) => `<td data-pc="${p.pc}" style="background:${cellColour(v)};color:${v > 0.33 ? '#fff' : 'var(--text-secondary)'}"
                  data-tip="${escapeHtml(p.name)} ${p.pc}&#10;${OCCUPATION_LABELS[i]}&#10;${formatPercent(v)} of taxpayers (${formatNumber(
                    p.occ?.[i] ?? 0,
                  )})"
                  aria-label="${escapeHtml(p.name)}, ${OCCUPATION_LABELS[i]}: ${formatPercent(v)}">${
                    v >= 0.005 ? Math.round(v * 100) : ''
                  }</td>`,
              )
              .join('')}
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('th[data-col]').forEach((th) =>
    th.addEventListener('click', () => {
      ctx.setState('occSort', th.getAttribute('data-col') as string);
      renderOccupations(root, data, ctx);
    }),
  );
  wrap.addEventListener('click', (e) => {
    const cell = (e.target as Element).closest('[data-pc]');
    if (cell) ctx.openPostcode(cell.getAttribute('data-pc') as string);
  });
}

function shares(p: Postcode): number[] | null {
  if (!p.occ) return null;
  const total = p.occ.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (!total) return null;
  return p.occ.map((v) => (v ?? 0) / total);
}

/** Sequential ramp keyed to share-of-taxpayers, saturating at 60%. */
function cellColour(v: number): string {
  const ramp = ['#f4f8fb', '#dbe9f4', '#b9d5e9', '#8fbcdb', '#5f9bc7', '#2f6f9f', '#123a5c'];
  const t = Math.min(1, Math.max(0, v / 0.6));
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
