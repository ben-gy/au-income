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
