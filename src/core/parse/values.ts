import type { ColumnType, DateFormat, NumberFormat } from "../dataset";

// --- Números ---------------------------------------------------------------

const INT = String.raw`(?:0|[1-9]\d*)`;
const PLAIN = new RegExp(String.raw`^-?${INT}$`);
const BR = new RegExp(String.raw`^-?(?:0|[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)(?:,\d+)?$`);
const US = new RegExp(String.raw`^-?(?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.\d+)?$`);

// Remove símbolo de moeda e espaços, mantendo o sinal: "-R$ 1.234,56" → "-1.234,56".
export function stripCurrency(value: string): string {
  let v = value.trim();
  let negative = false;
  if (v.startsWith("-")) {
    negative = true;
    v = v.slice(1).trim();
  }
  if (/^R\$/i.test(v)) {
    v = v.slice(2).trim();
    if (v.startsWith("-")) {
      negative = !negative;
      v = v.slice(1).trim();
    }
  }
  return (negative ? "-" : "") + v;
}

type NumberShape = "plain" | "br" | "us" | "both" | "none";

export function numberShape(value: string): NumberShape {
  const v = stripCurrency(value);
  if (v === "" || v === "-") return "none";
  if (PLAIN.test(v)) return "plain";
  const br = BR.test(v);
  const us = US.test(v);
  if (br && us) return "both"; // ex.: "1.234" ou "1,234"
  if (br) return "br";
  if (us) return "us";
  return "none";
}

export function parseNumber(value: string, format: NumberFormat): number {
  const v = stripCurrency(value);
  if (v === "") return Number.NaN;
  const normalized = format === "br" ? v.replaceAll(".", "").replace(",", ".") : v.replaceAll(",", "");
  return normalized.trim() === "" ? Number.NaN : Number(normalized);
}

// --- Datas -----------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function toTimestamp(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number {
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return Number.NaN;
  const time = Date.UTC(y, m - 1, d, hh, mm, ss);
  const date = new Date(time);
  // Rejeita datas que "transbordam", como 30/02.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? time : Number.NaN;
}

export function parseDate(value: string, format: DateFormat): number {
  const v = value.trim();
  if (format === "ymd") {
    const m = ISO_DATE.exec(v);
    if (!m) return Number.NaN;
    return toTimestamp(+m[1]!, +m[2]!, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  const m = SLASH_DATE.exec(v);
  if (!m) return Number.NaN;
  const [a, b] = [+m[1]!, +m[2]!];
  const [day, month] = format === "dmy" ? [a, b] : [b, a];
  return toTimestamp(+m[3]!, month, day, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

type DateShape = "ymd" | "dmy" | "mdy" | "slash" | "none";

function dateShape(value: string): DateShape {
  const v = value.trim();
  if (ISO_DATE.test(v)) return Number.isNaN(parseDate(v, "ymd")) ? "none" : "ymd";
  const m = SLASH_DATE.exec(v);
  if (!m) return "none";
  const dmy = !Number.isNaN(parseDate(v, "dmy"));
  const mdy = !Number.isNaN(parseDate(v, "mdy"));
  if (dmy && mdy) return "slash";
  if (dmy) return "dmy";
  if (mdy) return "mdy";
  return "none";
}

// --- Booleanos -------------------------------------------------------------

const BOOLEANS = new Set(["true", "false", "sim", "não", "nao", "verdadeiro", "falso"]);

// --- Tipo da coluna --------------------------------------------------------

export type DetectedType = { type: ColumnType; format?: NumberFormat | DateFormat };

const SAMPLE_SIZE = 1000;
// Fração mínima de valores não vazios que precisa bater com o tipo.
const MIN_MATCH = 0.95;

export function looksNumericOrDate(value: string): boolean {
  return numberShape(value) !== "none" || dateShape(value) !== "none";
}

export function detectColumnType(values: Iterable<string>): DetectedType {
  const sample: string[] = [];
  for (const value of values) {
    if (value.trim() === "") continue;
    sample.push(value);
    if (sample.length >= SAMPLE_SIZE) break;
  }
  if (sample.length === 0) return { type: "unknown" };
  const needed = Math.ceil(sample.length * MIN_MATCH);

  const numbers = { plain: 0, br: 0, us: 0, both: 0, none: 0 };
  for (const v of sample) numbers[numberShape(v)]++;
  if (sample.length - numbers.none >= needed) {
    if (numbers.br > 0 && numbers.us > 0) return { type: "string" };
    if (numbers.us > 0) return { type: "number", format: "us" };
    if (numbers.br > 0 || numbers.both > 0) return { type: "number", format: "br" };
    return { type: "number", format: "plain" };
  }

  const dates = { ymd: 0, dmy: 0, mdy: 0, slash: 0, none: 0 };
  for (const v of sample) dates[dateShape(v)]++;
  if (sample.length - dates.none >= needed) {
    const slashed = dates.dmy + dates.mdy + dates.slash;
    if (dates.ymd >= needed) return { type: "date", format: "ymd" };
    if (slashed >= needed) {
      if (dates.dmy > 0 && dates.mdy > 0) return { type: "string" };
      // Sem nenhum valor que desambigue, assume o formato brasileiro.
      return { type: "date", format: dates.mdy > 0 ? "mdy" : "dmy" };
    }
  }

  const booleans = sample.filter((v) => BOOLEANS.has(v.trim().toLowerCase())).length;
  if (booleans >= needed) return { type: "boolean" };

  return { type: "string" };
}
