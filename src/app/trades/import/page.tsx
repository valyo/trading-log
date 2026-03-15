import { submitBrokerImport } from "@/app/actions";
import Link from "next/link";

export default function ImportTradesPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/trades" className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm">
          ← Back to log
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Import trades (broker CSV)</h1>
      <p className="text-[var(--muted)]">
        Use semicolon-separated CSV with columns: Datum, Konto, Typ av transaktion,
        Värdepapper/beskrivning, Antal, Kurs, Belopp, Transaktionsvaluta, Courtage, Valutakurs,
        Instrumentvaluta, ISIN, Resultat.
      </p>
      <form action={submitBrokerImport} className="space-y-4">
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
          <label className="block text-sm font-medium mb-1">Source (optional, e.g. filename)</label>
          <input
            type="text"
            name="source"
            placeholder="transaktioner_2025-03-11_2026-03-11.csv"
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
