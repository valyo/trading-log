"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { priceBars, priceSeries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  labelFromFilename,
  parseDailyPriceXlsx,
  slugFromFilename,
} from "@/lib/price-analysis/parseXlsx";

export async function importPriceSeriesXlsx(formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file?.size) {
    redirect("/stretch/import?error=no_file");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const { bars, errors } = parseDailyPriceXlsx(buf);
  if (errors.length > 0 && bars.length === 0) {
    const q = new URLSearchParams({ error: errors.join("; ") });
    redirect(`/stretch/import?${q.toString()}`);
  }
  if (bars.length === 0) {
    redirect("/stretch/import?error=no_rows");
  }

  const slug = slugFromFilename(file.name);
  const label = labelFromFilename(file.name);

  const existing = await db.select().from(priceSeries).where(eq(priceSeries.slug, slug));
  let seriesId: number;
  const now = new Date();

  if (existing[0]) {
    seriesId = existing[0].id;
    await db.delete(priceBars).where(eq(priceBars.seriesId, seriesId));
    await db
      .update(priceSeries)
      .set({ label, sourceFile: file.name, updatedAt: now })
      .where(eq(priceSeries.id, seriesId));
  } else {
    const ins = await db
      .insert(priceSeries)
      .values({ slug, label, sourceFile: file.name, updatedAt: now })
      .returning({ id: priceSeries.id });
    seriesId = ins[0]!.id;
  }

  const rows = bars.map((b) => ({
    seriesId,
    datum: b.datum,
    open: b.open ?? null,
    high: b.high ?? null,
    low: b.low ?? null,
    close: b.close,
    volume: b.volume ?? null,
  }));
  const chunkSize = 120;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(priceBars).values(rows.slice(i, i + chunkSize));
  }

  const q = new URLSearchParams({ imported: String(bars.length) });
  if (errors.length > 0) {
    q.set("warn", errors.slice(0, 2).join(" "));
  }
  redirect(`/stretch/${encodeURIComponent(slug)}?${q.toString()}`);
}

export async function deletePriceSeries(formData: FormData) {
  const slug = (formData.get("slug") as string)?.trim();
  if (!slug) return;
  const row = await db.select().from(priceSeries).where(eq(priceSeries.slug, slug));
  if (!row[0]) return;
  await db.delete(priceSeries).where(eq(priceSeries.id, row[0].id));
  redirect("/stretch?deleted=1");
}
