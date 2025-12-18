import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import tickers from "@/lib/sp500/tickers.json";
import { computeSMA } from "@/lib/sma";
import type { SMAWindow, BelowSmaItem } from "@/lib/types/stock";

export const runtime = "nodejs"; // ensure Node runtime (not edge)

const WINDOWS: SMAWindow[] = [20, 50, 120, 200];
const NEED = 210;

function toStooqSymbol(sp500: string): string {
  return sp500.replaceAll(".", "-").toLowerCase() + ".us";
}

type CsvRow = { date: string; close: number };

function parseStooqCsv(csv: string): CsvRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const date = parts[0];
    const close = Number(parts[4]);
    if (!date || !Number.isFinite(close)) continue;
    rows.push({ date, close });
  }
  return rows;
}

async function fetchStooqDailyCsv(symbol: string): Promise<string> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Stooq HTTP ${resp.status} for ${symbol}`);
  return await resp.text();
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

async function buildScanJson() {
  const symbols = (Array.isArray(tickers) ? (tickers as string[]) : []).filter(Boolean);

  const resultsByWindow: Record<string, BelowSmaItem[]> = {
    "20": [],
    "50": [],
    "120": [],
    "200": [],
  };

  let asOf = "";

  await mapPool(symbols, 6, async (sym) => {
    const stooqSym = toStooqSymbol(sym);
    try {
      const csv = await fetchStooqDailyCsv(stooqSym);
      const rows = parseStooqCsv(csv);
      if (rows.length < 205) return;

      const latest = rows[rows.length - 1];
      if (!asOf) asOf = latest.date;

      const closesLatestFirst = rows
        .slice(-NEED)
        .map(r => r.close)
        .reverse();

      const close = closesLatestFirst[0];

      for (const w of WINDOWS) {
        const sma = computeSMA(closesLatestFirst, w);
        if (sma === null || sma === 0) continue;
        if (close < sma) {
          resultsByWindow[String(w)].push({
            symbol: sym,
            close,
            sma,
            pctBelow: (close - sma) / sma,
          });
        }
      }
    } catch {
      // ignore per-symbol failures for MVP
    }
  });

  for (const w of WINDOWS) {
    resultsByWindow[String(w)].sort((a, b) => a.pctBelow - b.pctBelow);
  }

  return {
    asOf,
    countByWindow: Object.fromEntries(WINDOWS.map(w => [String(w), resultsByWindow[String(w)].length])),
    resultsByWindow,
  };
}

export async function GET(req: Request) {
  // Protect this endpoint with a secret so random people can't trigger it
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await buildScanJson();

  // IMPORTANT: On Vercel serverless, writing to /public at runtime is NOT reliable/persistent.
  // We'll write to /tmp and return the JSON.
  // For production, store in Vercel KV / Blob / S3. For MVP, returning JSON is enough for debugging.
  const tmpPath = path.join("/tmp", "sma-scan.json");
  await fs.writeFile(tmpPath, JSON.stringify(json, null, 2) + "\n", "utf8");

  return NextResponse.json({ ok: true, asOf: json.asOf, countByWindow: json.countByWindow });
}
