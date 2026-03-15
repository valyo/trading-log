import { db } from "@/lib/db";
import { screeningSnapshots, screeningRows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { CompareForm } from "./CompareForm";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a: idA, b: idB } = await searchParams;
  const snapshots = await db.select().from(screeningSnapshots).orderBy(screeningSnapshots.snapshotDate);

  if (!idA || !idB || idA === idB) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/screens" className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm">
            ← Back to screens
          </Link>
        </div>
        <h1 className="text-2xl font-bold">Compare screens</h1>
        <CompareForm snapshots={snapshots} selectedA={idA} selectedB={idB} />
        <p className="text-[var(--muted)]">Select two different dates to compare.</p>
      </div>
    );
  }

  const [rowsA, rowsB] = await Promise.all([
    db.select().from(screeningRows).where(eq(screeningRows.snapshotId, Number(idA))),
    db.select().from(screeningRows).where(eq(screeningRows.snapshotId, Number(idB))),
  ]);

  const snapA = snapshots.find((s) => s.id === Number(idA));
  const snapB = snapshots.find((s) => s.id === Number(idB));

  const byIdA = new Map(rowsA.map((r) => [r.borsdataId, r]));
  const byIdB = new Map(rowsB.map((r) => [r.borsdataId, r]));

  const onlyA = rowsA.filter((r) => !byIdB.has(r.borsdataId));
  const onlyB = rowsB.filter((r) => !byIdA.has(r.borsdataId));
  const inBoth = rowsA.filter((r) => byIdB.has(r.borsdataId));

  const headers =
    rowsA[0]?.data && typeof rowsA[0].data === "object"
      ? Object.keys(rowsA[0].data as Record<string, unknown>)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/screens" className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm">
          ← Back to screens
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Compare screens</h1>
      <CompareForm snapshots={snapshots} selectedA={idA} selectedB={idB} />

      <div className="grid gap-6 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-[var(--border)] p-4">
          <span className="font-medium">{snapA?.snapshotDate ?? "A"}</span>
          <p className="text-[var(--muted)]">Only in A: {onlyA.length}</p>
          <p className="text-[var(--muted)]">In both: {inBoth.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-4">
          <span className="font-medium">{snapB?.snapshotDate ?? "B"}</span>
          <p className="text-[var(--muted)]">Only in B: {onlyB.length}</p>
        </div>
      </div>

      <section>
        <h2 className="font-semibold text-lg mb-2">Only in {snapA?.snapshotDate} ({onlyA.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
              <tr>
                <th className="text-left p-2">Börsdata ID</th>
                <th className="text-left p-2">Bolagsnamn</th>
              </tr>
            </thead>
            <tbody>
              {onlyA.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="p-2">{r.borsdataId}</td>
                  <td className="p-2">{r.bolagsnamn}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {onlyA.length > 50 && <p className="p-2 text-[var(--muted)]">… and {onlyA.length - 50} more</p>}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-2">Only in {snapB?.snapshotDate} ({onlyB.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
              <tr>
                <th className="text-left p-2">Börsdata ID</th>
                <th className="text-left p-2">Bolagsnamn</th>
              </tr>
            </thead>
            <tbody>
              {onlyB.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="p-2">{r.borsdataId}</td>
                  <td className="p-2">{r.bolagsnamn}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {onlyB.length > 50 && <p className="p-2 text-[var(--muted)]">… and {onlyB.length - 50} more</p>}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-2">In both ({inBoth.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
              <tr>
                <th className="text-left p-2">Börsdata ID</th>
                <th className="text-left p-2">Bolagsnamn</th>
                {headers.slice(0, 6).map((h) => (
                  <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inBoth.slice(0, 100).map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="p-2">{r.borsdataId}</td>
                  <td className="p-2">{r.bolagsnamn}</td>
                  {headers.slice(0, 6).map((key) => {
                    const val = (r.data as Record<string, unknown>)[key];
                    return (
                      <td key={key} className="p-2 whitespace-nowrap">
                        {val != null && typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {inBoth.length > 100 && <p className="p-2 text-[var(--muted)]">… and {inBoth.length - 100} more</p>}
        </div>
      </section>
    </div>
  );
}
