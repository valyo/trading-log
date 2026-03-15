import Papa from "papaparse";

export type BorsdataRow = {
  borsdataId: string;
  bolagsnamn: string;
  /** All columns with original header names; values as strings from CSV */
  data: Record<string, string>;
};

export function parseBorsdataCsv(csvText: string): BorsdataRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
    quoteChar: '"',
  });
  if (result.errors.length > 0) {
    console.warn("Borsdata CSV parse errors:", result.errors);
  }
  const rows: BorsdataRow[] = [];
  for (const raw of result.data) {
    const borsdataId = (raw["Börsdata ID"] ?? "").trim();
    const bolagsnamn = (raw["Bolagsnamn"] ?? "").trim();
    if (!borsdataId && !bolagsnamn) continue;
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key != null && value !== undefined) data[key] = String(value).trim();
    }
    rows.push({
      borsdataId: borsdataId || "",
      bolagsnamn: bolagsnamn || "",
      data: data as Record<string, string>,
    });
  }
  return rows;
}
