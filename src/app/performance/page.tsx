/// <reference path="../../jsx.d.ts" />
import { db } from "@/lib/db";
import { trades, type Trade } from "@/lib/db/schema";
import { buildEquityCurve, buildDrawdown } from "@/lib/performance/equity";
import { isDividendPoolType } from "@/lib/trades/dividendPool";
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
  return isDividendPoolType(t.typAvTransaktion);
}

/** Buy that adds to cost basis (exclude transfers, splits). */
function isCostBuy(t: Trade): boolean {
  const typ = t.typAvTransaktion.toLowerCase();
  if (typ.includes("insättning") || typ.includes("uttag") || typ.includes("split")) return false;
  return typ.includes("köp");
}

/** Avanza: "Split nytt värdepapper" — negative antal removes old ISIN shares, positive adds new ISIN; cost basis unchanged. */
function isSplitNewInstrument(t: Trade): boolean {
  const typ = t.typAvTransaktion.toLowerCase();
  return typ.includes("split") && typ.includes("nytt");
}

/** Map ISIN → stock name from Köp/Sälj so pre/post-split ISINs (same name) share one FIFO chain; källskatt matches via ISIN. */
function buildIsinToStockName(tradesList: Trade[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of tradesList) {
    const isin = t.isin?.trim();
    if (!isin) continue;
    if (isCostBuy(t) || isSell(t)) {
      m.set(isin, t.vardepapper);
    }
  }
  return m;
}

function positionGroupKey(t: Trade, isinToStockName: Map<string, string>): string {
  const isin = t.isin?.trim();
  if (isin && isinToStockName.has(isin)) {
    return `name:${isinToStockName.get(isin)!}`;
  }
  return `name:${t.vardepapper}`;
}

/** Sort trades by date, then buys before sells on same day (so same-day round-trips match). */
function sortTradesChronological(a: Trade, b: Trade): number {
  const d = a.datum.localeCompare(b.datum);
  if (d !== 0) return d;
  const order = (t: Trade) => {
    if (isCostBuy(t)) return 0;
    if (isSell(t)) return 1;
    if (isSplitNewInstrument(t)) {
      const q = t.antal ?? 0;
      return q < 0 ? 2 : 3; // old ISIN out before new ISIN in
    }
    return 4;
  };
  const o = order(a) - order(b);
  return o !== 0 ? o : a.id - b.id;
}

/** Label for UI: first Köp/Sälj name in the group (not dividend description lines). */
function displayVardepapperFromGroup(sorted: Trade[]): string {
  for (const t of sorted) {
    if (isCostBuy(t) || isSell(t)) return t.vardepapper;
  }
  return sorted[0]?.vardepapper ?? "";
}

/** Rows that never affect share quantity / FIFO lots (dividends, tax, withholding). */
function isNonInstrumentQtyRow(t: Trade): boolean {
  return isDividendPoolType(t.typAvTransaktion);
}

/** Cash pool for closed-position math: dividend + withholding + dividend tax (Belopp). */
function isDividendPoolCashflow(t: Trade): boolean {
  return isDividendPoolType(t.typAvTransaktion) && t.belopp != null;
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
  totalCourtage: number;
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
  const isinToStockName = buildIsinToStockName(tradesList);
  const byGroup = new Map<string, Trade[]>();
  for (const t of tradesList) {
    const key = positionGroupKey(t, isinToStockName);
    const arr = byGroup.get(key) ?? [];
    arr.push(t);
    byGroup.set(key, arr);
  }
  const rows: OpenPositionRow[] = [];
  for (const [, list] of byGroup) {
    const sorted = [...list].sort(sortTradesChronological);
    const vardepapper = displayVardepapperFromGroup(sorted);
    const lots: Lot[] = [];
    let splitPendingBasis = 0;
    for (const t of sorted) {
      if (isNonInstrumentQtyRow(t)) continue;
      const qty = t.antal ?? 0;
      if (isSplitNewInstrument(t)) {
        if (qty < 0) {
          let toRemove = -qty;
          let basisOut = 0;
          while (toRemove >= 1e-6 && lots.length > 0) {
            const lot = lots[0];
            const take = Math.min(toRemove, lot.qty);
            const costPerShare = lot.qty >= 1e-9 ? lot.cost / lot.qty : 0;
            basisOut += costPerShare * take;
            lot.cost -= costPerShare * take;
            lot.qty -= take;
            toRemove -= take;
            if (lot.qty < 1e-6) lots.shift();
          }
          splitPendingBasis += basisOut;
        } else if (qty > 0 && splitPendingBasis > 1e-9) {
          lots.push({ qty, cost: splitPendingBasis });
          splitPendingBasis = 0;
        }
        continue;
      }
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

/** FIFO lot with buy date and courtage for dividend allocation and courtage rollup. */
type LotWithDate = { qty: number; cost: number; date: string; courtage: number };

/**
 * One row per closed round-trip (buy → dividends → sell). For each sell we compute
 * cost of shares sold (FIFO), add dividends in the holding period (earliest buy date
 * of sold shares < div date <= sell date), result = proceeds + dividends - cost.
 */
function buildInstrumentRows(tradesList: Trade[]): InstrumentRow[] {
  const isinToStockName = buildIsinToStockName(tradesList);
  const byGroup = new Map<string, Trade[]>();
  for (const t of tradesList) {
    const key = positionGroupKey(t, isinToStockName);
    const arr = byGroup.get(key) ?? [];
    arr.push(t);
    byGroup.set(key, arr);
  }

  const rows: InstrumentRow[] = [];
  for (const [, list] of byGroup) {
    const sorted = [...list].sort(sortTradesChronological);
    const vardepapper = displayVardepapperFromGroup(sorted);
    const dividends: { date: string; belopp: number; courtage: number }[] = [];
    const lots: LotWithDate[] = [];
    const groupRows: InstrumentRow[] = [];
    let splitPendingBasis = 0;
    /** Earliest buy date of shares moved in a split (for dividend window after split-in). */
    let splitPendingMinBuyDate = "";

    for (const t of sorted) {
      if (isDividendPoolCashflow(t)) {
        dividends.push({ date: t.datum, belopp: t.belopp, courtage: t.courtage ?? 0 });
        continue;
      }
      const qty = t.antal ?? 0;
      if (isSplitNewInstrument(t)) {
        if (qty < 0) {
          let toRemove = -qty;
          let basisOut = 0;
          while (toRemove >= 1e-6 && lots.length > 0) {
            const lot = lots[0];
            const take = Math.min(toRemove, lot.qty);
            const costPerShare = lot.qty >= 1e-9 ? lot.cost / lot.qty : 0;
            basisOut += costPerShare * take;
            if (take >= 1e-6) {
              if (!splitPendingMinBuyDate || lot.date < splitPendingMinBuyDate) {
                splitPendingMinBuyDate = lot.date;
              }
            }
            lot.cost -= costPerShare * take;
            lot.qty -= take;
            toRemove -= take;
            if (lot.qty < 1e-6) lots.shift();
          }
          splitPendingBasis += basisOut;
        } else if (qty > 0 && splitPendingBasis > 1e-9) {
          lots.push({
            qty,
            cost: splitPendingBasis,
            date: splitPendingMinBuyDate || t.datum,
            courtage: 0,
          });
          splitPendingBasis = 0;
          splitPendingMinBuyDate = "";
        }
        continue;
      }
      if (isCostBuy(t) && t.belopp != null && t.belopp < 0 && qty > 0) {
        lots.push({ qty, cost: -t.belopp, date: t.datum, courtage: t.courtage ?? 0 });
        continue;
      }
      if (isSell(t) && qty < 0) {
        let toSell = -qty;
        let costSold = 0;
        let earliestBuyDate = "";
        let courtageFromLots = 0;
        while (toSell >= 1e-6 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(toSell, lot.qty);
          const costPerShare = lot.qty >= 1e-6 ? lot.cost / lot.qty : 0;
          costSold += costPerShare * take;
          if (earliestBuyDate === "" || lot.date < earliestBuyDate) earliestBuyDate = lot.date;
          if (take >= 1e-6) {
            courtageFromLots += lot.courtage;
            lot.courtage = 0; // avoid double-count if we hit this lot again in a later iteration
          }
          lot.cost -= costPerShare * take;
          lot.qty -= take;
          toSell -= take;
          if (lot.qty < 1e-6) lots.shift();
        }
        const proceeds = t.belopp ?? 0;
        // Dividends in holding period (after earliest buy of sold shares, on or before sell date)
        let dividendsInPeriod = 0;
        let courtageFromDividends = 0;
        for (let i = dividends.length - 1; i >= 0; i--) {
          const d = dividends[i];
          if (d.date > earliestBuyDate && d.date <= t.datum) {
            dividendsInPeriod += d.belopp;
            courtageFromDividends += d.courtage;
            dividends.splice(i, 1);
          }
        }
        const totalResult = proceeds + dividendsInPeriod - costSold;
        const gainPct = costSold >= 1e-9 ? (totalResult / costSold) * 100 : null;
        const totalCourtage = (t.courtage ?? 0) + courtageFromLots + courtageFromDividends;
        groupRows.push({
          vardepapper,
          totalResult,
          totalCost: costSold,
          gainPct,
          lastSellDatum: t.datum,
          lastSellId: t.id,
          totalCourtage,
        });
      }
    }

    // Dividend / tax rows dated after the last sell still belong to that closed lot (broker order).
    if (dividends.length > 0 && groupRows.length > 0) {
      const last = groupRows[groupRows.length - 1];
      let orphanBelopp = 0;
      let orphanCourtage = 0;
      for (const d of dividends) {
        orphanBelopp += d.belopp;
        orphanCourtage += d.courtage;
      }
      last.totalResult += orphanBelopp;
      last.totalCourtage += orphanCourtage;
      last.gainPct =
        last.totalCost >= 1e-9 ? (last.totalResult / last.totalCost) * 100 : null;
    }

    rows.push(...groupRows);
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
        <p className="text-sm text-[var(--muted)] mb-2">
          {sortedRows.length} closed position{sortedRows.length !== 1 ? "s" : ""}.
          Total courtage paid: {formatNum(sortedRows.reduce((s, r) => s + r.totalCourtage, 0))}.
        </p>
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
