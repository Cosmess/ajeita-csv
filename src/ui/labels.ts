import type { ColumnType, Delimiter, Encoding } from "../core/dataset";
import type { ExportEncoding, LineEnding } from "../core/export/csv";
import type { FilterOp } from "../core/inspect/view";

export const formatCount = (n: number) => n.toLocaleString("pt-BR");

export const ENCODING_LABELS: Record<Exclude<Encoding, "iso-8859-1">, string> = {
  "utf-8": "UTF-8",
  "windows-1252": "Windows-1252 (ANSI)",
};

export const DELIMITER_LABELS: Record<Delimiter, string> = {
  ",": "Vírgula ( , )",
  ";": "Ponto e vírgula ( ; )",
  "\t": "Tabulação",
  "|": "Barra vertical ( | )",
};

export const EXPORT_ENCODING_LABELS: Record<ExportEncoding, string> = {
  "utf-8-bom": "UTF-8 com BOM (recomendado para Excel)",
  "utf-8": "UTF-8 sem BOM",
  "windows-1252": "Windows-1252 (sistemas antigos, ERPs, bancos)",
};

export const LINE_ENDING_LABELS: Record<LineEnding, string> = {
  "\r\n": "CRLF (Windows, Excel)",
  "\n": "LF (Linux, Mac, sistemas web)",
};

export const FILTER_LABELS: Record<FilterOp, string> = {
  contains: "contém",
  equals: "é igual a",
  startsWith: "começa com",
  empty: "está vazio",
  notEmpty: "não está vazio",
  invalid: "é inválido",
};

export const TYPE_LABELS: Record<ColumnType, string> = {
  string: "Texto",
  number: "Número",
  date: "Data",
  boolean: "Sim/Não",
  unknown: "Vazia",
};

export const FORMAT_LABELS: Record<string, string> = {
  br: "formato brasileiro (1.234,56)",
  us: "formato americano (1,234.56)",
  plain: "inteiros",
  dmy: "dd/mm/aaaa",
  mdy: "mm/dd/aaaa",
  ymd: "aaaa-mm-dd",
};
