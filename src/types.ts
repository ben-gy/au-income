/** One postcode's record, as emitted by pipeline/aggregate.mjs. */
export interface Postcode {
  pc: string;
  st: string;
  sa4: string;
  name: string;
  locs: string[];
  n: number;
  med: number;
  avg: number;
  /** average ÷ median — the signature metric. >1 means a high-income tail. */
  gap: number | null;
  /** [year, median, average] triples, oldest first. */
  series: Array<[string, number, number]>;
  /** Counts in the 5 ATO income bands, or null where suppressed. */
  bands: Array<number | null> | null;
  /** Combined $120k+ count (handles the rolled-up case). */
  bandHigh: number | null;
  /** True when only the combined $120k+ figure survived privacy suppression. */
  bandRolled: boolean;
  ages: Array<number | null> | null;
  occ: Array<number | null> | null;
  taxRate: number | null;
  salaryAvg: number | null;
  salaryShare: number | null;
  dedAvg: number | null;
  workExpAvg: number | null;
  giftRate: number | null;
  giftAvg: number | null;
  negGearRate: number | null;
  negGearAvg: number | null;
  landlordRate: number | null;
  rentProfitN: number | null;
  rentLossN: number | null;
  cgRate: number | null;
  cgAvg: number | null;
  helpRate: number | null;
  helpAvg: number | null;
  phiRate: number | null;
  superAvg: number | null;
  frankingAvg: number | null;
  netTaxAvg: number | null;
  totalTax: number | null;
}

export interface Meta {
  year: string;
  years: string[];
  generated: string;
  counts: { postcodes: number; individuals: number; polygons: number };
  national: {
    medianOfMedians: number;
    medianOfAverages: number;
    medianGap: number;
    totalNetTax: number;
  };
  extremes: {
    topMedian: Extreme[];
    topAverage: Extreme[];
    topGap: Extreme[];
  };
  sources: Array<{ name: string; url: string; note: string }>;
}

export interface Extreme {
  pc: string;
  name: string;
  st: string;
  v: number;
}

export interface Dataset {
  postcodes: Postcode[];
  meta: Meta;
  byPc: Map<string, Postcode>;
}
