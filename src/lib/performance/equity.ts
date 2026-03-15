import type { Trade } from "@/lib/db/schema";

export type EquityPoint = {
  date: string;
  cumulativeResult: number;
  cumulativeBelopp: number; // net cash flow
};

/**
 * Build equity curve from trades: cumulative resultat (realized P&L) and cumulative belopp (net cash flow).
 */
export function buildEquityCurve(tradesList: Trade[]): EquityPoint[] {
  const byDate = new Map<string, { resultat: number; belopp: number }>();
  for (const t of tradesList) {
    const cur = byDate.get(t.datum) ?? { resultat: 0, belopp: 0 };
    cur.resultat += t.resultat ?? 0;
    cur.belopp += t.belopp;
    byDate.set(t.datum, cur);
  }
  const dates = Array.from(byDate.keys()).sort();
  let cumResult = 0;
  let cumBelopp = 0;
  const points: EquityPoint[] = [];
  for (const d of dates) {
    const v = byDate.get(d)!;
    cumResult += v.resultat;
    cumBelopp += v.belopp;
    points.push({ date: d, cumulativeResult: cumResult, cumulativeBelopp: cumBelopp });
  }
  return points;
}

export type DrawdownPoint = {
  date: string;
  equity: number;
  peak: number;
  drawdown: number; // negative % from peak
};

export function buildDrawdown(equityPoints: EquityPoint[]): DrawdownPoint[] {
  let peak = 0;
  return equityPoints.map((p) => {
    const equity = p.cumulativeResult;
    if (equity > peak) peak = equity;
    const drawdown = peak === 0 ? 0 : ((equity - peak) / peak) * 100;
    return { date: p.date, equity, peak, drawdown };
  });
}
