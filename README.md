# Trend Trading Log

Web app for logging and performance tracking of trend-following trades, plus screening import and period comparison.

## Setup

If you run the app **in Docker** (recommended for this project), skip host `npm install` for day-to-day work and use the Docker section below. The dev container runs `npm install` on startup and keeps `node_modules` in a named volume.

Local (without Docker):

```bash
cd app
npm install
cp .env.example .env
# Edit .env: set NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_GOOGLE_EMAILS
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated visitors are redirected to `/login` and see a gate message; only Google accounts listed in `ALLOWED_GOOGLE_EMAILS` can sign in.

### Auth (Google)

- **Google OAuth**: Create a OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Set authorized redirect URI to `http://localhost:3000/api/auth/callback/google` (dev) or `https://<your-domain>/api/auth/callback/google` (production).
- **NEXTAUTH_SECRET**: Generate with `openssl rand -base64 32`.
- **ALLOWED_GOOGLE_EMAILS**: Comma-separated list of Google emails that may sign in. If empty, all Google sign-ins are allowed (use only for local dev).

## Data

- **Trades**: Broker CSV (semicolon-delimited) with columns: Datum, Konto, Typ av transaktion, Värdepapper/beskrivning, Antal, Kurs, Belopp, Transaktionsvaluta, Courtage, Valutakurs, Instrumentvaluta, ISIN, Resultat.
- **Screening**: Borsdata-style CSV (comma, quoted). All columns are stored with original names. Set snapshot date when importing for period comparison.
- **Price study** (`/stretch`): Import daily OHLC Excel (`.xlsx`) — e.g. `CHEF-Cheffelo.xlsx` — with Date + Close columns (or any sheet where one column parses as dates and another as prices; all tabs are tried). The app computes MA21/50/200, finds pullback peaks in the latest uptrend (since last close ≤ MA200), and compares current stretch and internal MA spreads to those peaks. **After changing import code, restart the dev container** (or run `docker compose … exec app npm install` only when `package.json` changed) so the running app loads the new server code.

Database: SQLite at `app/data/trades.db`. Created automatically on first run (including `price_series` / `price_bars` tables when the app starts).

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

Then edit code on your machine; the app in the container hot-reloads. Request logs appear in the terminal. SQLite DB is in `./data` (bind mount).

**Where `npm install` runs:** The dev image starts with `npm install && npm run dev`, and dependencies live in the Docker volume `app-node-modules` (not on your Mac/Windows `node_modules` next to the repo). You do **not** need to run `npm install` on the host for the containerized app to work.

**Adding or upgrading an npm package:** Edit `package.json` (and commit `package-lock.json` when you regenerate it). Then either restart the dev container so startup runs `npm install` again, or run once inside the container:

```bash
docker compose -f docker-compose.dev.yml exec app npm install
```

For a clean dependency layer, rebuild: `docker compose -f docker-compose.dev.yml build --no-cache` then `up`.

**Production image:** After changing dependencies, run `docker compose up --build` (or `docker build`) so the build stage runs `npm ci` / `npm install` with the updated `package.json`.

- **Must run from `app/`** so the container sees `src/app` at `/app/src/app`. If you see *"Couldn't find any pages or app directory"*, run the command above from the `app` directory (or use `docker compose -f app/docker-compose.dev.yml up` from the repo root so the compose file dir is `app/`).
- Do not set `NODE_ENV` in `.env`; the dev compose sets `NODE_ENV=development`. A non-standard `NODE_ENV` can trigger Next.js warnings.

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

