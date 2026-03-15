import { db } from "@/lib/db";
import { trades } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { deleteTrade, recalculateResultat } from "@/app/actions";

export const dynamic = "force-dynamic";

function formatNum(value: number | null | undefined): string {
  if (value == null) return "—";
  return Number(value).toFixed(2);
}

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ inserted?: string; skipped?: string; deleted?: string; recalculated?: string }>;
}) {
  const { inserted, skipped, deleted, recalculated } = await searchParams;
  const list = await db.select().from(trades).orderBy(desc(trades.datum), desc(trades.id));

  const hasImportResult = inserted !== undefined || skipped !== undefined;
  const skippedCount = Number(skipped ?? 0);
  const insertedCount = Number(inserted ?? 0);

  return (
    <div className="space-y-6">
      {hasImportResult && (
        <div className="space-y-2">
          {insertedCount > 0 && (
            <p className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30 px-4 py-2 text-sm text-green-800 dark:text-green-200">
              Imported {insertedCount} transaction(s).
            </p>
          )}
          {skippedCount > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
              <strong>Duplicates detected:</strong> {skippedCount} row(s) already in the log and skipped.
            </p>
          )}
          {insertedCount === 0 && skippedCount > 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
              All rows were duplicates – no new transactions added.
            </p>
          )}
        </div>
      )}
      {deleted === "1" && (
        <p className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30 px-4 py-2 text-sm text-green-800 dark:text-green-200">
          Transaction removed.
        </p>
      )}
      {recalculated !== undefined && Number(recalculated) >= 0 && (
        <p className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30 px-4 py-2 text-sm text-green-800 dark:text-green-200">
          Resultat recalculated for {recalculated} transaction(s) (FIFO + dividends).
        </p>
      )}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Trade log</h1>
        <div className="flex gap-2">
          <form action={recalculateResultat} className="inline">
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Recalculate Resultat
            </button>
          </form>
          <Link
            href="/trades/import"
            className="rounded-md bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] hover:opacity-90"
          >
            Import CSV
          </Link>
        </div>
      </div>
      <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-left shadow-[0_1px_0_0_var(--border)]">Datum</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-left shadow-[0_1px_0_0_var(--border)]">Konto</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-left shadow-[0_1px_0_0_var(--border)]">Typ</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-left shadow-[0_1px_0_0_var(--border)]">Värdepapper</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-right shadow-[0_1px_0_0_var(--border)]">Antal</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-right shadow-[0_1px_0_0_var(--border)]">Kurs</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-right shadow-[0_1px_0_0_var(--border)]">Belopp</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-left shadow-[0_1px_0_0_var(--border)]">Valuta</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-right shadow-[0_1px_0_0_var(--border)]">Courtage</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-right shadow-[0_1px_0_0_var(--border)]">Resultat</th>
              <th className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 p-3 text-left shadow-[0_1px_0_0_var(--border)]">Source</th>
              <th className="sticky top-0 z-10 w-20 bg-slate-100 dark:bg-slate-800 p-3 shadow-[0_1px_0_0_var(--border)]"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-6 text-center text-[var(--muted)]">
                  No transactions. Import from broker CSV.
                </td>
              </tr>
            ) : (
              list.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3">{t.datum}</td>
                  <td className="p-3">{t.konto}</td>
                  <td className="p-3">{t.typAvTransaktion}</td>
                  <td className="p-3">{t.vardepapper}</td>
                  <td className="p-3 text-right">{t.antal}</td>
                  <td className="p-3 text-right">{formatNum(t.kurs)}</td>
                  <td className="p-3 text-right">{formatNum(t.belopp)}</td>
                  <td className="p-3">{t.transaktionsvaluta}</td>
                  <td className="p-3 text-right">{formatNum(t.courtage)}</td>
                  <td className="p-3 text-right">{formatNum(t.resultat)}</td>
                  <td className="p-3 text-[var(--muted)]">{t.source ?? "—"}</td>
                  <td className="p-3">
                    <form action={deleteTrade} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
                        title="Remove this transaction"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
