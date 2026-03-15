# Trend Trading Log

Web app for logging and performance tracking of trend-following trades, plus screening import and period comparison.

## Setup

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data

- **Trades**: Broker CSV (semicolon-delimited) with columns: Datum, Konto, Typ av transaktion, Värdepapper/beskrivning, Antal, Kurs, Belopp, Transaktionsvaluta, Courtage, Valutakurs, Instrumentvaluta, ISIN, Resultat.
- **Screening**: Borsdata-style CSV (comma, quoted). All columns are stored with original names. Set snapshot date when importing for period comparison.

Database: SQLite at `app/data/trades.db`. Created automatically on first run.

## Docker

**Production (build + run):**
```bash
cd app
docker compose up --build
```

**Development (hot-reload, no rebuild on code change):**
```bash
cd app
docker compose -f docker-compose.dev.yml up --build -d
```
Then edit code on your machine; the app in the container hot-reloads. Request logs appear in the terminal. First `--build` installs deps; after that, saving files is enough. SQLite DB is in `./data` (bind mount).

App: [http://localhost:3000](http://localhost:3000).

Build image only (production):
```bash
docker build -t trades-app .
docker run -p 3000:3000 -v trades-data:/app/data trades-app
```

## Scripts

- `npm run dev` – development server
- `npm run build` / `npm run start` – production
- `npm run db:generate` – generate Drizzle migrations from schema
- `npm run db:studio` – open Drizzle Studio (if needed)
