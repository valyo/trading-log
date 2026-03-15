import { db } from "@/lib/db";
import { screeningSnapshots, screeningRows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ScreenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snap = await db
    .select()
    .from(screeningSnapshots)
    .where(eq(screeningSnapshots.id, Number(id)))
    .limit(1);
  if (!snap[0]) notFound();
  const rows = await db
    .select()
    .from(screeningRows)
    .where(eq(screeningRows.snapshotId, snap[0].id));

  const headers =
    rows[0]?.data && typeof rows[0].data === "object"
      ? Object.keys(rows[0].data as Record<string, unknown>)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/screens" className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm">
          ← Back to screens
        </Link>
      </div>
      <h1 className="text-2xl font-bold">
        Screening {snap[0].snapshotDate}
        {snap[0].name ? ` — ${snap[0].name}` : ""}
      </h1>
      <p className="text-[var(--muted)]">{rows.length} rows</p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left p-2 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                {headers.map((key) => {
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
      </div>
    </div>
  );
}
