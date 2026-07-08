/// <reference path="../../../jsx.d.ts" />
import { db } from "@/lib/db";
import { priceBars, priceSeries } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runPullbackStudy, interpretCurrentVsPeaks } from "@/lib/price-analysis/pullbackStudy";

export const dynamic = "force-dynamic";

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "" : "−"}${Math.abs(v).toLocaleString("sv-SE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;
}

function fmtStats(s: { n: number; min: number; max: number; mean: number; median: number } | null): string {
  if (!s) return "—";
  return `n=${s.n}, min ${fmtPct(s.min)}, med ${fmtPct(s.median)}, max ${fmtPct(s.max)}`;
}

export default async function StretchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ imported?: string; warn?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const { imported, warn } = await searchParams;

  const seriesRows = await db.select().from(priceSeries).where(eq(priceSeries.slug, slug)).limit(1);
  const s = seriesRows[0];
  if (!s) notFound();

  const bars = await db
    .select({
      datum: priceBars.datum,
      close: priceBars.close,
    })
    .from(priceBars)
    .where(eq(priceBars.seriesId, s.id))
    .orderBy(asc(priceBars.datum));

  const study = runPullbackStudy(bars);
  const interpretation = interpretCurrentVsPeaks(study);
  const { current, pullbackPeaks, statsAtPeaks, notes, barCount, uptrendAnchor, uptrendStartDatum } = study;

  return (
    <div className="space-y-8">
      <div>
        <p>
          <Link href="/stretch" className="text-sm text-[var(--primary)] hover:underline">
            ← Price studies
          </Link>
        </p>
        <h1 className="text-2xl font-bold mt-2">{s.label}</h1>
        <p className="text-sm text-[var(--muted)]">
          {s.slug}
          {s.sourceFile ? ` · ${s.sourceFile}` : ""}
        </p>
        {imported && (
          <p className="mt-2 text-sm text-green-700 dark:text-green-300">
            Imported {imported} bar(s).
          </p>
        )}
        {warn && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
            {warn}
          </p>
        )}
        <p className="mt-1 text-sm text-[var(--muted)]">
          Loaded <strong>{barCount}</strong> trading days in this series
          {uptrendAnchor !== "start" && (
            <>
              {" "}
              · uptrend vs <strong>{uptrendAnchor === "ma200" ? "MA200" : uptrendAnchor === "ma50" ? "MA50" : "MA21"}</strong>
            </>
          )}
          .
        </p>
        {barCount < 21 && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
            There are fewer than 21 daily closes, so MA21 and the pullback logic cannot run. Re-import a file with a
            longer <strong>daily</strong> history (one row per session).
          </p>
        )}
        {barCount >= 21 && barCount < 200 && (
          <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
            MA200 needs 200 trading days; you have {barCount}. MA21/MA50 work; stretch vs MA200 and some spreads stay
            empty until history is long enough.
          </p>
        )}
      </div>

      <section className="rounded-lg border border-[var(--border)] p-4 space-y-3">
        <h2 className="font-semibold text-lg">Current status ({current.datum})</h2>
        <p className="text-sm text-[var(--muted)]">
          Close:{" "}
          <strong>
            {current.close.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </strong>
          {" "}
          · MA21{" "}
          {current.ma21 != null
            ? current.ma21.toLocaleString("sv-SE", { maximumFractionDigits: 4 })
            : "—"}{" "}
          · MA50{" "}
          {current.ma50 != null
            ? current.ma50.toLocaleString("sv-SE", { maximumFractionDigits: 4 })
            : "—"}{" "}
          · MA200{" "}
          {current.ma200 != null
            ? current.ma200.toLocaleString("sv-SE", { maximumFractionDigits: 4 })
            : "—"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-[var(--muted)]">Stretch above MA (today)</p>
            <ul className="list-disc list-inside">
              <li>vs MA21: {fmtPct(current.stretchVsMa21)}</li>
              <li>vs MA50: {fmtPct(current.stretchVsMa50)}</li>
              <li>vs MA200: {fmtPct(current.stretchVsMa200)}</li>
            </ul>
          </div>
          <div>
            <p className="text-[var(--muted)]">Internal MA spreads (today)</p>
            <ul className="list-disc list-inside">
              <li>MA21 vs MA50: {fmtPct(current.spreadMa21VsMa50)} of MA50</li>
              <li>MA50 vs MA200: {fmtPct(current.spreadMa50VsMa200)} of MA200</li>
            </ul>
          </div>
        </div>
        {interpretation.length > 0 && (
          <div className="border-t border-[var(--border)] pt-3 mt-3">
            <p className="text-sm font-medium mb-2">vs prior pullback peaks in this uptrend</p>
            <ul className="text-sm space-y-1 list-disc list-inside text-[var(--muted)]">
              {interpretation.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] p-4 space-y-2">
        <h2 className="font-semibold text-lg">Pullback peaks (this uptrend)</h2>
        <p className="text-sm text-[var(--muted)]">
          Uptrend from <strong>{uptrendStartDatum}</strong> · {pullbackPeaks.length} peak(s) with a meaningful pullback
          after (≥3% dip from high and/or later close below MA21).
        </p>
        <p className="text-xs text-[var(--muted)]">
          Distribution of stretch/spread at those peaks (for context): MA21 {fmtStats(statsAtPeaks.stretchVsMa21)} ·
          MA50 {fmtStats(statsAtPeaks.stretchVsMa50)} · MA200 {fmtStats(statsAtPeaks.stretchVsMa200)} · spread 21/50{" "}
          {fmtStats(statsAtPeaks.spreadMa21VsMa50)} · spread 50/200 {fmtStats(statsAtPeaks.spreadMa50VsMa200)}
        </p>
        {pullbackPeaks.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No peaks matched the rules.</p>
        ) : (
          <div className="max-h-[24rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2 text-left">Peak date</th>
                  <th className="p-2 text-right">Stretch 21</th>
                  <th className="p-2 text-right">Stretch 50</th>
                  <th className="p-2 text-right">Stretch 200</th>
                  <th className="p-2 text-right">Spr 21/50</th>
                  <th className="p-2 text-right">Spr 50/200</th>
                  <th className="p-2 text-right">Drawdown %</th>
                  <th className="p-2 text-left">Tag</th>
                </tr>
              </thead>
              <tbody>
                {pullbackPeaks.map((p) => (
                  <tr key={p.datum} className="border-t border-[var(--border)]">
                    <td className="p-2">{p.datum}</td>
                    <td className="p-2 text-right">{fmtPct(p.stretchVsMa21)}</td>
                    <td className="p-2 text-right">{fmtPct(p.stretchVsMa50)}</td>
                    <td className="p-2 text-right">{fmtPct(p.stretchVsMa200)}</td>
                    <td className="p-2 text-right">{fmtPct(p.spreadMa21VsMa50)}</td>
                    <td className="p-2 text-right">{fmtPct(p.spreadMa50VsMa200)}</td>
                    <td className="p-2 text-right">{fmtPct(p.pullbackDepthPct)}</td>
                    <td className="p-2 text-xs text-[var(--muted)]">{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="text-sm text-[var(--muted)] space-y-1">
        <h3 className="font-medium text-[var(--foreground)]">Method notes</h3>
        <ul className="list-disc list-inside space-y-1">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
