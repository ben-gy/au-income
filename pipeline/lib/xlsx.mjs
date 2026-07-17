/**
 * Minimal helpers over exceljs streaming reads of the ATO workbooks.
 *
 * The ATO sheets all share a shape: row 1 is a title banner, row 2 is the real
 * header, rows 3+ are data. Columns are matched by HEADER TEXT, never by index —
 * the ATO reorders and renames columns between editions, and a silent index
 * shift would publish wrong numbers rather than failing.
 */
import ExcelJS from 'exceljs';

/**
 * Collapse whitespace/newlines so headers compare stably.
 *
 * ATO header cells carry footnote superscripts ("Postcode2", "Median3 taxable
 * income …"), which exceljs returns as rich-text objects rather than strings —
 * String() on those yields "[object Object]" and every column lookup fails.
 */
export function normHeader(h) {
  let v = h;
  if (v && typeof v === 'object') {
    if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join('');
    else if ('text' in v) v = v.text;
    else if ('result' in v) v = v.result;
  }
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * ATO suppresses small cells for privacy, writing 'na'. Empty and 'na' both mean
 * "no usable value" and must become null — NOT 0, which would drag every average
 * and every rate toward zero.
 */
export function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object') {
    // exceljs rich-text / formula cells
    if ('result' in v) return num(v.result);
    if ('richText' in v) return num(v.richText.map((r) => r.text).join(''));
    return null;
  }
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || /^n\.?a\.?$/i.test(s) || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Postcodes are 4 digits and must keep their leading zero (NT 0800). */
export function normPostcode(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  return s.padStart(4, '0');
}

/**
 * Read one sheet by name. Returns { headers: string[], rows: any[][] } where
 * headers are normalised and rows start after the header row.
 */
export async function readSheet(file, sheetName, { headerRow = 2 } = {}) {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    entries: 'emit',
  });
  for await (const ws of wb) {
    if (ws.name !== sheetName) {
      // Must drain the sheet even when skipping, or the stream stalls.
      for await (const _ of ws) void _;
      continue;
    }
    const rows = [];
    let headers = null;
    let i = 0;
    for await (const row of ws) {
      i++;
      const values = row.values.slice(1); // exceljs pads index 0
      if (i < headerRow) continue;
      if (i === headerRow) {
        headers = values.map(normHeader);
        continue;
      }
      rows.push(values);
    }
    if (!headers) throw new Error(`Sheet ${sheetName} in ${file} has no header row ${headerRow}`);
    return { headers, rows };
  }
  throw new Error(`Sheet ${sheetName} not found in ${file}`);
}

/**
 * Build a header->index lookup that throws on a missing column. Matching is
 * exact-after-normalisation first, then unique-prefix, so footnote digits
 * ("Postcode2") still resolve.
 */
export function columnFinder(headers, file) {
  return function col(name, { optional = false } = {}) {
    const want = normHeader(name);
    let idx = headers.indexOf(want);
    if (idx === -1) {
      const hits = headers
        .map((h, i) => [h, i])
        .filter(([h]) => h.replace(/\d+$/, '').trim() === want || h.startsWith(want));
      if (hits.length === 1) idx = hits[0][1];
      else if (hits.length > 1) {
        throw new Error(`Ambiguous column "${name}" in ${file}: matched ${hits.length} headers`);
      }
    }
    if (idx === -1) {
      if (optional) return -1;
      throw new Error(
        `Column "${name}" not found in ${file}. The ATO may have renamed it. Headers: ${headers
          .filter(Boolean)
          .slice(0, 12)
          .join(' | ')}…`,
      );
    }
    return idx;
  };
}
