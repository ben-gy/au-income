// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Shared context every view receives from main.ts. */
export interface ViewContext {
  /** Open the per-postcode drill-down panel. */
  openPostcode: (pc: string) => void;
  /** Switch to another tab, optionally carrying state. */
  goTo: (view: string) => void;
  /** Persisted per-view UI state (survives tab switches and reloads). */
  getState: (key: string, fallback: string) => string;
  setState: (key: string, value: string) => void;
  /** Register cleanup to run when the view is replaced. */
  onTeardown: (fn: () => void) => void;
  /** Aborts when the user navigates away mid-fetch. */
  signal: AbortSignal;
}
