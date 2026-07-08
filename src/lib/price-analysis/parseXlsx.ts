import * as XLSX from "xlsx";

export type ParsedBar = {
  datum: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e");
}

/** YYYY-MM-DD from Date, Excel serial, or common string formats (incl. EU d/m/y). */
function cellToIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial day count (modern sheets are ~30000–50000+); avoid stock prices as “dates”
    const serial = Math.round(v);
    if (serial >= 30000 && serial < 120000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + serial * 86400000);
      const y = d.getUTCFullYear();
      if (y >= 1980 && y <= 2100) return d.toISOString().slice(0, 10);
    }
    return null;
  }
  let s = String(v).trim();
  // Swedish text dates: "8 april 2026", "08 apr 2026"
  const svMonth = new Map<string, string>([
    ["januari", "01"],
    ["jan", "01"],
    ["februari", "02"],
    ["feb", "02"],
    ["mars", "03"],
    ["mar", "03"],
    ["april", "04"],
    ["apr", "04"],
    ["maj", "05"],
    ["juni", "06"],
    ["juli", "07"],
    ["augusti", "08"],
    ["aug", "08"],
    ["september", "09"],
    ["sep", "09"],
    ["sept", "09"],
    ["oktober", "10"],
    ["okt", "10"],
    ["november", "11"],
    ["nov", "11"],
    ["december", "12"],
    ["dec", "12"],
  ]);
  const sv = s
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .match(/^(\d{1,2})[.\s-]+([a-zåäö]+)\.?[.\s-]+(\d{4})\b/);
  if (sv) {
    const mo = svMonth.get(sv[2]);
    if (mo) return `${sv[3]}-${mo}-${sv[1].padStart(2, "0")}`;
  }
  // "20240115"
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  // "2024-01-15 00:00:00" or ISO prefix
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // YYYY.MM.DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (European)
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  // DD/MM/YY
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})\b/);
  if (m) {
    let y = parseInt(m[3], 10);
    y += y >= 70 ? 1900 : 2000;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // US M/D/YY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v).trim();
  // Swedish thousands: "1 234,56"
  s = s.replace(/\s/g, "").replace(/\u00a0/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const DATE_HEADER_CANDIDATES = [
  "handelsdag",
  "kursdatum",
  "noteringsdag",
  "timestamp",
  "datum",
  "date",
  "dags",
  "day",
  "time",
  "tid",
];

const CLOSE_HEADER_CANDIDATES = [
  "close",
  "adj close",
  "adjusted close",
  "closing price",
  "closing",
  "sista",
  "stängning",
  "stangning",
  "last",
  "slutkurs",
  "senaste",
  "kursslut",
  "close price",
  "slutpris",
  "close adj",
  "utveckling sista",
  "sista kurs",
];

function pickColumn(headers: string[], candidates: string[]): number | null {
  const norm = headers.map(normalizeHeader);
  const sorted = [...candidates].sort(
    (a, b) => normalizeHeader(b).length - normalizeHeader(a).length
  );
  for (const c of sorted) {
    const cn = normalizeHeader(c);
    const i = norm.findIndex((h) => {
      if (!h) return false;
      if (h === cn) return true;
      if (h.startsWith(cn + " ")) return true;
      if (cn.length >= 5 && h.includes(cn)) return true;
      return false;
    });
    if (i >= 0) return i;
  }
  return null;
}

function countValidBarsWithDistinct(
  rows: unknown[][],
  headerRowIndex: number,
  dateIdx: number,
  closeIdx: number,
  maxRows: number
): { n: number; distinctDates: number } {
  const dates = new Set<string>();
  let n = 0;
  const end = Math.min(rows.length, headerRowIndex + 1 + maxRows);
  for (let r = headerRowIndex + 1; r < end; r++) {
    const row = rows[r];
    if (!row) continue;
    const datum = cellToIsoDate(row[dateIdx]);
    const close = toNum(row[closeIdx]);
    if (datum && close != null && close > 0) {
      n++;
      dates.add(datum);
    }
  }
  return { n, distinctDates: dates.size };
}

type ColumnLayout = {
  /** First row index that contains a data bar (not the header line). */
  dataStartRow: number;
  headers: string[];
  dateIdx: number;
  closeIdx: number;
};

/**
 * First row with both date + close headers that yields the most valid data rows wins.
 * Handles title rows above the real header.
 */
function findBestHeaderRow(rows: unknown[][]): ColumnLayout | null {
  let best: {
    score: number;
    headerRowIndex: number;
    headers: string[];
    dateIdx: number;
    closeIdx: number;
  } | null = null;
  const scan = Math.min(120, rows.length);
  for (let hi = 0; hi < scan; hi++) {
    const raw = rows[hi];
    if (!raw) continue;
    const headers = raw.map((c) => String(c ?? ""));
    const dateIdx = pickColumn(headers, DATE_HEADER_CANDIDATES);
    const closeIdx = pickColumn(headers, CLOSE_HEADER_CANDIDATES);
    if (dateIdx == null || closeIdx == null || dateIdx === closeIdx) continue;
    const { n, distinctDates } = countValidBarsWithDistinct(rows, hi, dateIdx, closeIdx, 200);
    if (n === 0) continue;
    // Need enough rows to trust header match (avoids accidental “Datum”+“Senaste” on a summary block)
    if (n < 5) continue;
    // Reject “as of” / report date columns: many rows but one calendar day
    if (distinctDates < 5 && n > 25) continue;
    const score = distinctDates * 50_000 + n;
    if (!best || score > best.score) {
      best = { score, headerRowIndex: hi, headers, dateIdx, closeIdx };
    }
  }
  return best
    ? {
        dataStartRow: best.headerRowIndex + 1,
        headers: best.headers,
        dateIdx: best.dateIdx,
        closeIdx: best.closeIdx,
      }
    : null;
}

const MAX_CLOSE_LIKE = 50_000_000; // sanity cap (avoids treating huge ints as price)

/**
 * Börsdata / some exports set `<dimension ref="A1:F2"/>` while thousands of rows exist.
 * SheetJS uses `!ref` from that dimension, so we union it with the true bbox of all cell keys.
 */
function cellKeysBoundingRange(sheet: XLSX.WorkSheet): XLSX.Range | null {
  let minR = Number.POSITIVE_INFINITY;
  let minC = Number.POSITIVE_INFINITY;
  let maxR = 0;
  let maxC = 0;
  let found = false;
  for (const k of Object.keys(sheet)) {
    if (k[0] === "!") continue;
    if (!/^[A-Za-z]{1,3}\d+$/.test(k)) continue;
    const addr = XLSX.utils.decode_cell(k);
    found = true;
    if (addr.r < minR) minR = addr.r;
    if (addr.c < minC) minC = addr.c;
    if (addr.r > maxR) maxR = addr.r;
    if (addr.c > maxC) maxC = addr.c;
  }
  if (!found) return null;
  return { s: { r: minR, c: minC }, e: { r: maxR, c: maxC } };
}

function mergeRanges(a: XLSX.Range, b: XLSX.Range): XLSX.Range {
  return {
    s: {
      r: Math.min(a.s.r, b.s.r),
      c: Math.min(a.s.c, b.s.c),
    },
    e: {
      r: Math.max(a.e.r, b.e.r),
      c: Math.max(a.e.c, b.e.c),
    },
  };
}

function effectiveSheetRange(sheet: XLSX.WorkSheet): string {
  const fromKeys = cellKeysBoundingRange(sheet);
  const ref = sheet["!ref"];
  if (!fromKeys && !ref) {
    return "A1";
  }
  if (!fromKeys) {
    return ref!;
  }
  if (!ref) {
    return XLSX.utils.encode_range(fromKeys);
  }
  return XLSX.utils.encode_range(mergeRanges(XLSX.utils.decode_range(ref), fromKeys));
}

/**
 * Build a dense matrix from the sheet’s used range (avoids sparse row arrays from sheet_to_json).
 */
function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  if (!sheet["!ref"] && !cellKeysBoundingRange(sheet)) {
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];
  }
  const ref = effectiveSheetRange(sheet);
  const range = XLSX.utils.decode_range(ref);
  const out: unknown[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr] as { v?: unknown; w?: string } | undefined;
      const v = cell?.v;
      if (v != null && v !== "") row.push(v);
      else if (cell?.w != null && String(cell.w).trim() !== "") row.push(cell.w);
      else row.push(null);
    }
    out.push(row);
  }
  return out;
}

/**
 * Dates in one row across columns, prices in a row below (common chart / export layout).
 * Example: row0 "Date" | 2020-01-01 | 2020-01-02 …  row1 "Close" | 10.2 | 10.4 …
 */
function parseWideLayoutBars(rows: unknown[][]): ParsedBar[] | null {
  let best: ParsedBar[] = [];
  const maxR = Math.min(100, Math.max(0, rows.length - 1));
  for (let headerRow = 0; headerRow < maxR; headerRow++) {
    const headerCells = rows[headerRow];
    if (!headerCells?.length) continue;
    for (let priceRow = headerRow + 1; priceRow < Math.min(headerRow + 25, rows.length); priceRow++) {
      const priceCells = rows[priceRow];
      if (!priceCells?.length) continue;
      const maxPair = Math.max(headerCells.length, priceCells.length);
      const barsFwd: ParsedBar[] = [];
      const barsRev: ParsedBar[] = [];
      for (let c = 0; c < maxPair; c++) {
        const dTop = cellToIsoDate(headerCells[c]);
        const pBot = toNum(priceCells[c]);
        if (dTop && pBot != null && pBot > 0 && pBot < MAX_CLOSE_LIKE) {
          barsFwd.push({ datum: dTop, close: pBot });
        }
        const dBot = cellToIsoDate(priceCells[c]);
        const pTop = toNum(headerCells[c]);
        if (dBot && pTop != null && pTop > 0 && pTop < MAX_CLOSE_LIKE) {
          barsRev.push({ datum: dBot, close: pTop });
        }
      }
      const bars = barsFwd.length >= barsRev.length ? barsFwd : barsRev;
      if (bars.length > best.length) best = bars;
    }
  }
  if (best.length < 5) return null;
  best.sort((a, b) => a.datum.localeCompare(b.datum));
  return best;
}

function barsForTransposedRow(
  pr: unknown[] | undefined,
  dateCols: { c: number; datum: string }[]
): ParsedBar[] {
  if (!pr?.length) return [];
  const bars: ParsedBar[] = [];
  for (const { c, datum } of dateCols) {
    const p = toNum(pr[c]);
    if (p != null && p > 0 && p < MAX_CLOSE_LIKE) bars.push({ datum, close: p });
  }
  return bars;
}

/**
 * One row of calendar dates across columns (often after a title), then metric rows like Open / High / Close
 * with the label in column 0 — common in chart exports and some vendor sheets.
 */
function parseTransposedDateRowLayout(rows: unknown[][]): ParsedBar[] | null {
  let best: ParsedBar[] = [];
  const maxDateRow = Math.min(120, rows.length);
  for (let dateRow = 0; dateRow < maxDateRow; dateRow++) {
    const dr = rows[dateRow];
    if (!dr?.length) continue;
    const dateCols: { c: number; datum: string }[] = [];
    for (let c = 0; c < dr.length; c++) {
      const d = cellToIsoDate(dr[c]);
      if (d) dateCols.push({ c, datum: d });
    }
    if (dateCols.length < 5) continue;

    const scanEnd = Math.min(dateRow + 45, rows.length);
    let localBest: ParsedBar[] = [];
    for (let r = dateRow + 1; r < scanEnd; r++) {
      const pr = rows[r];
      if (!pr?.length) continue;
      const leadLabels = pr
        .slice(0, Math.min(6, pr.length))
        .map((x) => String(x ?? ""));
      if (pickColumn(leadLabels, CLOSE_HEADER_CANDIDATES) == null) continue;
      const bars = barsForTransposedRow(pr, dateCols);
      if (bars.length > localBest.length) localBest = bars;
    }
    if (localBest.length < 5) {
      const minFill = Math.min(dateCols.length, Math.max(5, Math.floor(dateCols.length * 0.88)));
      for (let r = dateRow + 1; r < Math.min(dateRow + 18, scanEnd); r++) {
        const pr = rows[r];
        if (!pr?.length) continue;
        const leadLabels = pr
          .slice(0, Math.min(6, pr.length))
          .map((x) => String(x ?? ""));
        if (pickColumn(leadLabels, CLOSE_HEADER_CANDIDATES) != null) continue;
        const bars = barsForTransposedRow(pr, dateCols);
        if (bars.length >= minFill && bars.length > localBest.length) localBest = bars;
      }
    }
    if (localBest.length > best.length) best = localBest;
  }
  if (best.length < 5) return null;
  best.sort((a, b) => a.datum.localeCompare(b.datum));
  return best;
}

/**
 * When headers don’t match known names, find columns where most cells look like dates vs closes.
 */
function findColumnsByContent(rows: unknown[][]): ColumnLayout | null {
  let maxW = 0;
  for (let r = 0; r < Math.min(200, rows.length); r++) {
    const len = rows[r]?.length ?? 0;
    if (len > maxW) maxW = len;
  }
  const maxCol = Math.min(Math.max(maxW, 1), 120);

  let best: { score: number; startDataRow: number; dateIdx: number; closeIdx: number } | null = null;

  const maxStart = Math.min(120, Math.max(0, rows.length - 20));
  for (let startDataRow = 0; startDataRow < maxStart; startDataRow++) {
    for (let dateIdx = 0; dateIdx < maxCol; dateIdx++) {
      for (let closeIdx = 0; closeIdx < maxCol; closeIdx++) {
        if (dateIdx === closeIdx) continue;
        let ok = 0;
        let total = 0;
        const dateUniverse = new Set<string>();
        const end = Math.min(rows.length, startDataRow + 400);
        for (let r = startDataRow; r < end; r++) {
          const row = rows[r];
          if (!row) continue;
          const datum = cellToIsoDate(row[dateIdx]);
          const close = toNum(row[closeIdx]);
          total++;
          if (
            datum &&
            close != null &&
            close > 0 &&
            close < MAX_CLOSE_LIKE &&
            !(typeof row[closeIdx] === "number" && Math.round(row[closeIdx] as number) >= 30000 && Math.round(row[closeIdx] as number) < 120000)
          ) {
            ok++;
            dateUniverse.add(datum);
          }
        }
        if (total < 15 || ok < 12) continue;
        const ratio = ok / total;
        if (ratio < 0.65) continue;
        const distinctDates = dateUniverse.size;
        if (distinctDates < 5 && ok > 25) continue;
        const score = distinctDates * 50_000 + ok;
        if (!best || score > best.score) {
          best = { score, startDataRow, dateIdx, closeIdx };
        }
      }
    }
  }

  if (!best) return null;

  const headerLineIdx = best.startDataRow > 0 ? best.startDataRow - 1 : 0;
  const headerSource = rows[headerLineIdx] ?? [];
  const headers = headerSource.map((c) => String(c ?? ""));
  return {
    dataStartRow: best.startDataRow,
    headers,
    dateIdx: best.dateIdx,
    closeIdx: best.closeIdx,
  };
}

/** Prefer many distinct trading days, then row count (avoids wrong “as of” column vs real history). */
function seriesQualityScore(bars: ParsedBar[]): number {
  const u = new Set(bars.map((b) => b.datum)).size;
  return u * 1_000_000 + bars.length;
}

function parseSheetToBars(sheet: XLSX.WorkSheet): { bars: ParsedBar[]; errors: string[] } {
  const errors: string[] = [];
  const rows = sheetToMatrix(sheet);
  if (rows.length < 2) {
    return { bars: [], errors: ["Sheet is empty or has no data rows"] };
  }

  const wideBars = parseWideLayoutBars(rows);
  const transposedBars = parseTransposedDateRowLayout(rows);

  let sortedVertical: ParsedBar[] = [];
  const found = findBestHeaderRow(rows) ?? findColumnsByContent(rows);
  if (found) {
    const { dataStartRow, headers, dateIdx, closeIdx } = found;
    const openIdx = pickColumn(headers, ["open", "öppning", "oppen", "open price"]);
    const highIdx = pickColumn(headers, ["high", "högsta", "hogsta", "high price"]);
    const lowIdx = pickColumn(headers, ["low", "lägsta", "lagsta", "low price"]);
    const volIdx = pickColumn(headers, ["volume", "volym", "vol", "omsättning", "omsattning"]);
    const seen = new Map<string, ParsedBar>();

    for (let r = dataStartRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const datum = cellToIsoDate(row[dateIdx]);
      const close = toNum(row[closeIdx]);
      if (!datum || close == null || close <= 0) continue;

      const bar: ParsedBar = {
        datum,
        close,
        open: openIdx != null ? toNum(row[openIdx]) ?? undefined : undefined,
        high: highIdx != null ? toNum(row[highIdx]) ?? undefined : undefined,
        low: lowIdx != null ? toNum(row[lowIdx]) ?? undefined : undefined,
        volume: volIdx != null ? toNum(row[volIdx]) ?? undefined : undefined,
      };
      seen.set(datum, bar);
    }

    sortedVertical = Array.from(seen.values()).sort((a, b) => a.datum.localeCompare(b.datum));
  }

  const wide = wideBars ?? [];
  const tr = transposedBars ?? [];
  const sorted = [wide, tr, sortedVertical].reduce((best, cur) =>
    seriesQualityScore(cur) > seriesQualityScore(best) ? cur : best
  );

  if (sorted.length === 0) {
    if (found == null && wideBars == null && transposedBars == null) {
      errors.push(
        "Could not detect layout: no date+price columns, no wide date/price pair, and no row of dates with a labeled close row below."
      );
    } else {
      errors.push(
        "No valid rows with date and positive close after parsing. Check that dates and prices are in the detected columns."
      );
    }
    return { bars: [], errors };
  }

  const uniqueDates = new Set(sorted.map((b) => b.datum)).size;
  if (uniqueDates === 1 && rows.length > 30) {
    errors.push(
      "Only one calendar day in the parsed data while the sheet has many rows. The importer may be using the wrong date column (e.g. a fixed “as of” date). Try a file with one row per trading day and distinct dates, or dates across the top row with prices in the row below."
    );
  }

  return { bars: sorted, errors: errors.length ? errors : [] };
}

export function slugFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/i, "").trim().toLowerCase();
  const s = base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || "series";
}

export function labelFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/i, "").trim() || "Price series";
}

/**
 * Read workbook: tries each sheet. Header match first, then content-based date+price detection.
 */
export function parseDailyPriceXlsx(buffer: Buffer): { bars: ParsedBar[]; errors: string[] } {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  if (!wb.SheetNames.length) {
    return { bars: [], errors: ["Workbook has no sheets"] };
  }

  const allErrors: string[] = [];
  let bestBars: ParsedBar[] = [];
  let bestErrors: string[] = [];
  let bestQ = -1;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const { bars, errors } = parseSheetToBars(sheet);
    const q = seriesQualityScore(bars);
    if (q > bestQ) {
      bestQ = q;
      bestBars = bars;
      bestErrors = errors;
    }
    if (bars.length === 0) {
      allErrors.push(`Sheet “${sheetName}”: ${errors[0] ?? "no data"}`);
    }
  }

  if (bestBars.length > 0) {
    return { bars: bestBars, errors: bestErrors };
  }

  return {
    bars: [],
    errors: [
      allErrors.join(" · ") ||
        "Could not read daily prices from any sheet. Need a date column + a numeric price column.",
    ],
  };
}
