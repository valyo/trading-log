/// <reference path="../../jsx.d.ts" />
import { db } from "@/lib/db";
import { priceSeries } from "@/lib/db/schema";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { deletePriceSeries } from "./actions";

export const dynamic = "force-dynamic";

export default async function StretchListPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const list = await db.select().from(priceSeries).orderBy(desc(priceSeries.updatedAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Price studies (MA stretch & pullbacks)</h1>
        <Link
          href="/stretch/import"
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] hover:opacity-90"
        >
          Import Excel
        </Link>
      </div>
      <p className="text-sm text-[var(--muted)] max-w-3xl">
        Import historical daily closes to analyse the <strong>latest uptrend</strong> (since last close at or below
        MA200): at prior pullback peaks, how far price stretched above MA21 / MA50 / MA200, and internal MA spreads.
        The detail page compares <strong>today’s</strong> readings to those peaks.
      </p>
      {deleted === "1" && (
        <p className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30 px-4 py-2 text-sm">
          Series removed.
        </p>
      )}
      {list.length === 0 ? (
        <p className="text-[var(--muted)]">No series yet. Import an .xlsx file.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {list.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div>
                <Link href={`/stretch/${encodeURIComponent(s.slug)}`} className="font-medium text-[var(--primary)] hover:underline">
                  {s.label}
                </Link>
                <p className="text-xs text-[var(--muted)]">
                  {s.slug}
                  {s.sourceFile ? ` · ${s.sourceFile}` : ""}
                  {s.updatedAt ? ` · updated ${s.updatedAt.toLocaleString()}` : ""}
                </p>
              </div>
              <form action={deletePriceSeries}>
                <input type="hidden" name="slug" value={s.slug} />
                <button
                  type="submit"
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                  title="Delete this series and all bars"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
