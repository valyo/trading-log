/**
 * Compute missing Resultat (realized P&L) for trades using FIFO cost basis.
 * Sells: Resultat = Belopp (proceeds) - cost of shares sold (FIFO from buys).
 * Dividends / utdelning: Resultat = Belopp (income).
 */

export type TradeForResultat = {
  id: number;
  datum: string;
  typAvTransaktion: string;
  vardepapper: string;
  isin: string | null;
  antal: number;
  belopp: number;
  resultat: number | null;
};

type Lot = { quantity: number; costTotal: number };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function instrumentKey(t: TradeForResultat): string {
  return `${t.vardepapper}|${t.isin ?? ""}`;
}

/** Normalize transaction type to buy/sell/dividend */
function tradeKind(typ: string): "buy" | "sell" | "dividend" {
  const u = typ.trim().toLowerCase();
  if (u === "köp" || u === "buy") return "buy";
  if (u === "sälj" || u === "sell") return "sell";
  if (u.includes("utdelning") || u.includes("dividend") || u.includes("divident")) return "dividend";
  return "buy"; // fallback
}

/** Sort by date, then buys before sells on same day (so same-day round-trips match). */
function sortChronological(a: TradeForResultat, b: TradeForResultat): number {
  const d = a.datum.localeCompare(b.datum);
  if (d !== 0) return d;
  const order = (t: TradeForResultat) =>
    tradeKind(t.typAvTransaktion) === "buy" ? 0 : tradeKind(t.typAvTransaktion) === "sell" ? 1 : 2;
  const o = order(a) - order(b);
  return o !== 0 ? o : a.id - b.id;
}

/**
 * For a list of trades (same instrument, sorted by datum then id), compute Resultat
 * for sells and dividends that have null Resultat. Returns { id, resultat }[].
 */
function computeForInstrument(sortedTrades: TradeForResultat[]): { id: number; resultat: number }[] {
  const updates: { id: number; resultat: number }[] = [];
  const lots: Lot[] = [];

  for (const t of sortedTrades) {
    const kind = tradeKind(t.typAvTransaktion);

    if (kind === "buy") {
      const qty = t.antal;
      const costTotal = -t.belopp; // belopp is negative for buy
      if (qty > 0 && costTotal > 0) {
        lots.push({ quantity: qty, costTotal });
      }
      continue;
    }

    if (kind === "dividend") {
      if (t.belopp != null) {
        updates.push({ id: t.id, resultat: round2(t.belopp) });
      }
      continue;
    }

    if (kind === "sell") {
      let toSell = Math.abs(t.antal);
      const proceeds = t.belopp; // positive for sell
      let costSold = 0;

      while (toSell > 0 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(toSell, lot.quantity);
        const costPerShare = lot.costTotal / lot.quantity;
        costSold += take * costPerShare;
        lot.quantity -= take;
        lot.costTotal -= take * costPerShare;
        toSell -= take;
        if (lot.quantity <= 0) lots.shift();
      }

      const resultat = round2(proceeds - costSold);
      updates.push({ id: t.id, resultat });
    }
  }

  return updates;
}

/**
 * Given full list of trades (with id, datum, typAvTransaktion, vardepapper, isin, antal, belopp, resultat),
 * return list of { id, resultat } to update for trades that had null resultat.
 */
export function computeMissingResultat(tradesList: TradeForResultat[]): { id: number; resultat: number }[] {
  const byInstrument = new Map<string, TradeForResultat[]>();
  for (const t of tradesList) {
    const key = instrumentKey(t);
    if (!byInstrument.has(key)) byInstrument.set(key, []);
    byInstrument.get(key)!.push(t);
  }

  const allUpdates: { id: number; resultat: number }[] = [];
  byInstrument.forEach((list) => {
    const sorted = [...list].sort(sortChronological);
    allUpdates.push(...computeForInstrument(sorted));
  });
  return allUpdates;
}
