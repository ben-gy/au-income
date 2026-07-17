import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatMoney,
  formatMoneyShort,
  formatNumber,
  formatPercent,
  formatRatio,
  formatYear,
  ordinal,
} from '../src/format';

describe('formatNumber', () => {
  it('formats thousands with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
  it('handles negative numbers', () => {
    expect(formatNumber(-1234)).toBe('-1,234');
  });
  it('honours decimals', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
  });
  it('renders an em dash for null/undefined/NaN rather than "NaN"', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber(Infinity)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('adds a dollar sign and separators', () => {
    expect(formatMoney(82873)).toBe('$82,873');
  });
  it('puts the sign before the dollar sign', () => {
    expect(formatMoney(-5000)).toBe('-$5,000');
  });
  it('handles zero and null', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('formatMoneyShort', () => {
  it('abbreviates by magnitude', () => {
    expect(formatMoneyShort(1_500_000_000)).toBe('$1.5B');
    expect(formatMoneyShort(2_400_000)).toBe('$2.4M');
    expect(formatMoneyShort(85_000)).toBe('$85k');
    expect(formatMoneyShort(940)).toBe('$940');
  });
  it('trims trailing .0', () => {
    expect(formatMoneyShort(2_000_000)).toBe('$2M');
    expect(formatMoneyShort(50_000)).toBe('$50k');
  });
  it('handles zero, negatives and null', () => {
    expect(formatMoneyShort(0)).toBe('$0');
    expect(formatMoneyShort(-3000)).toBe('-$3k');
    expect(formatMoneyShort(null)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('scales a fraction to a percentage', () => {
    expect(formatPercent(0.3945)).toBe('39.5%');
  });
  it('honours decimals', () => {
    expect(formatPercent(0.3945, 0)).toBe('39%');
  });
  it('handles zero and null', () => {
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatRatio', () => {
  it('appends a multiplication sign', () => {
    expect(formatRatio(3.351)).toBe('3.35×');
  });
  it('handles null', () => {
    expect(formatRatio(null)).toBe('—');
  });
});

describe('formatYear', () => {
  it('converts the hyphen to an en dash', () => {
    expect(formatYear('2023-24')).toBe('2023–24');
  });
});

describe('ordinal', () => {
  it('handles the common suffixes', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });
  it('handles the 11/12/13 exception', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });
  it('handles 21/22/23 and large numbers with separators', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(1234)).toBe('1,234th');
  });
});

describe('escapeHtml', () => {
  it('neutralises tags and quotes from external locality data', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });
  it('escapes ampersands and apostrophes', () => {
    expect(escapeHtml("A & B's")).toBe('A &amp; B&#39;s');
  });
  it('leaves ordinary suburb names untouched', () => {
    expect(escapeHtml('Toorak')).toBe('Toorak');
  });
});
