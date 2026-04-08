import Papa from "papaparse";
import { parseSwedishNumber } from "./parse";

export type BrokerRow = {
  datum: string;
  konto: string;
  typAvTransaktion: string;
  vardepapper: string;
  antal: number;
  kurs: number | null;
  belopp: number;
  transaktionsvaluta: string;
  courtage: number | null;
  valutakurs: number | null;
  instrumentvaluta: string;
  isin: string | null;
  resultat: number | null;
};

const BROKER_HEADERS = [
  "Datum",
  "Konto",
  "Typ av transaktion",
  "Värdepapper/beskrivning",
  "Antal",
  "Kurs",
  "Belopp",
  "Transaktionsvaluta",
  "Courtage",
  "Valutakurs",
  "Instrumentvaluta",
  "ISIN",
  "Resultat",
] as const;

function mapBrokerRow(raw: Record<string, string>): BrokerRow | null {
  const datum = raw["Datum"]?.trim();
  if (!datum) return null;
  const typAvTransaktion = (raw["Typ av transaktion"] ?? "").trim();
  const typLower = typAvTransaktion.toLowerCase();
  const antal = parseSwedishNumber(raw["Antal"] ?? "");
  if (antal === null) return null;
  // Avanza "Split nytt värdepapper" often has empty Belopp/Kurs — still a valid row (0 cash).
  const beloppParsed = parseSwedishNumber(raw["Belopp"] ?? "");
  const belopp =
    beloppParsed !== null
      ? beloppParsed
      : typLower.includes("split") && typLower.includes("nytt")
        ? 0
        : null;
  if (belopp === null) return null;
  return {
    datum,
    konto: (raw["Konto"] ?? "").trim(),
    typAvTransaktion,
    vardepapper: (raw["Värdepapper/beskrivning"] ?? "").trim(),
    antal,
    kurs: parseSwedishNumber(raw["Kurs"] ?? "") ?? null,
    belopp,
    transaktionsvaluta: (raw["Transaktionsvaluta"] ?? "").trim(),
    courtage: parseSwedishNumber(raw["Courtage"] ?? "") ?? null,
    valutakurs: parseSwedishNumber(raw["Valutakurs"] ?? "") ?? null,
    instrumentvaluta: (raw["Instrumentvaluta"] ?? "").trim(),
    isin: (raw["ISIN"] ?? "").trim() || null,
    resultat: parseSwedishNumber(raw["Resultat"] ?? "") ?? null,
  };
}

export function parseBrokerCsv(csvText: string): BrokerRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    console.warn("Broker CSV parse errors:", result.errors);
  }
  const rows: BrokerRow[] = [];
  for (const raw of result.data) {
    const row = mapBrokerRow(raw);
    if (row) rows.push(row);
  }
  return rows;
}
