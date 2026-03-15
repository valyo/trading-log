import { db } from "@/lib/db";
import { screeningSnapshots } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ScreensPage() {
  const list = await db
    .select()
    .from(screeningSnapshots)
    .orderBy(desc(screeningSnapshots.snapshotDate));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Screening snapshots</h1>
        <Link
          href="/screens/import"
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] hover:opacity-90"
        >
          Import CSV
        </Link>
      </div>
      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Created</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-[var(--muted)]">
                  No screens. Import Borsdata CSV.
                </td>
              </tr>
            ) : (
              list.map((s) => (
                <tr key={s.id} className="border-t border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3">{s.snapshotDate}</td>
                  <td className="p-3">{s.name ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)]">
                    {s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    <Link href={`/screens/${s.id}`} className="text-[var(--primary)] hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p>
        <Link href="/screens/compare" className="text-[var(--primary)] hover:underline">
          Compare two dates →
        </Link>
      </p>
    </div>
  );
}
