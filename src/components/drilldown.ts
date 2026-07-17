import { rankOf } from '../analysis';
import { escapeHtml, formatMoney, formatMoneyShort, formatNumber, formatPercent, formatRatio, formatYear, ordinal } from '../format';
import { gloss } from '../glossary';
import { OCCUPATION_LABELS } from '../labels';
import { stateColour } from '../metrics';
import type { Dataset, Postcode } from '../types';
import { linearScale, sparklinePath } from '../utils/svg';

const BAND_LABELS = ['≤ $18,200', '$18,201–45,000', '$45,001–120,000', '$120,001–180,000', '$180,000+'];
const AGE_LABELS = ['Under 25', '25–34', '35–44', '45–54', '55–64', '65+'];

/**
 * Slide-in per-postcode detail panel. Hash-linkable via #pc=3142 so any postcode
 * can be shared directly.
 */
export function mountDrilldown(data: Dataset): { open: (pc: string) => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('aside');
  panel.className = 'drilldown';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Postcode detail');
  document.body.append(overlay, panel);

  const close = () => {
    overlay.classList.remove('open');
    panel.classList.remove('open');
    if (location.hash.startsWith('#pc=')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  };

  const open = (pc: string) => {
    const p = data.byPc.get(pc);
    if (!p) return;
    panel.innerHTML = render(p, data);
    panel.querySelector('.modal-close')?.addEventListener('click', close);
    overlay.classList.add('open');
    panel.classList.add('open');
    panel.scrollTop = 0;
    history.replaceState(null, '', `#pc=${pc}`);
    (panel.querySelector('.modal-close') as HTMLElement)?.focus();
  };

  overlay.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });

  return { open, close };
}

function render(p: Postcode, data: Dataset): string {
  const all = data.postcodes;
  const rMed = rankOf(all, p.pc, (x) => x.med);
  const rAvg = rankOf(all, p.pc, (x) => x.avg);
  const rGap = rankOf(all, p.pc, (x) => x.gap);
  const total = all.length;
  const natMed = data.meta.national.medianOfMedians;
  const vsNat = p.med / natMed - 1;

  const others = p.locs.filter((l) => l !== p.name);

  return `
    <button class="modal-close" aria-label="Close">×</button>
    <header class="dd-head">
      <div class="dd-pc">${escapeHtml(p.pc)} · <span style="color:${stateColour(p.st)};font-weight:700">${escapeHtml(p.st)}</span></div>
      <h2>${escapeHtml(p.name)}</h2>
      <div class="dd-sub">
        ${others.length ? `Also covers ${escapeHtml(others.slice(0, 5).join(', '))}${others.length > 5 ? ` +${others.length - 5} more` : ''}. ` : ''}
        ${p.sa4 ? `In the ${escapeHtml(p.sa4)} ${gloss('sa4', 'region')}. ` : ''}
        ${formatNumber(p.n)} taxpayers lodged a return.
      </div>
    </header>

    <section class="dd-section">
      <h3>${gloss('taxable income', 'Income')} — ${formatYear(data.meta.year)}</h3>
      <div class="dd-grid">
        <div class="dd-stat">
          <div class="k">${gloss('median')}</div>
          <div class="v" style="color:var(--accent-money)">${formatMoney(p.med)}</div>
          <div class="dd-rank">${rMed ? `${ordinal(rMed)} of ${formatNumber(total)}` : ''}</div>
        </div>
        <div class="dd-stat">
          <div class="k">${gloss('average')}</div>
          <div class="v">${formatMoney(p.avg)}</div>
          <div class="dd-rank">${rAvg ? `${ordinal(rAvg)} of ${formatNumber(total)}` : ''}</div>
        </div>
        <div class="dd-stat">
          <div class="k">${gloss('the gap')}</div>
          <div class="v">${formatRatio(p.gap)}</div>
          <div class="dd-rank">${rGap ? `${ordinal(rGap)} widest` : ''}</div>
        </div>
        <div class="dd-stat">
          <div class="k">vs national median</div>
          <div class="v" style="color:${vsNat >= 0 ? 'var(--status-good)' : 'var(--status-bad)'}">
            ${vsNat >= 0 ? '+' : ''}${formatPercent(vsNat, 0)}
          </div>
          <div class="dd-rank">national ${formatMoney(natMed)}</div>
        </div>
      </div>
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-sm)">
        ${gapSentence(p)}
      </p>
    </section>

    ${sectionHistory(p)}
    ${sectionBands(p)}
    ${sectionOccupations(p)}
    ${sectionAges(p)}
    ${sectionTax(p, data)}
  `;
}

function gapSentence(p: Postcode): string {
  if (p.gap === null) return '';
  if (p.gap >= 2) {
    return `Half of ${escapeHtml(p.name)} earns under ${formatMoney(p.med)}, but the average is ${formatMoney(
      p.avg,
    )} — ${formatRatio(p.gap)} higher. A small number of very large incomes are lifting that average well above what a typical resident earns.`;
  }
  if (p.gap <= 1.05) {
    return `The average (${formatMoney(p.avg)}) sits almost exactly on the median (${formatMoney(
      p.med,
    )}), so incomes here are unusually even — there is no long tail of very high earners.`;
  }
  return `The average (${formatMoney(p.avg)}) runs ${formatRatio(p.gap)} the median (${formatMoney(
    p.med,
  )}), close to the typical Australian postcode.`;
}

function sectionHistory(p: Postcode): string {
  if (p.series.length < 2) return '';
  const W = 460;
  const H = 130;
  const padL = 44;
  const padB = 22;
  const padT = 8;
  const meds = p.series.map((s) => s[1]);
  const avgs = p.series.map((s) => s[2]);
  const lo = 0;
  const hi = Math.max(...avgs, ...meds) * 1.08;
  const x = linearScale(0, p.series.length - 1, padL, W - 8);
  const y = linearScale(lo, hi, H - padB, padT);

  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const first = p.series[0];
  const last = p.series[p.series.length - 1];
  const growth = first[1] > 0 ? last[1] / first[1] - 1 : null;

  const dots = p.series
    .map(
      (s, i) => `
      <circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(s[1]).toFixed(1)}" r="3.5" fill="var(--accent-money)"
        data-tip="${formatYear(s[0])}&#10;Median ${formatMoney(s[1])}&#10;Average ${formatMoney(s[2])}"
        aria-label="${formatYear(s[0])}: median ${formatMoney(s[1])}, average ${formatMoney(s[2])}" />`,
    )
    .join('');

  return `
    <section class="dd-section">
      <h3>Twenty years of income</h3>
      <div class="chart-wrap">
        <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
          aria-label="Median and average taxable income for ${escapeHtml(p.name)} from ${formatYear(first[0])} to ${formatYear(last[0])}">
          <line class="axis-line" x1="${padL}" y1="${H - padB}" x2="${W - 8}" y2="${H - padB}" />
          ${[0, hi / 2, hi]
            .map(
              (v) =>
                `<line class="grid-line" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - 8}" y2="${y(v).toFixed(1)}" />
                 <text class="tick-label" x="${padL - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${formatMoneyShort(v)}</text>`,
            )
            .join('')}
          <path d="${line(avgs)}" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-dasharray="4 3" />
          <path d="${line(meds)}" fill="none" stroke="var(--accent-money)" stroke-width="2.5" />
          ${dots}
          <text class="tick-label" x="${padL}" y="${H - 6}">${formatYear(first[0])}</text>
          <text class="tick-label" x="${W - 8}" y="${H - 6}" text-anchor="end">${formatYear(last[0])}</text>
        </svg>
        <div class="legend">
          <span class="legend-item"><span class="legend-swatch" style="background:var(--accent-money)"></span>Median</span>
          <span class="legend-item"><span class="legend-swatch" style="background:var(--accent-primary)"></span>Average</span>
        </div>
      </div>
      ${
        growth !== null
          ? `<p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-sm)">
              The median has risen ${formatPercent(growth, 0)} since ${formatYear(first[0])}, before inflation.
            </p>`
          : ''
      }
    </section>`;
}

function barRows(
  items: Array<{ label: string; value: number | null; colour: string; tip?: string }>,
  totalOverride?: number,
): string {
  const vals = items.map((i) => i.value ?? 0);
  const max = Math.max(1, ...vals);
  const total = totalOverride ?? vals.reduce((a, b) => a + b, 0);
  return items
    .map((i) => {
      const v = i.value;
      const share = v !== null && total > 0 ? v / total : null;
      const w = v !== null ? (v / max) * 100 : 0;
      const tip = i.tip ?? `${i.label}&#10;${formatNumber(v)} taxpayers${share !== null ? ` (${formatPercent(share)})` : ''}`;
      return `
        <div class="bar-row" data-tip="${tip}">
          <span class="bl">${i.label}</span>
          <span class="bt"><span class="bf" style="width:${w.toFixed(1)}%;background:${i.colour}"></span></span>
          <span class="bv">${v === null ? '—' : formatPercent(share, 0)}</span>
        </div>`;
    })
    .join('');
}

function sectionBands(p: Postcode): string {
  if (!p.bands) return '';
  const total = p.n;
  const rows = p.bands.map((v, i) => ({
    label: BAND_LABELS[i],
    value: v,
    colour: ['#c7ddef', '#9cc3e0', '#3f7fb4', '#245e91', '#123a5c'][i],
  }));
  return `
    <section class="dd-section">
      <h3>How incomes are spread</h3>
      ${barRows(rows, total)}
      ${
        p.bandRolled
          ? `<p style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:var(--space-xs)">
              The $120k+ split is ${gloss('suppressed', 'suppressed')} here; only the combined total was published.
            </p>`
          : ''
      }
    </section>`;
}

function sectionOccupations(p: Postcode): string {
  if (!p.occ) return '';
  const total = p.occ.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (!total) return '';
  const rows = p.occ
    .map((v, i) => ({ label: OCCUPATION_LABELS[i], value: v, colour: 'var(--accent-secondary)', i }))
    .filter((r) => (r.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return `
    <section class="dd-section">
      <h3>${gloss('anzsco', 'What people do')}</h3>
      ${barRows(rows, total)}
    </section>`;
}

function sectionAges(p: Postcode): string {
  if (!p.ages) return '';
  const total = p.ages.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (!total) return '';
  const rows = p.ages.map((v, i) => ({ label: AGE_LABELS[i], value: v, colour: '#6b46c1' }));
  return `
    <section class="dd-section">
      <h3>Ages of taxpayers</h3>
      ${barRows(rows, total)}
    </section>`;
}

function sectionTax(p: Postcode, data: Dataset): string {
  const rNeg = rankOf(data.postcodes, p.pc, (x) => x.negGearRate);
  const stat = (k: string, v: string, note = '') =>
    `<div class="dd-stat"><div class="k">${k}</div><div class="v">${v}</div>${
      note ? `<div class="dd-rank">${note}</div>` : ''
    }</div>`;
  return `
    <section class="dd-section">
      <h3>Tax, property and debt</h3>
      <div class="dd-grid">
        ${stat(gloss('effective tax rate', 'Effective tax rate'), formatPercent(p.taxRate), `avg net tax ${formatMoney(p.netTaxAvg)}`)}
        ${stat(gloss('deduction', 'Average deduction'), formatMoney(p.dedAvg))}
        ${stat(
          gloss('negative gearing', 'Negatively geared'),
          formatPercent(p.negGearRate),
          `${rNeg ? `${ordinal(rNeg)} highest · ` : ''}avg loss ${formatMoney(p.negGearAvg)}`,
        )}
        ${stat('Own a rental', formatPercent(p.landlordRate), `${formatNumber(p.rentProfitN)} in profit, ${formatNumber(p.rentLossN)} at a loss`)}
        ${stat(gloss('help debt', 'Has HELP debt'), formatPercent(p.helpRate), `avg balance ${formatMoney(p.helpAvg)}`)}
        ${stat(gloss('capital gain', 'Made a capital gain'), formatPercent(p.cgRate), `avg ${formatMoney(p.cgAvg)}`)}
        ${stat('Claims donations', formatPercent(p.giftRate), `avg claim ${formatMoney(p.giftAvg)}`)}
        ${stat('Private health cover', formatPercent(p.phiRate))}
      </div>
    </section>`;
}

export function sparkline(values: number[], w = 74, h = 20, colour = 'var(--accent-money)'): string {
  const d = sparklinePath(values, w, h);
  if (!d) return '';
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${colour}" stroke-width="1.5" /></svg>`;
}
