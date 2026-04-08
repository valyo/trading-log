/**
 * Broker rows whose Belopp is pure cashflow for P&L (dividend, withholding, dividend tax).
 * Must not affect share quantity / FIFO lots; Resultat should equal Belopp for equity curve.
 */
export function isDividendPoolType(typ: string): boolean {
  const u = typ.trim().toLowerCase();
  if (u.includes("utdelning")) return true;
  if (u.includes("dividend") || u.includes("divident")) return true;
  if (u.includes("källskatt")) return true;
  if (u.includes("withholding")) return true;
  if (u.includes("preliminär") && u.includes("skatt")) return true;
  if (u.includes("skatt") && u.includes("utdelning")) return true;
  return false;
}
