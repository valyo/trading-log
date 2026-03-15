CREATE TABLE IF NOT EXISTS `trades` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `datum` text NOT NULL,
  `konto` text NOT NULL,
  `typ_av_transaktion` text NOT NULL,
  `vardepapper` text NOT NULL,
  `antal` real NOT NULL,
  `kurs` real,
  `belopp` real NOT NULL,
  `transaktionsvaluta` text NOT NULL,
  `courtage` real,
  `valutakurs` real,
  `instrumentvaluta` text NOT NULL,
  `isin` text,
  `resultat` real,
  `source` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `screening_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `snapshot_date` text NOT NULL,
  `name` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `screening_rows` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `snapshot_id` integer NOT NULL REFERENCES screening_snapshots(id) ON DELETE CASCADE,
  `borsdata_id` text NOT NULL,
  `bolagsnamn` text NOT NULL,
  `data` text NOT NULL
);
