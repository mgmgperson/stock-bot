import { ensureLatestFirst } from "@/lib/sma";

type TDTimeSeriesValue = {
  datetime: string;
  close: string;
};

type TDTimeSeriesOk = {
  status?: string; // "ok"
  meta?: { symbol?: string };
  values?: TDTimeSeriesValue[];
};

type TDTimeSeriesError = {
  status?: string; // "error"
  code?: number | string;
  message?: string;
};

export type SymbolSeries = {
  symbol: string;
  asOf: string;          // YYYY-MM-DD
  closesLatestFirst: number[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractSeriesFromEntry(symbol: string, entry: any): SymbolSeries | null {
  if (!entry || !isObject(entry)) return null;

  // Entry can itself be an error for that symbol
  const status = (entry as any).status;
  if (status === "error") return null;

  const values = (entry as any).values as TDTimeSeriesValue[] | undefined;
  if (!Array.isArray(values) || values.length === 0) return null;

  const ordered = ensureLatestFirst(values);
  const closes = ordered
    .map(v => Number(v.close))
    .filter(n => Number.isFinite(n));

  if (closes.length === 0) return null;

  // datetime could be "2025-02-21 12:51:00" or "2025-02-21"
  const dt = ordered[0].datetime;
  const asOf = dt.slice(0, 10);

  return { symbol, asOf, closesLatestFirst: closes };
}

/**
 * Fetch daily time series for many symbols using Twelve Data "bulk" (comma-separated symbol param).
 * This uses ONE endpoint (/time_series) with the same params for all symbols. :contentReference[oaicite:2]{index=2}
 *
 * Response for multi-symbol time_series is commonly a dictionary keyed by symbol. :contentReference[oaicite:3]{index=3}
 * We parse a few variants defensively.
 */
export async function fetchDailySeriesBulk(params: {
  apiKey: string;
  symbols: string[];
  outputsize: number;       // e.g., 200
  endDate?: string;         // optional: "YYYY-MM-DD"
  chunkSize?: number;       // default 50
  timeoutMs?: number;       // default 20s
}): Promise<Map<string, SymbolSeries>> {
  const {
    apiKey,
    symbols,
    outputsize,
    endDate,
    chunkSize = 50,
    timeoutMs = 20_000,
  } = params;

  const result = new Map<string, SymbolSeries>();
  const symbolChunks = chunk(symbols, chunkSize);

  for (const group of symbolChunks) {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", group.join(","));
    url.searchParams.set("interval", "1day");
    url.searchParams.set("outputsize", String(outputsize));
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("format", "JSON");
    if (endDate) url.searchParams.set("end_date", endDate);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let json: any;
    try {
      const resp = await fetch(url.toString(), { signal: controller.signal });
      json = await resp.json();
    } finally {
      clearTimeout(timer);
    }

    if (process.env.NODE_ENV !== "production") {
        console.log("TwelveData chunk", group[0], "…", group[group.length - 1], "keys:", Object.keys(json ?? {}).slice(0, 10));
    }
    console.log(JSON.stringify(json).slice(0, 2000));


    // Global error
    if (isObject(json) && (json as TDTimeSeriesError).status === "error") {
      // Example: {status:"error", message:"...", code:...}
      continue; // be forgiving; you could throw if you prefer
    }

    // Variants we handle:
    // 1) { AAPL: {...}, MSFT: {...} }
    // 2) { data: { AAPL: {...}, MSFT: {...} }, status:"ok" }
    // 3) single symbol: { meta:{symbol:"AAPL"}, values:[...], status:"ok" }
    const dataRoot = isObject(json) && isObject((json as any).data) ? (json as any).data : json;

    // single-symbol shape
    if (isObject(dataRoot) && Array.isArray((dataRoot as TDTimeSeriesOk).values)) {
      const sym = (dataRoot as any)?.meta?.symbol ?? group[0];
      const series = extractSeriesFromEntry(sym, dataRoot);
      if (series) result.set(series.symbol, series);
      continue;
    }

    // multi-symbol dictionary shape
    if (isObject(dataRoot)) {
      for (const sym of group) {
        const entry = (dataRoot as any)[sym];
        const series = extractSeriesFromEntry(sym, entry);
        if (series) result.set(sym, series);
      }
    }
  }

  return result;
}
