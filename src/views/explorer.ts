import { sparkline } from '../components/drilldown';
import { escapeHtml, formatMoney, formatNumber, formatPercent, formatRatio } from '../format';
import { stateColour, STATES } from '../metrics';
import type { Dataset, Postcode } from '../types';
import type { ViewContext } from './types';

interface Column {
  key: string;
  label: string;
  numeric: boolean;
  get: (p: Postcode) => number | string | null;
  render: (p: Postcode) => string;
}

const COLUMNS: Column[] = [
  {
    key: 'pc',
    label: 'Postcode',
    numeric: false,
    get: (p) => p.pc,
    render: (p) => `<span class="pc-cell">${escapeHtml(p.pc)}</span>`,
  },
  {
    key: 'name',
    label: 'Suburb',
    numeric: false,
    get: (p) => p.name,
    render: (p) => `<span class="name-cell" title="${escapeHtml(p.locs.join(', '))}">${escapeHtml(p.name)}</span>`,
  },
  {
    key: 'st',
    label: 'State',
    numeric: false,
    get: (p) => p.st,
    render: (p) => `<span class="state-pill" style="background:${stateColour(p.st)}">${escapeHtml(p.st)}</span>`,
  },
  { key: 'n', label: 'Taxpayers', numeric: true, get: (p) => p.n, render: (p) => formatNumber(p.n) },
  { key: 'med', label: 'Median', numeric: true, get: (p) => p.med, render: (p) => formatMoney(p.med) },
  { key: 'avg', label: 'Average', numeric: true, get: (p) => p.avg, render: (p) => formatMoney(p.avg) },
  { key: 'gap', label: 'Gap', numeric: true, get: (p) => p.gap, render: (p) => formatRatio(p.gap) },
  {
    key: 'trend',
    label: '20-yr median',
    numeric: false,
    get: (p) => p.med,
    render: (p) =>
      sparkline(p.series.map((s) => s[1])) +
      `<span class="sr-only" style="position:absolute;left:-9999px">${p.series.map((s) => s[1]).join(', ')}</span>`,
  },
  { key: 'taxRate', label: 'Tax rate', numeric: true, get: (p) => p.taxRate, render: (p) => formatPercent(p.taxRate) },
  {
    key: 'negGearRate',
    label: 'Neg. geared',
    numeric: true,
    get: (p) => p.negGearRate,
    render: (p) => formatPercent(p.negGearRate),
  },
  { key: 'helpRate', label: 'HELP debt', numeric: true, get: (p) => p.helpRate, render: (p) => formatPercent(p.helpRate) },
];

/** Searchable, sortable table of every postcode. */
export function renderExplorer(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const sortKey = ctx.getState('expSort', 'med');
  const sortDir = ctx.getState('expDir', 'desc');
  const stateFilter = ctx.getState('expState', 'ALL');
  let query = ctx.getState('expQuery', '');

  root.innerHTML = `
    <div class="view-head">
      <h2>Explorer</h2>
      <p>Every postcode with published figures. Search for a suburb or postcode, sort by any column, click a row for the full picture.</p>
    </div>
    <div class="view-controls">
      <input class="search-input" id="exp-q" type="search" placeholder="Filter by suburb or postcode…"
        value="${escapeHtml(query)}" aria-label="Filter table"
        style="background:var(--bg-panel);color:var(--text-primary);border-color:var(--border-default);width:min(280px,60vw)" />
      <label class="control">State
        <select id="exp-state">
          <option value="ALL"${stateFilter === 'ALL' ? ' selected' : ''}>All</option>
          ${STATES.map((s) => `<option value="${s}"${stateFilter === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <span id="exp-count" style="font-size:var(--font-size-sm);color:var(--text-tertiary)"></span>
    </div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr>${COLUMNS.map(
          (c) => `<th data-key="${c.key}" class="${c.numeric ? 'numeric' : ''}"
            aria-sort="${sortKey === c.key ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}">
            ${c.label}${sortKey === c.key ? `<span class="sort-mark">${sortDir === 'desc' ? '▾' : '▴'}</span>` : ''}
          </th>`,
        ).join('')}</tr></thead>
        <tbody id="exp-body"></tbody>
      </table>
    </div>
  `;

  const body = root.querySelector('#exp-body') as HTMLElement;
  const count = root.querySelector('#exp-count') as HTMLElement;

  const draw = () => {
    const q = query.trim().toLowerCase();
    const rows = data.postcodes
      .filter((p) => stateFilter === 'ALL' || p.st === stateFilter)
      .filter((p) => {
        if (!q) return true;
        return (
          p.pc.startsWith(q) ||
          p.name.toLowerCase().includes(q) ||
          p.locs.some((l) => l.toLowerCase().includes(q)) ||
          p.sa4.toLowerCase().includes(q)
        );
      });

    const col = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[4];
    rows.sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : (av as number) - (bv as number);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    count.textContent = `${formatNumber(rows.length)} of ${formatNumber(data.postcodes.length)} postcodes`;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${COLUMNS.length}"><div class="empty-state">No postcode matches “${escapeHtml(
        query,
      )}”. Try a suburb name or a 4-digit postcode.</div></td></tr>`;
      return;
    }

    // Cap the DOM at 400 rows — the full 2,283 makes sorting janky, and the
    // count above always states the true total so nothing is silently hidden.
    const shown = rows.slice(0, 400);
    body.innerHTML = shown
      .map(
        (p) => `<tr data-pc="${p.pc}" tabindex="0">${COLUMNS.map(
          (c) => `<td class="${c.numeric ? 'numeric' : ''}">${c.render(p)}</td>`,
        ).join('')}</tr>`,
      )
      .join('');
    if (rows.length > shown.length) {
      body.insertAdjacentHTML(
        'beforeend',
        `<tr><td colspan="${COLUMNS.length}" style="text-align:center;color:var(--text-tertiary);font-size:var(--font-size-sm);padding:var(--space-md)">
          Showing the top ${formatNumber(shown.length)} of ${formatNumber(rows.length)} matches — refine your search or sort to see others.
        </td></tr>`,
      );
    }
  };

  draw();

  // Debounced search (300ms).
  let t: ReturnType<typeof setTimeout>;
  root.querySelector('#exp-q')?.addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value;
    clearTimeout(t);
    t = setTimeout(() => {
      ctx.setState('expQuery', query);
      draw();
    }, 300);
  });
  ctx.onTeardown(() => clearTimeout(t));

  root.querySelector('#exp-state')?.addEventListener('change', (e) => {
    ctx.setState('expState', (e.target as HTMLSelectElement).value);
    renderExplorer(root, data, ctx);
  });

  root.querySelectorAll('th[data-key]').forEach((th) =>
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key') as string;
      if (key === sortKey) ctx.setState('expDir', sortDir === 'desc' ? 'asc' : 'desc');
      else {
        ctx.setState('expSort', key);
        ctx.setState('expDir', 'desc');
      }
      renderExplorer(root, data, ctx);
    }),
  );

  body.addEventListener('click', (e) => {
    const tr = (e.target as Element).closest('tr[data-pc]');
    if (tr) ctx.openPostcode(tr.getAttribute('data-pc') as string);
  });
  body.addEventListener('keydown', (e) => {
    const tr = (e.target as Element).closest('tr[data-pc]');
    if (tr && (e as KeyboardEvent).key === 'Enter') ctx.openPostcode(tr.getAttribute('data-pc') as string);
  });
}
