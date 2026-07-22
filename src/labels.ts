// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * ANZSCO occupation major groups, in the exact order Table 7C emits them.
 * Index 0 is "Not stated" — kept rather than dropped because in retiree-heavy
 * postcodes it is the single largest group, and hiding it would misrepresent
 * the occupation mix.
 */
export const OCCUPATION_LABELS = [
  'Not stated',
  'Managers',
  'Professionals',
  'Technicians & Trades',
  'Community & Personal Service',
  'Clerical & Admin',
  'Sales',
  'Machinery Operators & Drivers',
  'Labourers',
  'Apprentices & Trainees',
];

/** Short forms for the matrix column headers, where space is tight. */
export const OCCUPATION_SHORT = [
  'Not stated',
  'Managers',
  'Professionals',
  'Trades',
  'Community',
  'Clerical',
  'Sales',
  'Machinery',
  'Labourers',
  'Apprentices',
];

export const INCOME_BAND_LABELS = [
  '≤ $18,200',
  '$18,201–45,000',
  '$45,001–120,000',
  '$120,001–180,000',
  '$180,000+',
];

export const AGE_BAND_LABELS = ['Under 25', '25–34', '35–44', '45–54', '55–64', '65+'];
