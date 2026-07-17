import { buildInsights } from '../analysis';
import { escapeHtml, formatMoney, formatNumber, formatRatio, formatYear } from '../format';
import type { Dataset } from '../types';
import type { ViewContext } from './types';

/** Auto-detected findings — the things a reader should not have to hunt for. */
export function renderInsights(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const insights = buildInsights(data.postcodes);
  const m = data.meta;

  root.innerHTML = `
    <div class="view-head">
      <h2>What the data says</h2>
      <p>
        Findings computed directly from the ${formatYear(m.year)} figures — recalculated whenever the ATO
        publishes, never hand-written. Click any postcode to open it.
      </p>
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="stat-label">Taxpayers</div>
        <div class="stat-value">${formatNumber(m.counts.individuals)}</div>
        <div class="stat-note">lodged a return in ${formatYear(m.year)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Typical postcode median</div>
        <div class="stat-value money">${formatMoney(m.national.medianOfMedians)}</div>
        <div class="stat-note">half of all postcodes sit below</div>
      </div>
      <div class="stat">
        <div class="stat-label">Typical gap</div>
        <div class="stat-value">${formatRatio(m.national.medianGap)}</div>
        <div class="stat-note">average ÷ median, median postcode</div>
      </div>
      <div class="stat">
        <div class="stat-label">Net tax paid</div>
        <div class="stat-value money">${formatMoney(m.national.totalNetTax)}</div>
        <div class="stat-note">by individuals, ${formatYear(m.year)}</div>
      </div>
    </div>

    <div class="insight-grid">
      ${insights
        .map(
          (i) => `
        <article class="insight ${i.severity}">
          <h3>${escapeHtml(i.title)}</h3>
          <p>${i.body}</p>
          <div class="insight-refs">
            ${i.refs
              .map((r) => `<button class="ref-chip" data-pc="${r.pc}">${r.pc} ${escapeHtml(r.name)} (${r.st}) →</button>`)
              .join('')}
          </div>
        </article>`,
        )
        .join('')}
    </div>
  `;

  root.querySelectorAll('.ref-chip').forEach((b) =>
    b.addEventListener('click', () => ctx.openPostcode(b.getAttribute('data-pc') as string)),
  );
}
