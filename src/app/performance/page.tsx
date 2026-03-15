import { db } from "@/lib/db";
import { trades } from "@/lib/db/schema";
import { buildEquityCurve, buildDrawdown } from "@/lib/performance/equity";
import Link from "next/link";
import { EquityChart } from "./EquityChart";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const tradesList = await db.select().from(trades).orderBy(trades.datum);
  const equity = buildEquityCurve(tradesList);
  const drawdown = buildDrawdown(equity);

  const totalResult = equity.length > 0 ? equity[equity.length - 1].cumulativeResult : 0;
  const maxDrawdown =
    drawdown.length > 0 ? Math.min(...drawdown.map((d) => d.drawdown)) : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Performance</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--muted)]">Cumulative result (realized)</p>
          <p className="text-xl font-semibold">
            {totalResult >= 0 ? "" : "−"}
            {Math.abs(totalResult).toLocaleString("sv-SE", { minimumFractionDigits: 2 })} SEK
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--muted)]">Largest drawdown (approx)</p>
          <p className="text-xl font-semibold">{maxDrawdown.toFixed(1)} %</p>
        </div>
      </div>
      {equity.length > 0 ? (
        <section>
          <h2 className="font-semibold text-lg mb-4">Equity curve (cumulative result)</h2>
          <EquityChart data={equity} />
        </section>
      ) : (
        <p className="text-[var(--muted)]">
          Import transactions to see the equity curve.
        </p>
      )}
      <p>
        <Link href="/trades" className="text-[var(--primary)] hover:underline">
          View transactions →
        </Link>
      </p>
    </div>
  );
}
