/**
 * Tests for the pipeline's parsing primitives. These encode the traps that cost
 * real debugging time on this dataset:
 *   - ATO header cells are rich-text objects, not strings
 *   - 'na' means suppressed, NOT zero
 *   - the postcode reference CSV quotes every value
 */
import { describe, expect, it } from 'vitest';
// parse.mjs, not xlsx.mjs: the latter imports exceljs (a pipeline-only dep that
// CI's root `npm ci` doesn't install), which would fail the deploy test run.
import { columnFinder, normHeader, normPostcode, num } from '../pipeline/lib/parse.mjs';
import { parseCSV, parseTable } from '../pipeline/lib/csv.mjs';

describe('normHeader', () => {
  it('lowercases and collapses newlines the ATO puts in headers', () => {
    expect(normHeader('Individuals\nno.')).toBe('individuals no.');
    expect(normHeader('  State/ Territory1  ')).toBe('state/ territory1');
  });
  it('unwraps rich-text header cells (footnote superscripts)', () => {
    // exceljs returns this shape for "Median3 taxable income 2023–24 $".
    const rich = { richText: [{ text: 'Median' }, { text: '3' }, { text: ' taxable income 2023–24 $' }] };
    expect(normHeader(rich)).toBe('median3 taxable income 2023–24 $');
  });
  it('unwraps formula result cells', () => {
    expect(normHeader({ result: 'Postcode' })).toBe('postcode');
  });
  it('never yields "[object Object]" for object input', () => {
    expect(normHeader({ richText: [{ text: 'X' }] })).not.toContain('object');
  });
  it('handles null and undefined', () => {
    expect(normHeader(null)).toBe('');
    expect(normHeader(undefined)).toBe('');
  });
});

describe('num', () => {
  it('passes through real numbers', () => {
    expect(num(82873)).toBe(82873);
    expect(num(0)).toBe(0);
  });
  it('treats the ATO privacy marker "na" as null, NOT zero', () => {
    // Returning 0 here would silently drag every average and rate downward.
    expect(num('na')).toBeNull();
    expect(num('n.a.')).toBeNull();
    expect(num('NA')).toBeNull();
  });
  it('treats blanks and dashes as null', () => {
    expect(num('')).toBeNull();
    expect(num('   ')).toBeNull();
    expect(num('-')).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
  });
  it('strips thousands separators', () => {
    expect(num('1,234,567')).toBe(1234567);
  });
  it('handles negative amounts (rental losses are published negative)', () => {
    expect(num(-33067)).toBe(-33067);
    expect(num('-33,067')).toBe(-33067);
  });
  it('rejects non-numeric junk instead of returning NaN', () => {
    expect(num('total')).toBeNull();
    expect(num(NaN)).toBeNull();
    expect(num(Infinity)).toBeNull();
  });
});

describe('normPostcode', () => {
  it('pads to four digits, preserving the NT leading zero', () => {
    expect(normPostcode(800)).toBe('0800');
    expect(normPostcode('800')).toBe('0800');
    expect(normPostcode('0800')).toBe('0800');
  });
  it('passes through ordinary postcodes', () => {
    expect(normPostcode('3142')).toBe('3142');
    expect(normPostcode(3142)).toBe('3142');
  });
  it('rejects quoted values — the trap that silently unnamed every suburb', () => {
    // A naive CSV split leaves the quotes attached; this must not parse.
    expect(normPostcode('"3142"')).toBeNull();
  });
  it('rejects totals rows and non-numeric junk', () => {
    expect(normPostcode('Total')).toBeNull();
    expect(normPostcode('')).toBeNull();
    expect(normPostcode(null)).toBeNull();
    expect(normPostcode('12345')).toBeNull();
  });
});

describe('columnFinder', () => {
  const headers = [
    'taxable status',
    'state/ territory1',
    'postcode2',
    'individuals no.',
    'median3 taxable income 2023–24 $',
  ];
  const col = columnFinder(headers, 'test.xlsx');

  it('finds an exact match', () => {
    expect(col('Individuals no.')).toBe(3);
  });
  it('matches through trailing footnote digits', () => {
    expect(col('Postcode')).toBe(2);
    expect(col('State/ Territory')).toBe(1);
  });
  it('throws a descriptive error for a missing column rather than returning -1', () => {
    // Failing loudly is the point: a silent -1 would publish wrong numbers.
    expect(() => col('Net tax $')).toThrow(/not found/i);
  });
  it('returns -1 for a missing optional column', () => {
    expect(col('Net tax $', { optional: true })).toBe(-1);
  });
});

describe('parseCSV / parseTable', () => {
  it('keeps quoted fields intact and strips the quotes', () => {
    const rows = parseCSV('"230","0200","ANU","ACT"');
    expect(rows[0]).toEqual(['230', '0200', 'ANU', 'ACT']);
  });
  it('does not split on a comma inside quotes', () => {
    const rows = parseCSV('"1","Smith, John","VIC"');
    expect(rows[0]).toEqual(['1', 'Smith, John', 'VIC']);
    expect(rows[0]).toHaveLength(3);
  });
  it('handles escaped double quotes', () => {
    const rows = parseCSV('"a","say ""hi""","c"');
    expect(rows[0][1]).toBe('say "hi"');
  });
  it('handles CRLF line endings', () => {
    const rows = parseCSV('a,b\r\nc,d');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('parseTable drops rows with the wrong column count', () => {
    const { header, rows } = parseTable('postcode,locality\n"3142","Toorak"\nbroken');
    expect(header).toEqual(['postcode', 'locality']);
    expect(rows).toEqual([['3142', 'Toorak']]);
  });
  it('parseTable returns empty structures for empty input', () => {
    expect(parseTable('')).toEqual({ header: [], rows: [] });
  });
});
