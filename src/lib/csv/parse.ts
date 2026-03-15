/**
 * Parse Swedish-style numbers: "136,15" -> 136.15, "131,0%" -> 131.0
 */
export function parseSwedishNumber(value: string): number | null {
  if (value == null || String(value).trim() === "") return null;
  const s = String(value).trim().replace(",", ".");
  const withoutPct = s.replace(/%$/, "");
  const n = parseFloat(withoutPct);
  return Number.isNaN(n) ? null : n;
}
