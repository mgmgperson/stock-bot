import { NextResponse } from "next/server";
import type { SMAWindow, ScanResponse, BelowSmaItem } from "@/lib/types/stock";
import fs from "node:fs/promises";
import path from "node:path";

// --- config ---
const WINDOWS: SMAWindow[] = [20, 50, 120, 200];

// In-memory cache (dev-friendly). On Vercel, a new instance may cold-start.
const cache = new Map<string, { expiresAt: number; payload: ScanResponse }>();

function parseWindow(value: string | null): SMAWindow | null {
  if (!value) return null;
  const n = Number(value);
  return (WINDOWS as number[]).includes(n) ? (n as SMAWindow) : null;
}

type Precomputed = {
  asOf: string;
  countByWindow: Record<string, number>;
  resultsByWindow: Record<string, BelowSmaItem[]>;
};

async function loadPrecomputed(): Promise<Precomputed> {
  const filePath = path.join(process.cwd(), "public", "sma-scan.json");
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as Precomputed;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const window = parseWindow(searchParams.get("window"));

  if (!window) {
    return NextResponse.json(
      { error: `Invalid window. Use one of: ${WINDOWS.join(", ")}` },
      { status: 400 }
    );
  }

  // Cache per window for 60 seconds (dev). You can increase to hours since it's daily data.
  const cacheKey = `scan:${window}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const pre = await loadPrecomputed();
    const key = String(window);
    const below = pre.resultsByWindow?.[key] ?? [];

    const payload: ScanResponse = {
      window,
      asOf: pre.asOf,
      count: below.length,
      below,
    };

    cache.set(cacheKey, { expiresAt: now + 60 * 1000, payload });

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "Failed to load precomputed sma-scan.json. Did you run the build script?",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
