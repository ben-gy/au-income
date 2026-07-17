/**
 * Domain jargon, defined for someone who has never read a tax statistic.
 * Rendered via .glossary-link spans with data-term attributes (Artemis pattern).
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  'taxable income': {
    term: 'Taxable income',
    definition:
      'Total income minus allowable deductions — the amount tax is actually calculated on. It is not the same as salary: it includes interest, dividends, business and rental income, and is reduced by deductions like work expenses and rental losses.',
  },
  median: {
    term: 'Median',
    definition:
      'The middle value. If you lined every taxpayer in a postcode up by income, the median is the person standing in the middle — half earn more, half earn less. It is not affected by a few extreme incomes, which makes it the fairest picture of a typical earner.',
  },
  average: {
    term: 'Average (mean)',
    definition:
      'Everyone\'s income added together and divided by the number of people. One billionaire in a postcode of nurses lifts the average enormously while changing the median barely at all — which is why "average income" headlines can be so misleading.',
  },
  'the gap': {
    term: 'The gap (average ÷ median)',
    definition:
      'How many times larger the average is than the median. Around 1.0 means almost everyone earns a similar amount. Above 2.0 means a small number of very high incomes are pulling the average up, and most residents earn far less than the "average" suggests.',
  },
  'negative gearing': {
    term: 'Negative gearing',
    definition:
      'When an investment property costs more to own (interest, rates, maintenance) than it earns in rent, it runs at a loss. In Australia that loss can be deducted from your other income — such as your salary — which reduces the tax you pay. This shows the share of taxpayers in a postcode doing exactly that.',
  },
  'help debt': {
    term: 'HELP / HECS debt',
    definition:
      'The Higher Education Loan Program — the government loan that covers university fees. It is repaid through the tax system once income passes a threshold. The balance shown is what remains outstanding.',
  },
  'effective tax rate': {
    term: 'Effective tax rate',
    definition:
      'Net tax paid divided by taxable income, for everyone in the postcode combined. This is not a tax bracket — it is what was actually paid after offsets and deductions, so it is always lower than the top marginal rate.',
  },
  'capital gain': {
    term: 'Capital gain',
    definition:
      'The profit from selling an asset such as shares or property for more than it cost. Individuals who have held the asset over a year generally pay tax on only half the gain.',
  },
  'franking credit': {
    term: 'Franking credit',
    definition:
      'A credit for company tax already paid on a dividend, so the same profit is not taxed twice. It attaches to dividends from Australian companies and can reduce your tax bill or be refunded.',
  },
  deduction: {
    term: 'Deduction',
    definition:
      'An expense you can subtract from your income before tax is calculated — work-related costs, donations, the cost of managing your tax affairs, or a rental loss. Deductions reduce taxable income, not the tax bill directly.',
  },
  postcode: {
    term: 'Postcode (postal area)',
    definition:
      'The ATO assigns each tax return to the postcode the person listed as their address. The map uses ABS "postal areas", which approximate postcodes as geographic regions — a handful of PO-box-only postcodes therefore have data but no shape on the map.',
  },
  sa4: {
    term: 'SA4 region',
    definition:
      'Statistical Area Level 4 — an ABS region of roughly 100,000 to 500,000 people, the level at which labour force data is published. Each postcode sits inside one.',
  },
  suppressed: {
    term: 'Suppressed / not available',
    definition:
      'To protect privacy, the ATO withholds figures where too few people are in a category — a cell that would otherwise identify individuals. These appear as "—" rather than zero, because the value exists but cannot be published.',
  },
  anzsco: {
    term: 'Occupation groups (ANZSCO)',
    definition:
      'The standard Australian classification of occupations. Taxpayers are grouped into eight major categories by the occupation written on their return, plus apprentices. "Not stated" covers returns with no occupation — largely retirees, investors, and people on government payments.',
  },
};

export function lookupTerm(term: string): GlossaryEntry | null {
  return GLOSSARY[term.toLowerCase()] ?? null;
}

/** Inline info marker: <span class="glossary-link" data-term="…">label ⓘ</span> */
export function gloss(term: string, label?: string): string {
  const entry = lookupTerm(term);
  const text = label ?? entry?.term ?? term;
  if (!entry) return text;
  return `<span class="glossary-link" data-term="${term.toLowerCase()}" role="button" tabindex="0" aria-label="What is ${entry.term}?">${text}<span class="glossary-mark" aria-hidden="true">ⓘ</span></span>`;
}
