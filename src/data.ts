// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { Dataset, Meta, Postcode } from './types';

/**
 * Load the dataset. Both files are static JSON committed by the pipeline, so a
 * failure here means a bad deploy or an offline user — surface it, never fail
 * silently to an empty page.
 */
export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  const [postcodes, meta] = await Promise.all([
    fetchJson<Postcode[]>('data/postcodes.json', signal),
    fetchJson<Meta>('data/meta.json', signal),
  ]);
  if (!Array.isArray(postcodes) || postcodes.length === 0) {
    throw new Error('postcodes.json contained no records');
  }
  return { postcodes, meta, byPc: new Map(postcodes.map((p) => [p.pc, p])) };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadGeo(signal?: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  return fetchJson<GeoJSON.FeatureCollection>('data/poa.geojson', signal);
}
