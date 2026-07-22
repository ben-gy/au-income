// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { formatMoney, formatNumber, formatYear } from '../format';
import { gloss } from '../glossary';
import type { Meta } from '../types';

/**
 * About modal. Explains what the site is, where the data comes from, how it is
 * structured, how often it updates, and — importantly — what it cannot tell you.
 */
export function mountAbout(meta: Meta): { open: () => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'About Income by Postcode');

  const gen = new Date(meta.generated);
  modal.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    <h2>About Income by Postcode</h2>
    <p>
      Every year the Australian Taxation Office publishes a statistical summary of every individual
      tax return, aggregated by postcode. This site turns the ${formatYear(meta.year)} edition —
      ${formatNumber(meta.counts.individuals)} individuals across ${formatNumber(meta.counts.postcodes)}
      postcodes — into something you can actually explore.
    </p>

    <h3>Why median and average both matter</h3>
    <p>
      Most "average income" figures you see quoted are the mean, and the mean is easily distorted.
      A single very large income lifts a whole postcode's average while leaving the
      ${gloss('median')} untouched. That is why this site shows both, and why
      ${gloss('the gap')} between them is treated as a headline number rather than a footnote:
      it tells you whether a postcode is uniformly well-off or simply contains a few very rich people.
    </p>

    <h3>Where the data comes from</h3>
    <ul>
      ${meta.sources
        .map(
          (s) =>
            `<li><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a> — ${s.note}</li>`,
        )
        .join('')}
    </ul>

    <h3>How it updates</h3>
    <p>
      The ATO releases taxation statistics once a year, roughly a full financial year in arrears, so
      this data is refreshed annually. The current edition covers the ${formatYear(meta.year)} income
      year. Figures were last rebuilt on ${gen.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}.
    </p>

    <h3>What this data can't tell you</h3>
    <ul>
      <li>
        <strong>It's individuals, not households.</strong> Two people each earning $60,000 live very
        differently from one person earning $120,000, but this data only sees individuals.
      </li>
      <li>
        <strong>It's ${gloss('taxable income')}, not wealth or take-home pay.</strong> Someone with
        large deductions, or wealth held in assets and trusts rather than income, can show a modest
        taxable income. Retirees drawing on superannuation often have very little taxable income
        despite being comfortable.
      </li>
      <li>
        <strong>Only people who lodged a return appear.</strong> Australians below the tax-free
        threshold who don't lodge are invisible here.
      </li>
      <li>
        <strong>Small figures are ${gloss('suppressed')}.</strong> Where too few people fall into a
        category, the ATO withholds the number to protect privacy. Those show as "—", not zero.
      </li>
      <li>
        <strong>A postcode is not a suburb.</strong> One postcode can cover several suburbs of very
        different character, and the address on a tax return is not always where someone actually lives.
      </li>
    </ul>

    <h3>The numbers at a glance</h3>
    <p>
      Across Australia the median postcode has a median income of
      <strong>${formatMoney(meta.national.medianOfMedians)}</strong>, while the median postcode
      <em>average</em> is <strong>${formatMoney(meta.national.medianOfAverages)}</strong> — the gap,
      in miniature. Together these taxpayers paid
      <strong>${formatMoney(meta.national.totalNetTax)}</strong> in net tax.
    </p>
    <p style="font-size:0.75rem;color:var(--text-tertiary);margin-top:1rem">
      This is an independent project and is not affiliated with, or endorsed by, the ATO or the ABS.
      Figures are reproduced from published statistics; check the source before relying on them.
    </p>
  `;

  document.body.append(overlay, modal);

  const open = () => {
    overlay.classList.add('open');
    modal.classList.add('open');
    (modal.querySelector('.modal-close') as HTMLElement)?.focus();
  };
  const close = () => {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  };

  overlay.addEventListener('click', close);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close };
}
