import Link from "next/link";
import { db } from "@/lib/db";
import { trades, screeningSnapshots } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [recentTrades, lastScreen, counts] = await Promise.all([
    db.select().from(trades).orderBy(desc(trades.datum)).limit(5),
    db.select().from(screeningSnapshots).orderBy(desc(screeningSnapshots.snapshotDate)).limit(1),
    Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(trades),
      db.select({ count: sql<number>`count(*)` }).from(screeningSnapshots),
    ]),
  ]);

  const tradeCount = Number(counts[0][0]?.count ?? 0);
  const screenCount = Number(counts[1][0]?.count ?? 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Trend following trading log</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-[var(--border)] bg-white dark:bg-slate-800/50 p-6">
          <h2 className="font-semibold text-lg mb-2">Trades</h2>
          <p className="text-[var(--muted)] mb-4">{tradeCount} transactions</p>
          <Link
            href="/trades"
            className="text-[var(--primary)] hover:underline"
          >
            View all →
          </Link>
          <Link
            href="/trades/import"
            className="ml-4 text-[var(--primary)] hover:underline"
          >
            Import CSV
          </Link>
          {recentTrades.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {recentTrades.map((t) => (
                <li key={t.id}>
                  {t.datum} {t.typAvTransaktion} {t.vardepapper} {t.antal > 0 ? "+" : ""}{t.antal}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-white dark:bg-slate-800/50 p-6">
          <h2 className="font-semibold text-lg mb-2">Screening</h2>
          <p className="text-[var(--muted)] mb-4">{screenCount} snapshot(s)</p>
          {lastScreen[0] && (
            <p className="text-sm mb-2">Latest: {lastScreen[0].snapshotDate}</p>
          )}
          <Link
            href="/screens"
            className="text-[var(--primary)] hover:underline"
          >
            View screens →
          </Link>
          <Link
            href="/screens/import"
            className="ml-4 text-[var(--primary)] hover:underline"
          >
            Import CSV
          </Link>
        </section>
      </div>
      <p>
        <Link href="/performance" className="text-[var(--primary)] hover:underline">
          Performance & equity curve →
        </Link>
      </p>
    </div>
  );
}
