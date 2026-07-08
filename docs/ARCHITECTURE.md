# Trend Following Trading – App Architecture

## Goals

1. **Trade log** – Import broker CSVs (e.g. Avanza-style) and manual logs into one unified log.
2. **Performance** – Equity curve, returns, drawdowns, per-instrument P&L.
3. **Screening** – Import Borsdata-style screening CSVs and store by date.
4. **Period comparison** – Compare screening lists between two dates (new/dropped names, rank changes).

---

## Recommended Stack


| Layer        | Choice                                | Why                                                                                    |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------- |
| **Frontend** | Next.js 14+ (App Router) + TypeScript | Single codebase, type safety, Server Components, easy file uploads via Server Actions. |
| **Backend**  | Next.js API routes + Server Actions   | No separate server; uploads and parsing run on the server.                             |
| **Database** | SQLite + Drizzle ORM                  | One file, easy backup, no DB server; Drizzle gives type-safe schema and migrations.    |
| **Charts**   | Recharts or Lightweight Charts        | Good for equity curve and performance.                                                 |
| **CSV**      | PapaParse (or `csv-parse`)            | Handles semicolon/comma, quoted fields, and Swedish number format (e.g. `136,15`).     |


**Alternative:** Python (FastAPI) + React + SQLite if you prefer Pandas for screening comparisons and heavier analytics; the data model below still applies.

---

## Data Model

### 1. Trades (unified log)

Normalize broker CSV into one table. Columns match broker export (transaktioner format).


| Column             | Type     | Notes                                         |
| ------------------ | -------- | --------------------------------------------- |
| id                 | PK       |                                               |
| datum              | date     | Trade date (YYYY-MM-DD).                      |
| konto              | string   | e.g. "Trend".                                 |
| typ_av_transaktion | string   | Köp, Sälj, etc.                               |
| vardepapper        | string   | Instrument name.                              |
| antal              | number   | Signed: negative = sell.                      |
| kurs               | number?  | Price per share.                              |
| belopp             | number   | Cash flow: negative = outflow.                |
| transaktionsvaluta | string   | Transaction currency (SEK, etc.).             |
| courtage           | number?  |                                               |
| valutakurs         | number?  | Exchange rate.                                |
| instrumentvaluta   | string   | Currency the instrument trades in (e.g. EUR). |
| isin               | string?  |                                               |
| resultat           | number?  | Realized P&L.                                 |
| source             | string?  | e.g. filename.                                |
| created_at         | datetime |                                               |


**Import:** Broker CSV (semicolon): Datum, Konto, Typ av transaktion, Värdepapper/beskrivning, Antal, Kurs, Belopp, Transaktionsvaluta, Courtage, Valutakurs, Instrumentvaluta, ISIN, Resultat. Swedish decimals (e.g. `136,15` → 136.15).

### 2. Screening snapshots (Borsdata-style)

One row per imported file = one “snapshot” per date.


| Column        | Type     | Notes                                    |
| ------------- | -------- | ---------------------------------------- |
| id            | PK       |                                          |
| snapshot_date | date     | Date of the screen (e.g. 2026-03-08).    |
| name          | string?  | Optional label (e.g. "Borsdata weekly"). |
| created_at    | datetime |                                          |


### 3. Screening rows (one per stock per snapshot)


| Column      | Type   | Notes                                                                     |
| ----------- | ------ | ------------------------------------------------------------------------- |
| id          | PK     |                                                                           |
| snapshot_id | FK     | → screening_snapshots.                                                    |
| borsdata_id | string | From "Börsdata ID".                                                       |
| bolagsnamn  | string | "Bolagsnamn".                                                             |
| data        | JSON   | **All** original columns stored with original header names (key → value). |


Joining in period comparison uses `borsdata_id` and `bolagsnamn`. No columns are dropped; the full Borsdata export is preserved in `data`.

---

## App Structure (Next.js)

```
/app
  layout.tsx
  page.tsx                    # Dashboard: recent trades, last screen date, quick stats
  /trades
    page.tsx                  # Trade log table (filter by date, instrument, type)
    /import
      page.tsx                # Upload CSV, select format (broker / manual), preview, confirm
  /performance
    page.tsx                  # Equity curve, period returns, drawdown, per-instrument summary
  /screens
    page.tsx                  # List screening snapshots by date
    /import
      page.tsx                # Upload Borsdata CSV, set snapshot date, preview, save
    /compare
      page.tsx                # Pick two snapshot dates → table: name, in A only, in B only, both; rank/metric diff
/components
  TradeTable.tsx
  ScreeningTable.tsx
  ComparisonView.tsx
  EquityCurve.tsx
/lib
  db/
    schema.ts                 # Drizzle schema
    index.ts                  # db client
  csv/
    broker.ts                 # Parse broker CSV (semicolon, Swedish)
    borsdata.ts               # Parse Borsdata CSV (quoted, comma)
    manual-log.ts             # Parse manual trade log
  performance/
    equity.ts                 # Build equity curve from trades
    returns.ts                # Period returns, drawdown
```

---

## Flows

### Trade import

1. User uploads CSV; backend detects or user selects format (broker / manual).
2. Parser returns array of normalized rows (date, type, instrument, quantity, price, amount, currency, courtage, isin/ticker).
3. Show preview table; user confirms.
4. Insert into `trades` with `source` = filename.

### Performance

1. Read `trades` ordered by date.
2. Compute running cash flow and (if needed) position-based equity.
3. For equity curve: cumulative P&L or portfolio value over time.
4. From that, compute period returns and drawdown series for charts.

### Screening import

1. User uploads Borsdata CSV and sets snapshot date (default from filename e.g. `Borsdata_2026-03-08.csv` → 2026-03-08).
2. Parse headers and rows; map to `screening_snapshots` + `screening_rows` (and optional `raw_json`).
3. Save; list appears under Screens.

### Period comparison

1. User selects snapshot A (date) and snapshot B (date).
2. Join on `borsdata_id` (or `name` if ID missing): in A only, in B only, in both.
3. For “in both”, show delta of key metrics (e.g. RS Rank change, 1Y % change).
4. Render table and optional simple charts (e.g. rank distribution).

---

## File Formats Summary


| Source     | Delimiter  | Date       | Numbers | Key columns                                                                 |
| ---------- | ---------- | ---------- | ------- | --------------------------------------------------------------------------- |
| Broker     | `;`        | YYYY-MM-DD | 136,15  | Datum, Typ av transaktion, Värdepapper, Antal, Kurs, Belopp, Courtage, ISIN |
| Manual log | `,`        | YYYY-MM-DD | 281.00  | Date, Ticker, Buy/Sell, Price, Number of shares, Total sum, Courtage        |
| Borsdata   | `,` quoted | —          | 131,0%  | Börsdata ID, Bolagsnamn, RS Rank, Kursutveck. 1år, Kurs/MA 50d, …           |


---

## Implementation Order

1. **Project init** – Next.js, TypeScript, Drizzle, SQLite, PapaParse.
2. **Schema** – `trades`, `screening_snapshots`, `screening_rows`.
3. **Broker CSV import** – Parser + import page + trade list page.
4. **Manual log import** – Parser + same import flow with format selector.
5. **Performance** – Equity curve and basic returns from trades.
6. **Borsdata import** – Parser + screening import page.
7. **Screening list view** – List snapshots, drill into one snapshot.
8. **Compare** – Select two dates, diff table and rank deltas.

This gives you a single web app for logging, performance, and screening comparisons with minimal infrastructure (SQLite file + Next.js).