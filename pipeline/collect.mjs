#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * collect.mjs — download every upstream source into pipeline/.cache/.
 *
 * Sources (all public, no auth):
 *   - ATO Taxation Statistics 2023-24, Individuals Table 6 (161 items x postcode)
 *   - ATO Taxation Statistics 2023-24, Individuals Table 7 (bands / ages / occupations x postcode)
 *   - ATO Taxation Statistics 2023-24, Individuals Table 8 (median + average income, 12 year-points)
 *   - ABS ASGS 2021 Postal Area digital boundaries (shapefile -> simplified GeoJSON)
 *   - matthewproctor/australianpostcodes reference (postcode -> locality/state)
 *
 * Downloads are cached; re-runs only re-fetch what's missing.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'pipeline', '.cache');

// data.gov.au CKAN resource URLs for Taxation Statistics 2023-24 (the current edition).
const ATO = 'https://data.gov.au/data/dataset/faea4485-f407-457d-97f8-3f0822ccd654/resource';
export const ATO_FILES = {
  table6: `${ATO}/9d8577b7-a096-4758-9b3b-0649f3b83de7/download/ts24individual06taxablestatusstatesa4postcode.xlsx`,
  table7: `${ATO}/a81d6593-f37b-4564-9dd1-85e00f259598/download/ts24individual07statepostcodetaxableincomerangeagerangeoccupation.xlsx`,
  table8: `${ATO}/4db4ef74-bd3e-47d0-a56e-29659f812c8a/download/ts24individual08medianaveragetaxableincomestatepostcode.xlsx`,
};

const ABS_POA_SHP =
  'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/POA_2021_AUST_GDA2020_SHP.zip';
const POSTCODES_REF =
  'https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv';

function log(msg) {
  process.stdout.write(`[collect] ${msg}\n`);
}

function download(url, dest, { minBytes = 1024 } = {}) {
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
    log(`cached  ${path.basename(dest)} (${fs.statSync(dest).size.toLocaleString()} bytes)`);
    return dest;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  log(`fetch   ${url}`);
  execFileSync('curl', ['-sSL', '--fail', '--retry', '3', '--retry-delay', '2', '-o', dest, url], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const size = fs.statSync(dest).size;
  if (size < minBytes) {
    throw new Error(`Downloaded ${url} but got only ${size} bytes — source may have moved.`);
  }
  log(`ok      ${path.basename(dest)} (${size.toLocaleString()} bytes)`);
  return dest;
}

function main() {
  fs.mkdirSync(CACHE, { recursive: true });

  // 1. ATO taxation statistics workbooks.
  for (const [name, url] of Object.entries(ATO_FILES)) {
    download(url, path.join(CACHE, `${name}.xlsx`), { minBytes: 100_000 });
  }

  // 2. ABS POA boundaries -> simplified GeoJSON via mapshaper.
  //    Never hand-author geometry; always simplify real ABS source data.
  const geo = path.join(CACHE, 'poa.geojson');
  if (!fs.existsSync(geo)) {
    const shpZip = download(ABS_POA_SHP, path.join(CACHE, 'poa_shp.zip'), { minBytes: 1_000_000 });
    const shpDir = path.join(CACHE, 'poa_shp');
    log('unzip   POA shapefile');
    execFileSync('unzip', ['-o', '-q', shpZip, '-d', shpDir]);
    const shp = path.join(shpDir, 'POA_2021_AUST_GDA2020.shp');
    log('mapshaper simplify 1.2% (yields ~1.9 MB / ~360 KB gzipped)');
    execFileSync(
      'npx',
      [
        '-y',
        'mapshaper',
        shp,
        '-filter-fields',
        'POA_CODE21',
        '-simplify',
        '1.2%',
        'keep-shapes',
        '-o',
        'precision=0.001',
        'format=geojson',
        geo,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    log(`ok      poa.geojson (${fs.statSync(geo).size.toLocaleString()} bytes)`);
  } else {
    log('cached  poa.geojson');
  }

  // 3. Postcode -> locality reference.
  download(POSTCODES_REF, path.join(CACHE, 'postcodes_ref.csv'), { minBytes: 100_000 });

  log('all sources ready');
}

main();
