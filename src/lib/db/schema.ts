import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

/**
 * Trades – unified log from broker CSV (transaktioner format).
 * Columns match broker export: Datum, Konto, Typ, Värdepapper, Antal, Kurs, Belopp,
 * Transaktionsvaluta, Courtage, Valutakurs, Instrumentvaluta, ISIN, Resultat.
 */
export const trades = sqliteTable("trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  datum: text("datum").notNull(), // YYYY-MM-DD
  konto: text("konto").notNull(),
  typAvTransaktion: text("typ_av_transaktion").notNull(), // Köp | Sälj | etc.
  vardepapper: text("vardepapper").notNull(),
  antal: real("antal").notNull(), // signed: negative = sell
  kurs: real("kurs"), // price per share, null for some dividends
  belopp: real("belopp").notNull(), // cash flow: negative = outflow
  transaktionsvaluta: text("transaktionsvaluta").notNull(),
  courtage: real("courtage"),
  valutakurs: real("valutakurs"),
  instrumentvaluta: text("instrumentvaluta").notNull(),
  isin: text("isin"),
  resultat: real("resultat"),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

/**
 * Screening snapshot = one imported Borsdata (or similar) file per date.
 */
export const screeningSnapshots = sqliteTable("screening_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

/**
 * One row per stock per snapshot. All original screening columns are stored in `data` (JSON)
 * with original column names. borsdataId and bolagsnamn are extracted for joining in comparisons.
 */
export const screeningRows = sqliteTable("screening_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => screeningSnapshots.id, { onDelete: "cascade" }),
  borsdataId: text("borsdata_id").notNull(),
  bolagsnamn: text("bolagsnamn").notNull(),
  data: text("data", { mode: "json" }).$type<Record<string, string | number | null>>().notNull(),
});

export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type ScreeningSnapshot = typeof screeningSnapshots.$inferSelect;
export type NewScreeningSnapshot = typeof screeningSnapshots.$inferInsert;
export type ScreeningRow = typeof screeningRows.$inferSelect;
export type NewScreeningRow = typeof screeningRows.$inferInsert;
