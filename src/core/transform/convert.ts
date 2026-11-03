import type { DateFormat, NumberFormat } from "../dataset";
import { numberShape, stripCurrency } from "../parse/values";
import type { FormatResult } from "./documents";

// --- Datas -------------------------------------------------------------------

type DateParts = { y: string; m: string; d: string; time?: string };

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?$/;
const SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}:\d{2}(?::\d{2})?))?$/;

function validDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function validTime(time: string | undefined): boolean {
  if (!time) return true;
  const [h, min, s = "0"] = time.split(":").map(Number);
  return h! <= 23 && min! <= 59 && Number(s) <= 59;
}

export function parseDateParts(value: string, format: DateFormat): DateParts | undefined {
  const v = value.trim();
  let parts: DateParts | undefined;
  const iso = ISO.exec(v);
  if (iso) parts = { y: iso[1]!, m: iso[2]!, d: iso[3]!, time: iso[4] };
  else {
    const slash = SLASH.exec(v);
    if (!slash || format === "ymd") return undefined;
    const [a, b] = format === "dmy" ? [slash[1]!, slash[2]!] : [slash[2]!, slash[1]!];
    parts = { y: slash[3]!, m: b, d: a, time: slash[4] };
  }
  if (!validDate(+parts.y, +parts.m, +parts.d) || !validTime(parts.time)) return undefined;
  return parts;
}

const pad2 = (n: string) => n.padStart(2, "0");

export function convertDate(value: string, from: DateFormat, to: DateFormat, keepTime: boolean): FormatResult {
  const parts = parseDateParts(value, from);
  if (!parts) return { unrecognized: "data inválida ou em outro formato" };
  const { y } = parts;
  const m = pad2(parts.m);
  const d = pad2(parts.d);
  const date = to === "ymd" ? `${y}-${m}-${d}` : to === "dmy" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
  const time = keepTime && parts.time ? ` ${parts.time.split(":").map(pad2).join(":")}` : "";
  return { value: date + time };
}

// --- Números -----------------------------------------------------------------

export function convertNumber(value: string, from: NumberFormat, to: "br" | "us", keepCurrency: boolean): FormatResult {
  const shape = numberShape(value);
  if (shape === "none") return { unrecognized: "não é um número" };
  const effective = shape === "both" ? (from === "us" ? "us" : "br") : shape;
  const plain = stripCurrency(value);
  const negative = plain.startsWith("-");
  const body = plain.replace(/^-/, "");
  const [intPart, fraction = ""] =
    effective === "us" ? body.replaceAll(",", "").split(".") : body.replaceAll(".", "").split(",");
  const integer = intPart!;
  const formatted =
    to === "br"
      ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (fraction ? `,${fraction}` : "")
      : integer + (fraction ? `.${fraction}` : "");
  const currency = keepCurrency && /R\$/i.test(value) ? "R$ " : "";
  return { value: `${negative ? "-" : ""}${currency}${formatted}` };
}
