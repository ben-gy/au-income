// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Display formatters. All are pure and unit-tested. */

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMoney(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${formatNumber(Math.abs(value), decimals)}`;
}

/** Compact money for axis ticks and dense cells: $1.2M, $85k, $940. */
export function formatMoneyShort(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${trimZero(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}$${trimZero(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${trimZero(abs / 1e3)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function trimZero(n: number): string {
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(1);
  return s.replace(/\.0$/, '');
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatRatio(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}×`;
}

/** "2023-24" -> "2023–24" (en dash), matching how the ATO writes income years. */
export function formatYear(year: string): string {
  return year.replace('-', '–');
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinal(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const mod100 = Math.abs(n) % 100;
  const mod10 = Math.abs(n) % 10;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = 'st';
    else if (mod10 === 2) suffix = 'nd';
    else if (mod10 === 3) suffix = 'rd';
  }
  return `${formatNumber(n)}${suffix}`;
}

/** Escape text destined for innerHTML — locality names come from an external CSV. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
