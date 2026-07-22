// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles.css';
import { mountAbout } from './components/about';
import { mountDrilldown } from './components/drilldown';
import { initGlossary } from './components/glossaryPopover';
import { initTooltip } from './components/tooltip';
import { loadDataset } from './data';
import { escapeHtml, formatNumber, formatYear } from './format';
import type { Dataset, Postcode } from './types';
import { renderDistribution } from './views/distribution';
import { renderExplorer } from './views/explorer';
import { renderGap } from './views/gap';
import { renderInsights } from './views/insights';
import { renderMap } from './views/map';
import { renderOccupations } from './views/occupations';
import { renderRankings } from './views/rankings';
import { renderTrend } from './views/trend';
import type { ViewContext } from './views/types';

interface ViewDef {
  id: string;
  label: string;
  render: (root: HTMLElement, data: Dataset, ctx: ViewContext) => void | Promise<void>;
}

// Nav labels are words only — never count badges.
const VIEWS: ViewDef[] = [
  { id: 'map', label: 'Map', render: renderMap },
  { id: 'rankings', label: 'Rankings', render: renderRankings },
  { id: 'explorer', label: 'Explorer', render: renderExplorer },
  { id: 'gap', label: 'The Gap', render: renderGap },
  { id: 'occupations', label: 'Occupations', render: renderOccupations },
  { id: 'distribution', label: 'Distribution', render: renderDistribution },
  { id: 'trend', label: 'Trend', render: renderTrend },
  { id: 'insights', label: 'Insights', render: renderInsights },
];

const STATE_KEY = 'au-income:state';

function loadState(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveState(state: Record<string, string>): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* private browsing — preferences just won't persist */
  }
}

async function boot(): Promise<void> {
  const app = document.getElementById('app') as HTMLElement;
  app.innerHTML = `
    <header class="site-header">
      <div class="brand">
        <h1>Income by Postcode</h1>
        <span class="brand-sub">What Australians actually earn</span>
      </div>
      <div class="search-wrap">
        <input class="search-input" id="search" type="search" autocomplete="off"
          placeholder="Search a suburb or postcode…" aria-label="Search for a postcode or suburb" />
        <div class="search-results" id="search-results" role="listbox"></div>
      </div>
      <div class="header-spacer"></div>
      <div class="header-actions">
        <button class="icon-btn" id="about-btn" aria-label="About this site" title="About this site">?</button>
      </div>
    </header>
    <nav class="tabs" id="tabs" role="tablist" aria-label="Views"></nav>
    <main class="main-content" id="view" role="tabpanel">
      <div class="skeleton"></div>
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <span id="footer-source">Loading…</span>
        <span>
          Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> ·
          <a href="https://sites.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a>
        </span>
      </div>
    </footer>
  `;

  initTooltip();
  initGlossary();

  const viewRoot = document.getElementById('view') as HTMLElement;

  let data: Dataset;
  try {
    data = await loadDataset();
  } catch (err) {
    viewRoot.innerHTML = `
      <div class="error-state">
        <p>Could not load the tax data.</p>
        <p style="font-size:var(--font-size-sm);color:var(--text-tertiary)">${escapeHtml((err as Error).message)}</p>
        <button class="btn primary" id="retry" style="margin-top:1rem">Try again</button>
      </div>`;
    document.getElementById('retry')?.addEventListener('click', () => location.reload());
    return;
  }

  const about = mountAbout(data.meta);
  const drill = mountDrilldown(data);
  document.getElementById('about-btn')?.addEventListener('click', about.open);

  (document.getElementById('footer-source') as HTMLElement).innerHTML = `
    Source: ATO Taxation Statistics ${formatYear(data.meta.year)} · ABS ASGS 2021 boundaries ·
    ${formatNumber(data.meta.counts.postcodes)} postcodes, ${formatNumber(data.meta.counts.individuals)} taxpayers
  `;

  const state = loadState();
  let teardowns: Array<() => void> = [];
  let controller = new AbortController();

  const ctx: ViewContext = {
    openPostcode: (pc) => drill.open(pc),
    goTo: (id) => show(id),
    getState: (k, fallback) => state[k] ?? fallback,
    setState: (k, v) => {
      state[k] = v;
      saveState(state);
    },
    onTeardown: (fn) => teardowns.push(fn),
    get signal() {
      return controller.signal;
    },
  };

  const tabs = document.getElementById('tabs') as HTMLElement;
  tabs.innerHTML = VIEWS.map(
    (v) => `<button class="tab" role="tab" data-view="${v.id}" aria-selected="false">${v.label}</button>`,
  ).join('');

  function show(id: string): void {
    const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
    // Tear down the outgoing view (Leaflet instances, zoom handlers, timers).
    for (const fn of teardowns) fn();
    teardowns = [];
    controller.abort();
    controller = new AbortController();

    tabs.querySelectorAll('.tab').forEach((t) =>
      t.setAttribute('aria-selected', String(t.getAttribute('data-view') === view.id)),
    );
    state.view = view.id;
    saveState(state);
    if (!location.hash.startsWith('#pc=')) history.replaceState(null, '', `#${view.id}`);

    viewRoot.innerHTML = '';
    const result = view.render(viewRoot, data, ctx);
    if (result instanceof Promise) {
      result.catch(() => {
        viewRoot.innerHTML = '<div class="error-state">Something went wrong rendering this view.</div>';
      });
    }
  }

  tabs.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => show(t.getAttribute('data-view') as string)),
  );

  mountSearch(data, (pc) => drill.open(pc));

  // Deep links: #pc=3142 opens a postcode; #gap etc. selects a view.
  const hash = location.hash.slice(1);
  if (hash.startsWith('pc=')) {
    show(state.view ?? 'map');
    drill.open(hash.slice(3));
  } else if (VIEWS.some((v) => v.id === hash)) {
    show(hash);
  } else {
    show(state.view ?? 'map');
  }

  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h.startsWith('pc=')) drill.open(h.slice(3));
    else if (VIEWS.some((v) => v.id === h)) show(h);
  });
}

/** Header search: postcode-first, because that's the question people arrive with. */
function mountSearch(data: Dataset, onPick: (pc: string) => void): void {
  const input = document.getElementById('search') as HTMLInputElement;
  const results = document.getElementById('search-results') as HTMLElement;
  let active = -1;
  let matches: Postcode[] = [];

  const close = () => {
    results.classList.remove('open');
    active = -1;
  };

  const draw = () => {
    if (!matches.length) {
      results.innerHTML = '<div class="search-empty">No matching postcode or suburb.</div>';
      results.classList.add('open');
      return;
    }
    results.innerHTML = matches
      .map(
        (p, i) => `
      <div class="search-item ${i === active ? 'active' : ''}" data-pc="${p.pc}" role="option" aria-selected="${i === active}">
        <span class="sr-pc">${escapeHtml(p.pc)}</span>
        <span class="sr-name">${escapeHtml(p.name)}${
          p.locs.length > 1 ? `<span style="color:var(--text-tertiary)"> · ${escapeHtml(p.locs.filter((l) => l !== p.name)[0] ?? '')}</span>` : ''
        }</span>
        <span class="sr-meta">${escapeHtml(p.st)}</span>
      </div>`,
      )
      .join('');
    results.classList.add('open');
    results.querySelectorAll('.search-item').forEach((el) =>
      el.addEventListener('click', () => {
        onPick(el.getAttribute('data-pc') as string);
        close();
        input.blur();
      }),
    );
  };

  const search = (q: string) => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) {
      close();
      matches = [];
      return;
    }
    const scored = data.postcodes
      .map((p) => {
        let score = -1;
        if (p.pc === needle) score = 0;
        else if (p.pc.startsWith(needle)) score = 1;
        else if (p.name.toLowerCase().startsWith(needle)) score = 2;
        else if (p.locs.some((l) => l.toLowerCase().startsWith(needle))) score = 3;
        else if (p.name.toLowerCase().includes(needle)) score = 4;
        else if (p.locs.some((l) => l.toLowerCase().includes(needle))) score = 5;
        return { p, score };
      })
      .filter((s) => s.score >= 0)
      .sort((a, b) => a.score - b.score || b.p.n - a.p.n)
      .slice(0, 10);
    matches = scored.map((s) => s.p);
    draw();
  };

  let t: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => search(input.value), 220);
  });
  input.addEventListener('focus', () => {
    if (matches.length) results.classList.add('open');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      active = e.key === 'ArrowDown' ? Math.min(matches.length - 1, active + 1) : Math.max(0, active - 1);
      draw();
    } else if (e.key === 'Enter') {
      const pick = matches[active >= 0 ? active : 0];
      if (pick) {
        onPick(pick.pc);
        close();
        input.blur();
      }
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.search-wrap')) close();
  });
}

void boot();
