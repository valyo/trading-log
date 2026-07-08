/**
 * Uptrend pullback study: stretch % above MA21/50/200 at swing highs,
 * internal MA spreads (MA21 vs MA50, MA50 vs MA200), and current snapshot vs history.
 */

export type PriceBarInput = { datum: string; close: number | string };

export type PullbackPeakSnapshot = {
  datum: string;
  /** % above moving average: (close/MA - 1) * 100 */
  stretchVsMa21: number | null;
  stretchVsMa50: number | null;
  stretchVsMa200: number | null;
  /** Internal: (MA21 - MA50) / MA50 * 100 */
  spreadMa21VsMa50: number | null;
  /** (MA50 - MA200) / MA200 * 100 */
  spreadMa50VsMa200: number | null;
  peakClose: number;
  pullbackDepthPct: number;
  /** Reason we tagged this as a pullback */
  reason: "drawdown" | "below_ma21" | "both";
};

export type NumericStats = {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
};

export type PullbackStudyResult = {
  barCount: number;
  /** First bar index of the uptrend leg (after last close ≤ anchor MA, or start of data). */
  uptrendStartIndex: number;
  uptrendStartDatum: string;
  /** Which MA defined “below = start of uptrend” when history is shorter than 200d. */
  uptrendAnchor: "ma200" | "ma50" | "ma21" | "start";
  pullbackPeaks: PullbackPeakSnapshot[];
  current: {
    datum: string;
    close: number;
    ma21: number | null;
    ma50: number | null;
    ma200: number | null;
    stretchVsMa21: number | null;
    stretchVsMa50: number | null;
    stretchVsMa200: number | null;
    spreadMa21VsMa50: number | null;
    spreadMa50VsMa200: number | null;
  };
  statsAtPeaks: {
    stretchVsMa21: NumericStats | null;
    stretchVsMa50: NumericStats | null;
    stretchVsMa200: NumericStats | null;
    spreadMa21VsMa50: NumericStats | null;
    spreadMa50VsMa200: NumericStats | null;
  };
  notes: string[];
};

function coerceClose(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v ?? "").trim().replace(/\s/g, "").replace(/\u00a0/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function smaAt(closes: number[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  let s = 0;
  for (let k = 0; k < period; k++) s += closes[i - k];
  return s / period;
}

function stretchPct(close: number, ma: number | null): number | null {
  if (ma == null || ma <= 0) return null;
  return ((close / ma - 1) * 100);
}

function spreadPct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b <= 0) return null;
  return ((a - b) / b) * 100;
}

function stats(values: number[]): NumericStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: sum / n,
    median,
  };
}

/**
 * Start of “current uptrend”: last time price closed at or below the deepest available anchor MA,
 * then the next day. Uses MA200 if n≥200, else MA50 if n≥50, else MA21 if n≥21, else bar 0.
 */
function resolveUptrendStart(
  closes: number[],
  ma21: (number | null)[],
  ma50: (number | null)[],
  ma200: (number | null)[],
  n: number
): { index: number; anchor: PullbackStudyResult["uptrendAnchor"] } {
  const clamp = (i: number) => Math.max(0, Math.min(i, n - 1));

  if (n >= 200) {
    const first = 199;
    for (let i = n - 1; i >= first; i--) {
      const m = ma200[i];
      if (m == null || m <= 0) continue;
      if (closes[i] <= m) return { index: clamp(i + 1), anchor: "ma200" };
    }
    return { index: clamp(first), anchor: "ma200" };
  }
  if (n >= 50) {
    const first = 49;
    for (let i = n - 1; i >= first; i--) {
      const m = ma50[i];
      if (m == null || m <= 0) continue;
      if (closes[i] <= m) return { index: clamp(i + 1), anchor: "ma50" };
    }
    return { index: clamp(first), anchor: "ma50" };
  }
  if (n >= 21) {
    const first = 20;
    for (let i = n - 1; i >= first; i--) {
      const m = ma21[i];
      if (m == null || m <= 0) continue;
      if (closes[i] <= m) return { index: clamp(i + 1), anchor: "ma21" };
    }
    return { index: clamp(first), anchor: "ma21" };
  }
  return { index: 0, anchor: "start" };
}

/** Local high: close[i] equals max in [i-w, i+w]. */
function isPivotHigh(closes: number[], i: number, w: number): boolean {
  if (i < w || i >= closes.length - w) return false;
  let mx = closes[i - w];
  for (let j = i - w + 1; j <= i + w; j++) {
    if (closes[j] > mx) mx = closes[j];
  }
  return closes[i] === mx;
}

const PIVOT_HALF_WIDTH = 5;
const PULLBACK_LOOKAHEAD = 45;
const MIN_PULLBACK_PCT = 3;

export function runPullbackStudy(bars: PriceBarInput[]): PullbackStudyResult {
  const notes: string[] = [];
  const datums = bars.map((b) => b.datum);
  const closes = bars.map((b) => coerceClose(b.close));
  const n = closes.length;

  if (n === 0) {
    return {
      barCount: 0,
      uptrendStartIndex: 0,
      uptrendStartDatum: "—",
      uptrendAnchor: "start",
      pullbackPeaks: [],
      current: {
        datum: "—",
        close: 0,
        ma21: null,
        ma50: null,
        ma200: null,
        stretchVsMa21: null,
        stretchVsMa50: null,
        stretchVsMa200: null,
        spreadMa21VsMa50: null,
        spreadMa50VsMa200: null,
      },
      statsAtPeaks: {
        stretchVsMa21: null,
        stretchVsMa50: null,
        stretchVsMa200: null,
        spreadMa21VsMa50: null,
        spreadMa50VsMa200: null,
      },
      notes: ["No price bars loaded."],
    };
  }

  if (closes.some((c) => !Number.isFinite(c))) {
    notes.push("Some close values were not numeric; check the import.");
  }

  if (n < 21) {
    notes.push("Fewer than 21 trading days: moving averages and pullback rules need more history.");
  } else if (n < 50) {
    notes.push("Fewer than 50 days: MA50 and MA200 are not available yet; uptrend uses MA21.");
  } else if (n < 200) {
    notes.push("Fewer than 200 days: MA200 is not available yet; uptrend uses MA50 (or MA21 if <50d).");
  }

  const ma21: (number | null)[] = [];
  const ma50: (number | null)[] = [];
  const ma200: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    ma21.push(Number.isFinite(closes[i]) ? smaAt(closes, i, 21) : null);
    ma50.push(Number.isFinite(closes[i]) ? smaAt(closes, i, 50) : null);
    ma200.push(Number.isFinite(closes[i]) ? smaAt(closes, i, 200) : null);
  }

  const { index: upStart, anchor: uptrendAnchor } = resolveUptrendStart(closes, ma21, ma50, ma200, n);
  const uptrendStartDatum = datums[upStart] ?? "—";

  const pullbackPeaks: PullbackPeakSnapshot[] = [];

  for (let i = upStart + PIVOT_HALF_WIDTH; i < n - PIVOT_HALF_WIDTH; i++) {
    if (!isPivotHigh(closes, i, PIVOT_HALF_WIDTH)) continue;
    const m21 = ma21[i];
    if (m21 == null || closes[i] <= m21) continue; // only “stretched” pivots above MA21

    const end = Math.min(i + PULLBACK_LOOKAHEAD, n - 1);
    let trough = closes[i];
    let kBelow21: number | null = null;
    for (let j = i + 1; j <= end; j++) {
      if (closes[j] < trough) trough = closes[j];
      const mj = ma21[j];
      if (mj != null && closes[j] < mj && kBelow21 == null) kBelow21 = j;
    }
    const drawdownPct = closes[i] > 0 ? ((closes[i] - trough) / closes[i]) * 100 : 0;
    const hitDrawdown = drawdownPct >= MIN_PULLBACK_PCT;
    const hitMa21 = kBelow21 != null;

    if (!hitDrawdown && !hitMa21) continue;

    const m50 = ma50[i];
    const m200 = ma200[i];
    pullbackPeaks.push({
      datum: datums[i],
      stretchVsMa21: stretchPct(closes[i], m21),
      stretchVsMa50: stretchPct(closes[i], m50),
      stretchVsMa200: stretchPct(closes[i], m200),
      spreadMa21VsMa50: spreadPct(m21, m50),
      spreadMa50VsMa200: spreadPct(m50, m200),
      peakClose: closes[i],
      pullbackDepthPct: drawdownPct,
      reason: hitDrawdown && hitMa21 ? "both" : hitDrawdown ? "drawdown" : "below_ma21",
    });
  }

  const last = n - 1;
  const c = closes[last];
  const c21 = ma21[last];
  const c50 = ma50[last];
  const c200 = ma200[last];

  const collect = (fn: (p: PullbackPeakSnapshot) => number | null) =>
    pullbackPeaks.map(fn).filter((x): x is number => x != null && Number.isFinite(x));

  const statsAtPeaks = {
    stretchVsMa21: stats(collect((p) => p.stretchVsMa21)),
    stretchVsMa50: stats(collect((p) => p.stretchVsMa50)),
    stretchVsMa200: stats(collect((p) => p.stretchVsMa200)),
    spreadMa21VsMa50: stats(collect((p) => p.spreadMa21VsMa50)),
    spreadMa50VsMa200: stats(collect((p) => p.spreadMa50VsMa200)),
  };

  if (pullbackPeaks.length === 0) {
    if (n < 21) {
      notes.push("Pullback peaks need at least 21 days (MA21) and room for 5-bar pivots.");
    } else {
      notes.push(
        "No pullback peaks in this uptrend (pivot high above MA21, then ≥3% dip and/or close below MA21 within the lookahead window)."
      );
    }
  }

  const anchorLabel =
    uptrendAnchor === "ma200"
      ? "MA200"
      : uptrendAnchor === "ma50"
        ? "MA50"
        : uptrendAnchor === "ma21"
          ? "MA21"
          : "first bar";
  notes.push(
    `Uptrend segment starts ${uptrendStartDatum} (last close ≤ ${anchorLabel} before the current leg, or first bar where that MA exists).`
  );
  notes.push(
    `Pullback = after a local 5-bar price high while extended above MA21, either ≥${MIN_PULLBACK_PCT}% drawdown from that high or a later close below MA21 (within ${PULLBACK_LOOKAHEAD} sessions).`
  );

  return {
    barCount: n,
    uptrendStartIndex: upStart,
    uptrendStartDatum,
    uptrendAnchor,
    pullbackPeaks,
    current: {
      datum: datums[last],
      close: c,
      ma21: c21,
      ma50: c50,
      ma200: c200,
      stretchVsMa21: stretchPct(c, c21),
      stretchVsMa50: stretchPct(c, c50),
      stretchVsMa200: stretchPct(c, c200),
      spreadMa21VsMa50: spreadPct(c21, c50),
      spreadMa50VsMa200: spreadPct(c50, c200),
    },
    statsAtPeaks,
    notes,
  };
}

/** Human-readable lines comparing current vs historical peak distribution. */
export function interpretCurrentVsPeaks(study: PullbackStudyResult): string[] {
  const lines: string[] = [];
  const { current, statsAtPeaks, pullbackPeaks } = study;

  const cmp = (label: string, cur: number | null, st: NumericStats | null) => {
    if (cur == null || !st || st.n === 0) return;
    if (cur >= st.max) lines.push(`${label}: ${cur.toFixed(1)}% — above all ${st.n} prior pullback peaks (max was ${st.max.toFixed(1)}%).`);
    else if (cur <= st.min) lines.push(`${label}: ${cur.toFixed(1)}% — below all prior pullback peaks (min was ${st.min.toFixed(1)}%).`);
    else if (cur >= st.median) lines.push(`${label}: ${cur.toFixed(1)}% — above median (${st.median.toFixed(1)}%) of pullback peaks.`);
    else lines.push(`${label}: ${cur.toFixed(1)}% — below median (${st.median.toFixed(1)}%) of pullback peaks.`);
  };

  if (pullbackPeaks.length === 0) {
    lines.push("No historical pullback peaks in this uptrend to compare against.");
    return lines;
  }

  cmp("Stretch vs MA21", current.stretchVsMa21, statsAtPeaks.stretchVsMa21);
  cmp("Stretch vs MA50", current.stretchVsMa50, statsAtPeaks.stretchVsMa50);
  cmp("Stretch vs MA200", current.stretchVsMa200, statsAtPeaks.stretchVsMa200);
  cmp("Internal spread MA21−MA50 (as % of MA50)", current.spreadMa21VsMa50, statsAtPeaks.spreadMa21VsMa50);
  cmp("Internal spread MA50−MA200 (as % of MA200)", current.spreadMa50VsMa200, statsAtPeaks.spreadMa50VsMa200);

  return lines;
}
