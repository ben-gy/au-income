// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * exceljs-backed sheet reader for the ATO workbooks.
 *
 * The pure parsing primitives live in parse.mjs (no dependencies) and are
 * re-exported here so callers have a single import; only this module needs
 * exceljs, which is a pipeline-only dependency.
 */
import ExcelJS from 'exceljs';
import { normHeader } from './parse.mjs';

export { columnFinder, normHeader, normPostcode, num } from './parse.mjs';

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
