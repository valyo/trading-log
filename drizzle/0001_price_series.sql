CREATE TABLE `price_series` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `slug` text NOT NULL,
  `label` text NOT NULL,
  `source_file` text,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `price_series_slug_unique` ON `price_series` (`slug`);

CREATE TABLE `price_bars` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `series_id` integer NOT NULL,
  `datum` text NOT NULL,
  `open` real,
  `high` real,
  `low` real,
  `close` real NOT NULL,
  `volume` real,
  FOREIGN KEY (`series_id`) REFERENCES `price_series`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `price_bars_series_datum_unique` ON `price_bars` (`series_id`, `datum`);
