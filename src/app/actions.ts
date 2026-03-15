"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { trades, screeningSnapshots, screeningRows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseBrokerCsv } from "@/lib/csv/broker";
import { parseBorsdataCsv } from "@/lib/csv/borsdata";
import type { BrokerRow } from "@/lib/csv/broker";
import { computeMissingResultat } from "@/lib/trades/resultat";

/** Unique key for deduplication: same date + instrument + type + quantity + amount = same trade */
function tradeKey(r: BrokerRow): string {
  return `${r.datum}|${r.vardepapper}|${r.typAvTransaktion}|${r.antal}|${r.belopp}`;
}

export async function importBrokerTrades(csvText: string, source: string) {
  const rows = parseBrokerCsv(csvText);
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const existing = await db.select({
    datum: trades.datum,
    vardepapper: trades.vardepapper,
    typAvTransaktion: trades.typAvTransaktion,
    antal: trades.antal,
    belopp: trades.belopp,
  }).from(trades);
  const existingKeys = new Set(existing.map((t) => `${t.datum}|${t.vardepapper}|${t.typAvTransaktion}|${t.antal}|${t.belopp}`));

  const toInsert = rows.filter((r) => !existingKeys.has(tradeKey(r)));
  if (toInsert.length > 0) {
    await db.insert(trades).values(
      toInsert.map((r) => ({
        datum: r.datum,
        konto: r.konto,
        typAvTransaktion: r.typAvTransaktion,
        vardepapper: r.vardepapper,
        antal: r.antal,
        kurs: r.kurs,
        belopp: r.belopp,
        transaktionsvaluta: r.transaktionsvaluta,
        courtage: r.courtage,
        valutakurs: r.valutakurs,
        instrumentvaluta: r.instrumentvaluta,
        isin: r.isin,
        resultat: r.resultat,
        source,
      }))
    );
    await backfillResultat();
  }
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

/** Recompute missing Resultat for all trades (FIFO per instrument, dividends = Belopp). */
export async function backfillResultat() {
  const all = await db
    .select({
      id: trades.id,
      datum: trades.datum,
      typAvTransaktion: trades.typAvTransaktion,
      vardepapper: trades.vardepapper,
      isin: trades.isin,
      antal: trades.antal,
      belopp: trades.belopp,
      resultat: trades.resultat,
    })
    .from(trades)
    .orderBy(trades.datum, trades.id);
  const updates = computeMissingResultat(all);
  for (const { id, resultat } of updates) {
    await db.update(trades).set({ resultat }).where(eq(trades.id, id));
  }
  return updates.length;
}

export async function recalculateResultat() {
  const count = await backfillResultat();
  redirect(`/trades?recalculated=${count}`);
}

export async function submitBrokerImport(formData: FormData) {
  const file = formData.get("file") as File | null;
  const source = (formData.get("source") as string)?.trim() || (file?.name || "import.csv");
  if (!file?.size) return;
  const text = await file.text();
  const { inserted, skipped } = await importBrokerTrades(text, source);
  const params = new URLSearchParams();
  if (inserted > 0) params.set("inserted", String(inserted));
  if (skipped > 0) params.set("skipped", String(skipped));
  redirect(params.toString() ? `/trades?${params.toString()}` : "/trades");
}

export async function deleteTrade(formData: FormData) {
  const id = formData.get("id");
  if (id == null) return;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return;
  await db.delete(trades).where(eq(trades.id, numId));
  redirect("/trades?deleted=1");
}

export async function importScreeningSnapshot(
  csvText: string,
  snapshotDate: string,
  name?: string
) {
  const rows = parseBorsdataCsv(csvText);
  const [snap] = await db
    .insert(screeningSnapshots)
    .values({ snapshotDate, name: name ?? null })
    .returning({ id: screeningSnapshots.id });
  if (!snap) throw new Error("Failed to create snapshot");
  await db.insert(screeningRows).values(
    rows.map((r) => ({
      snapshotId: snap.id,
      borsdataId: r.borsdataId,
      bolagsnamn: r.bolagsnamn,
      data: r.data as Record<string, string | number | null>,
    }))
  );
  return { snapshotId: snap.id, rowCount: rows.length };
}

export async function submitScreeningImport(formData: FormData) {
  const file = formData.get("file") as File | null;
  const snapshotDate = (formData.get("snapshot_date") as string)?.trim();
  const name = (formData.get("name") as string)?.trim() || undefined;
  if (!file?.size || !snapshotDate) return;
  const text = await file.text();
  await importScreeningSnapshot(text, snapshotDate, name);
  redirect("/screens?imported=1");
}

export async function deleteScreeningSnapshot(formData: FormData) {
  const id = formData.get("id");
  if (id == null) return;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return;
  await db.delete(screeningRows).where(eq(screeningRows.snapshotId, numId));
  await db.delete(screeningSnapshots).where(eq(screeningSnapshots.id, numId));
  redirect("/screens?deleted=1");
}
