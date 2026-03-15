import { submitScreeningImport } from "@/app/actions";
import Link from "next/link";

export default function ImportScreeningPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/screens" className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm">
          ← Back to screens
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Import screening (Borsdata CSV)</h1>
      <p className="text-[var(--muted)]">
        Upload a Borsdata export (comma-separated, quoted). All columns are stored with their
        original names. Snapshot date is used for period comparison.
      </p>
      <form action={submitScreeningImport} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">File (CSV)</label>
          <input
            type="file"
            name="file"
            accept=".csv"
            required
            className="block w-full text-sm text-[var(--muted)] file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--primary)] file:text-[var(--primary-foreground)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Snapshot date (YYYY-MM-DD) *</label>
          <input
            type="date"
            name="snapshot_date"
            required
            className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Name (optional)</label>
          <input
            type="text"
            name="name"
            placeholder="e.g. Borsdata week 10"
            className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] hover:opacity-90"
        >
          Import
        </button>
      </form>
    </div>
  );
}
