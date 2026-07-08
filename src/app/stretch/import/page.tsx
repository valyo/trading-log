/// <reference path="../../../jsx.d.ts" />
import Link from "next/link";
import { importPriceSeriesXlsx } from "../actions";

export const dynamic = "force-dynamic";

export default async function StretchImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold">Import daily prices (Excel)</h1>
      <p className="text-sm text-[var(--muted)]">
        Upload an <code className="text-xs">.xlsx</code> file. The importer scans the first rows for a header line
        with a <strong>date</strong> column (Date, Datum, Handelsdag, …) and a <strong>close</strong> column (Close,
        Senaste, Sista, Stängning, …). Title rows above the header are fine. Optional: Open, High, Low, Volume. First
        worksheet only. Example: <code className="text-xs">CHEF-Cheffelo.xlsx</code>.
      </p>
      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
          {error === "no_file"
            ? "Choose a file first."
            : error === "no_rows"
              ? "No valid rows found."
              : error}
        </p>
      )}
      <form action={importPriceSeriesXlsx} className="space-y-4">
        <input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="block w-full text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] hover:opacity-90"
        >
          Import
        </button>
      </form>
      <p>
        <Link href="/stretch" className="text-[var(--primary)] hover:underline">
          ← Price studies
        </Link>
      </p>
    </div>
  );
}
