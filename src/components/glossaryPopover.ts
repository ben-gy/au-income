import { lookupTerm } from '../glossary';

/**
 * Click-to-open glossary popover for [data-term] spans (Artemis Tracker pattern).
 * Click away or press Escape to dismiss.
 */
let pop: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'glossary-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Definition');
    document.body.appendChild(pop);
  }
  return pop;
}

function close(): void {
  pop?.classList.remove('open');
}

function open(anchor: Element, term: string): void {
  const entry = lookupTerm(term);
  if (!entry) return;
  const el = ensure();
  el.innerHTML = '';
  const h = document.createElement('h4');
  h.textContent = entry.term;
  const p = document.createElement('p');
  p.textContent = entry.definition;
  el.append(h, p);
  el.classList.add('open');

  // Position near the anchor, flipped away from viewport edges.
  const r = anchor.getBoundingClientRect();
  const pr = el.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 8;
  if (left + pr.width + 12 > window.innerWidth) left = window.innerWidth - pr.width - 12;
  if (top + pr.height + 12 > window.innerHeight) top = r.top - pr.height - 8;
  el.style.left = `${Math.max(12, left)}px`;
  el.style.top = `${Math.max(12, top)}px`;
}

export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('[data-term]');
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      const term = target.getAttribute('data-term') ?? '';
      const isOpen = pop?.classList.contains('open');
      const same = pop?.dataset.term === term;
      if (isOpen && same) {
        close();
        return;
      }
      open(target, term);
      if (pop) pop.dataset.term = term;
      return;
    }
    if (!(e.target as Element).closest('.glossary-pop')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element)?.matches?.('[data-term]')) {
      e.preventDefault();
      (e.target as HTMLElement).click();
    }
  });

  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);
}
