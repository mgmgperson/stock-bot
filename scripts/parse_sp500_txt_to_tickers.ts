import fs from "node:fs";
import path from "node:path";

function isTicker(s: string): boolean {
  // allow BRK.B, BF.B, etc.
  return /^[A-Z][A-Z0-9.]{0,9}$/.test(s);
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npx tsx scripts/parse_sp500_txt_to_tickers.ts <input.txt>");
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const symbols: string[] = [];

  for (const line of lines) {
    // skip header
    if (line.startsWith("#")) continue;

    // Prefer tab parsing (your file is tab-separated)
    const tabParts = line.split("\t").map(p => p.trim()).filter(Boolean);

    if (tabParts.length >= 3) {
      const sym = tabParts[2];
      if (isTicker(sym)) {
        symbols.push(sym);
        continue;
      }
    }

    // Fallback: scan tokens (if someone pasted with spaces instead)
    const parts = line.split(/\s+/);
    const sym2 = parts.find(p => isTicker(p));
    if (sym2) symbols.push(sym2);
  }

  // dedupe, preserve order
  const seen = new Set<string>();
  const unique = symbols.filter(s => (seen.has(s) ? false : (seen.add(s), true)));

  const outDir = path.join(process.cwd(), "lib", "sp500");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "tickers.json");
  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2) + "\n", "utf8");

  console.log(`Wrote ${unique.length} tickers to ${outPath}`);
  console.log(`First 10: ${unique.slice(0, 10).join(", ")}`);
}

main();
