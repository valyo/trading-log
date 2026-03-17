/// <reference path="../../jsx.d.ts" />
import { db } from "@/lib/db";
import { trades, type Trade } from "@/lib/db/schema";
import { buildEquityCurve, buildDrawdown } from "@/lib/performance/equity";
import Link from "next/link";
import { EquityChart } from "./EquityChart";

export const dynamic = "force-dynamic";

const SORT_KEYS = ["gainPct", "datum", "vardepapper", "cost", "resultat"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const DEFAULT_SORT: SortKey = "gainPct";
const DEFAULT_ORDER = "desc";

function isValidSortKey(s: string | undefined): s is SortKey {
  return s !== undefined && SORT_KEYS.includes(s as SortKey);
}

function formatNum(value: number | null | undefined): string {
  if (value == null) return "—";
  return Number(value).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isSell(t: Trade): boolean {
  return t.typAvTransaktion.toLowerCase().includes("sälj");
}

function isDividend(t: Trade): boolean {
  const typ = t.typAvTransaktion.toLowerCase();
  return typ.includes("utdelning") || typ.includes("dividend");
}

/** Buy that adds to cost basis (exclude transfers, splits). */
function isCostBuy(t: Trade): boolean {
  const typ = t.typAvTransaktion.toLowerCase();
  if (typ.includes("insättning") || typ.includes("uttag") || typ.includes("split")) return false;
  return typ.includes("köp");
}

/** Sort trades by date, then buys before sells on same day (so same-day round-trips match). */
function sortTradesChronological(a: Trade, b: Trade): number {
  const d = a.datum.localeCompare(b.datum);
  if (d !== 0) return d;
  const order = (t: Trade) => (isCostBuy(t) ? 0 : isSell(t) ? 1 : 2);
  const o = order(a) - order(b);
  return o !== 0 ? o : a.id - b.id;
}

/**
 * One row per closed round-trip: one buy→dividends→sell sequence. totalCost = cost of
 * shares sold (FIFO), totalResult = proceeds + dividends in holding period - totalCost.
 */
type InstrumentRow = {
  vardepapper: string;
  totalResult: number;
  totalCost: number;
  gainPct: number | null;
  lastSellDatum: string;
  lastSellId: number;
};

type OpenPositionRow = {
  vardepapper: string;
  totalQuantity: number;
  totalCost: number;
};

/** FIFO lot for open position cost. */
type Lot = { qty: number; cost: number };

/**
 * One row per open instrument: sum(antal) > 0. Total cost = FIFO cost basis of shares
 * currently held (only buys that haven't been sold yet). Quantity excludes dividends.
 */
function buildOpenPositionRows(tradesList: Trade[]): OpenPositionRow[] {
  const byVardepapper = new Map<string, Trade[]>();
  for (const t of tradesList) {
    const arr = byVardepapper.get(t.vardepapper) ?? [];
    arr.push(t);
    byVardepapper.set(t.vardepapper, arr);
  }
  const rows: OpenPositionRow[] = [];
  for (const [vardepapper, list] of byVardepapper) {
    const sorted = [...list].sort(sortTradesChronological);
    const lots: Lot[] = [];
    for (const t of sorted) {
      if (isDividend(t)) continue;
      const qty = t.antal ?? 0;
      if (isCostBuy(t) && t.belopp != null && t.belopp < 0 && qty > 0) {
        lots.push({ qty, cost: -t.belopp });
        continue;
      }
      if (isSell(t) && qty < 0) {
        let toSell = -qty;
        while (toSell >= 1e-6 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(toSell, lot.qty);
          const costPerShare = lot.qty >= 1e-6 ? lot.cost / lot.qty : 0;
          lot.cost -= costPerShare * take;
          lot.qty -= take;
          toSell -= take;
          if (lot.qty < 1e-6) lots.shift();
        }
      }
    }
    const totalQuantity = lots.reduce((s, l) => s + l.qty, 0);
    const totalCost = lots.reduce((s, l) => s + l.cost, 0);
    if (totalQuantity > 0) {
      rows.push({ vardepapper, totalQuantity, totalCost });
    }
  }
  return rows.sort((a, b) => b.totalCost - a.totalCost);
}

/** FIFO lot with buy date for dividend allocation. */
type LotWithDate = { qty: number; cost: number; date: string };

/**
 * One row per closed round-trip (buy → dividends → sell). For each sell we compute
 * cost of shares sold (FIFO), add dividends in the holding period (earliest buy date
 * of sold shares < div date <= sell date), result = proceeds + dividends - cost.
 */
function buildInstrumentRows(tradesList: Trade[]): InstrumentRow[] {
  const byVardepapper = new Map<string, Trade[]>();
  for (const t of tradesList) {
    const arr = byVardepapper.get(t.vardepapper) ?? [];
    arr.push(t);
    byVardepapper.set(t.vardepapper, arr);
  }

  const rows: InstrumentRow[] = [];
  for (const [vardepapper, list] of byVardepapper) {
    const sorted = [...list].sort(sortTradesChronological);
    const dividends: { date: string; belopp: number }[] = [];
    const lots: LotWithDate[] = [];

    for (const t of sorted) {
      if (isDividend(t) && t.belopp != null) {
        dividends.push({ date: t.datum, belopp: t.belopp });
        continue;
      }
      const qty = t.antal ?? 0;
      if (isCostBuy(t) && t.belopp != null && t.belopp < 0 && qty > 0) {
        lots.push({ qty, cost: -t.belopp, date: t.datum });
        continue;
      }
      if (isSell(t) && qty < 0) {
        let toSell = -qty;
        let costSold = 0;
        let earliestBuyDate = "";
        while (toSell >= 1e-6 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(toSell, lot.qty);
          const costPerShare = lot.qty >= 1e-6 ? lot.cost / lot.qty : 0;
          costSold += costPerShare * take;
          if (earliestBuyDate === "" || lot.date < earliestBuyDate) earliestBuyDate = lot.date;
          lot.cost -= costPerShare * take;
          lot.qty -= take;
          toSell -= take;
          if (lot.qty < 1e-6) lots.shift();
        }
        const proceeds = t.belopp ?? 0;
        // Dividends in holding period (after earliest buy of sold shares, on or before sell date)
        let dividendsInPeriod = 0;
        for (let i = dividends.length - 1; i >= 0; i--) {
          const d = dividends[i];
          if (d.date > earliestBuyDate && d.date <= t.datum) {
            dividendsInPeriod += d.belopp;
            dividends.splice(i, 1);
          }
        }
        const totalResult = proceeds + dividendsInPeriod - costSold;
        const gainPct = costSold >= 1e-9 ? (totalResult / costSold) * 100 : null;
        rows.push({
          vardepapper,
          totalResult,
          totalCost: costSold,
          gainPct,
          lastSellDatum: t.datum,
          lastSellId: t.id,
        });
      }
    }
  }
  return rows;
}

const AVANZA_SCREENER = "https://www.avanza.se/aktier/handla.html/screener";
function avanzaScreenerUrl(instrument: string): string {
  const nq = encodeURIComponent(instrument.trim());
  return nq ? `${AVANZA_SCREENER}?s=oneDayChangePercent.desc&o=0&nq=${nq}` : AVANZA_SCREENER;
}

function sortInstrumentRows(rows: InstrumentRow[], sortBy: SortKey, order: "asc" | "desc"): InstrumentRow[] {
  const mult = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "gainPct": {
        const ga = a.gainPct ?? -Infinity;
        const gb = b.gainPct ?? -Infinity;
        cmp = ga - gb || a.lastSellId - b.lastSellId;
        break;
      }
      case "datum":
        cmp = a.lastSellDatum.localeCompare(b.lastSellDatum) || a.lastSellId - b.lastSellId;
        break;
      case "vardepapper":
        cmp = a.vardepapper.localeCompare(b.vardepapper) || a.lastSellDatum.localeCompare(b.lastSellDatum);
        break;
      case "cost":
        cmp = a.totalCost - b.totalCost || a.lastSellId - b.lastSellId;
        break;
      case "resultat":
        cmp = a.totalResult - b.totalResult || a.lastSellId - b.lastSellId;
        break;
      default:
        cmp = a.lastSellDatum.localeCompare(b.lastSellDatum) || a.lastSellId - b.lastSellId;
    }
    return mult * cmp;
  });
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; order?: string }>;
}) {
  const { sort: sortParam, order: orderParam } = await searchParams;
  const sortBy = isValidSortKey(sortParam) ? sortParam : DEFAULT_SORT;
  const order = orderParam === "asc" || orderParam === "desc" ? orderParam : DEFAULT_ORDER;

  const tradesList = await db.select().from(trades).orderBy(trades.datum);
  const openRows = buildOpenPositionRows(tradesList);
  const instrumentRows = buildInstrumentRows(tradesList);
  const sortedRows = sortInstrumentRows(instrumentRows, sortBy, order);
  const equity = buildEquityCurve(tradesList);
  const drawdown = buildDrawdown(equity);

  const totalResult = equity.length > 0 ? equity[equity.length - 1].cumulativeResult : 0;
  const maxDrawdown =
    drawdown.length > 0 ? Math.min(...drawdown.map((d) => d.drawdown)) : 0;

  function sortHref(key: SortKey): string {
    const nextOrder = key === sortBy && order === "desc" ? "asc" : "desc";
    return `/performance?sort=${key}&order=${nextOrder}`;
  }

  const sortLabel: Record<SortKey, string> = {
    gainPct: "Gain %",
    datum: "Datum",
    vardepapper: "Värdepapper",
    cost: "Kostnad",
    resultat: "Resultat",
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Performance</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--muted)]">Cumulative result (realized)</p>
          <p className="text-xl font-semibold">
            {totalResult >= 0 ? "" : "−"}
            {Math.abs(totalResult).toLocaleString("sv-SE", { minimumFractionDigits: 2 })} SEK
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--muted)]">Largest drawdown (approx)</p>
          <p className="text-xl font-semibold">{maxDrawdown.toFixed(1)} %</p>
        </div>
      </div>
      {equity.length > 0 ? (
        <section>
          <h2 className="font-semibold text-lg mb-4">Equity curve (cumulative result)</h2>
          <EquityChart data={equity} />
        </section>
      ) : (
        <p className="text-[var(--muted)]">
          Import transactions to see the equity curve.
        </p>
      )}

      <section>
        <h2 className="font-semibold text-lg mb-2">Open positions</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          {openRows.length === 0
            ? "No open positions."
            : `${openRows.length} open position${openRows.length === 1 ? "" : "s"} · Total invested: ${openRows
                .reduce((s, r) => s + r.totalCost, 0)
                .toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SEK`}
        </p>
        <div className="max-h-[20rem] overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="p-3 text-left">Värdepapper</th>
                <th className="p-3 text-right">Antal</th>
                <th className="p-3 text-right">Kostnad</th>
              </tr>
            </thead>
            <tbody>
              {openRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-[var(--muted)]">
                    No open positions.
                  </td>
                </tr>
              ) : (
                openRows.map((row: OpenPositionRow) => (
                  <tr
                    key={row.vardepapper}
                    className="border-t border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="p-3">
                      <a
                        href={avanzaScreenerUrl(row.vardepapper)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--primary)] hover:underline"
                      >
                        {row.vardepapper}
                      </a>
                    </td>
                    <td className="p-3 text-right">
                      {row.totalQuantity.toLocaleString("sv-SE", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right">{formatNum(row.totalCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-4">Closed positions (one row per stock, splits and dividends included)</h2>
        <div className="max-h-[28rem] overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                {(SORT_KEYS as readonly SortKey[]).map((key) => (
                  <th
                    key={key}
                    className={key === "cost" || key === "resultat" || key === "gainPct" ? "p-3 text-right" : "p-3 text-left"}
                  >
                    <Link
                      href={sortHref(key)}
                      className="inline-flex items-center gap-1 font-medium hover:text-[var(--primary)]"
                    >
                      {sortLabel[key]}
                      {sortBy === key && (order === "asc" ? " ↑" : " ↓")}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={SORT_KEYS.length} className="p-6 text-center text-[var(--muted)]">
                    No closed positions. One row per stock with total result (sells + dividends).
                  </td>
                </tr>
              ) : (
                sortedRows.map((row: InstrumentRow) => {
                  const gp = row.gainPct;
                  return (
                    <tr
                      key={`${row.vardepapper}-${row.lastSellDatum}-${row.lastSellId}`}
                      className="border-t border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="p-3 text-right">
                        {gp != null ? `${gp >= 0 ? "" : "−"}${Math.abs(gp).toFixed(1)} %` : "—"}
                      </td>
                      <td className="p-3">{row.lastSellDatum}</td>
                      <td className="p-3">
                        <a
                          href={avanzaScreenerUrl(row.vardepapper)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--primary)] hover:underline"
                        >
                          {row.vardepapper}
                        </a>
                      </td>
                      <td className="p-3 text-right">{formatNum(row.totalCost)}</td>
                      <td className="p-3 text-right">{formatNum(row.totalResult)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p>
        <Link href="/trades" className="text-[var(--primary)] hover:underline">
          View transactions →
        </Link>
      </p>
    </div>
  );
}
