export function computeSMA(closesLatestFirst: number[], period: number): number | null {
  if (period <= 0) return null;
  if (closesLatestFirst.length < period) return null;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += closesLatestFirst[i];
  return sum / period;
}

// Twelve Data usually returns newest first, but we normalize just in case.
export function ensureLatestFirst<T extends { datetime?: string }>(values: T[]): T[] {
  if (values.length < 2) return values;

  const a = values[0]?.datetime;
  const b = values[values.length - 1]?.datetime;
  if (!a || !b) return values;

  // If first is earlier than last, array is oldest->newest; reverse it.
  if (new Date(a).getTime() < new Date(b).getTime()) {
    return [...values].reverse();
  }
  return values;
}
