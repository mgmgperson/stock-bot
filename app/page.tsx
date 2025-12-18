"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { SMAWindow, BelowSmaItem, ScanResponse } from "@/lib/types/stock";

import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
} from "ag-grid-community";

import "ag-grid-community/styles/ag-theme-quartz.css";

// Register all community features
ModuleRegistry.registerModules([AllCommunityModule]);

const WINDOWS: SMAWindow[] = [20, 50, 120, 200];

function fmtPct(x: number) {
  return `${(x * 100).toFixed(2)}%`;
}

function fmtNum(x: number) {
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Home() {
  const [window, setWindow] = useState<SMAWindow>(200);
  const [asOf, setAsOf] = useState<string>("");
  const [rowData, setRowData] = useState<BelowSmaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScan = useCallback(async (w: SMAWindow) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/scan?window=${w}`, { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }

      const data = (await res.json()) as ScanResponse;
      setAsOf(data.asOf);
      setRowData(data.below);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch scan results.");
      setRowData([]);
      setAsOf("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScan(window);
  }, [window, fetchScan]);

  const colDefs = useMemo<ColDef<BelowSmaItem>[]>(() => {
    return [
      {
        headerName: "Symbol",
        field: "symbol",
        width: 120,
        sortable: true,
        filter: true,
        pinned: "left",
      },
      {
        headerName: "Close",
        field: "close",
        width: 140,
        valueFormatter: (p) => fmtNum(p.value),
        sortable: true,
        filter: "agNumberColumnFilter",
      },
      {
        headerName: `SMA(${window})`,
        field: "sma",
        width: 160,
        valueFormatter: (p) => fmtNum(p.value),
        sortable: true,
        filter: "agNumberColumnFilter",
      },
      {
        headerName: "% Below",
        field: "pctBelow",
        width: 150,
        valueFormatter: (p) => fmtPct(p.value),
        sortable: true,
        filter: "agNumberColumnFilter",
      },
    ];
  }, [window]);

  const defaultColDef = useMemo<ColDef>(() => {
    return {
      resizable: true,
      sortable: true,
      filter: true,
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            S&amp;P 500 — Below Moving Average
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Shows tickers where <span className="font-medium">Close &lt; SMA(N)</span> using
            the latest available daily close.
            {asOf ? (
              <>
                {" "}
                <span className="font-medium">As of:</span> {asOf}
              </>
            ) : null}
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition",
                w === window
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black"
                  : "bg-white text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800 dark:hover:bg-zinc-800",
              ].join(" ")}
              disabled={loading && w === window}
            >
              SMA {w}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            {loading ? (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Loading…
              </span>
            ) : (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {rowData.length.toLocaleString()} tickers
              </span>
            )}
            <button
              onClick={() => fetchScan(window)}
              className="rounded-full px-4 py-2 text-sm font-medium ring-1 ring-zinc-200 hover:bg-zinc-100 dark:ring-zinc-800 dark:hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
          <div className="ag-theme-quartz dark:ag-theme-quartz-dark" style={{ height: 640 }}>
            <AgGridReact<BelowSmaItem>
              rowData={rowData}
              columnDefs={colDefs}
              defaultColDef={defaultColDef}
              animateRows={true}
              pagination={true}
              paginationPageSize={50}
              quickFilterText={undefined}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            Tip: use the column filter on “Symbol” to quickly search tickers.
          </p>
        </div>
      </div>
    </div>
  );
}
