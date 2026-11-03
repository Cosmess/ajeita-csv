import Papa from "papaparse";
import type { Dataset, Delimiter } from "../dataset";
import { encodeWindows1252, findUnencodable, type UnencodablePolicy } from "./windows1252";

export type ExportEncoding = "utf-8" | "utf-8-bom" | "windows-1252";
export type LineEnding = "\n" | "\r\n";

export type CsvExportOptions = {
  delimiter: Delimiter;
  encoding: ExportEncoding;
  lineEnding: LineEnding;
  quoteAll: boolean;
  // Converte números em formato americano (1234.56) para vírgula decimal (1234,56).
  decimalComma: boolean;
};

export type ExportPreset = "excel-br" | "csv";

export const EXPORT_PRESETS: Record<ExportPreset, CsvExportOptions> = {
  "excel-br": { delimiter: ";", encoding: "utf-8-bom", lineEnding: "\r\n", quoteAll: false, decimalComma: true },
  csv: { delimiter: ",", encoding: "utf-8", lineEnding: "\n", quoteAll: false, decimalComma: false },
};

function toDecimalComma(value: string): string {
  return value.replaceAll(",", "").replace(".", ",");
}

// indices: linhas a exportar, na ordem desejada (ex.: só as filtradas). Padrão: todas.
export function serializeCsv(dataset: Dataset, options: CsvExportOptions, indices?: Uint32Array): string {
  const usColumns = options.decimalComma
    ? dataset.columns.flatMap((column, index) => (column.type === "number" && column.format === "us" ? [index] : []))
    : [];

  const count = indices ? indices.length : dataset.rows.length;
  const data: string[][] = new Array(count);
  for (let i = 0; i < count; i++) {
    const row = dataset.rows[indices ? indices[i]! : i]!;
    if (usColumns.length === 0) {
      data[i] = row;
      continue;
    }
    const copy = row.slice();
    for (const col of usColumns) if (copy[col] !== undefined) copy[col] = toDecimalComma(copy[col]!);
    data[i] = copy;
  }
  if (dataset.meta.hasHeader) data.unshift(dataset.meta.header);

  const text = Papa.unparse(data, {
    delimiter: options.delimiter,
    newline: options.lineEnding,
    quotes: options.quoteAll,
    escapeFormulae: false,
  });
  // Papa.unparse não termina a última linha; arquivos de texto devem terminar com quebra.
  return data.length ? text + options.lineEnding : text;
}

export function unencodableChars(text: string, encoding: ExportEncoding): { char: string; count: number }[] {
  if (encoding !== "windows-1252") return [];
  return [...findUnencodable(text)].map(([char, count]) => ({ char, count })).sort((a, b) => b.count - a.count);
}

export function encodeText(text: string, encoding: ExportEncoding, policy: UnencodablePolicy = "replace"): Uint8Array {
  if (encoding === "windows-1252") return encodeWindows1252(text, policy);
  const body = new TextEncoder().encode(text);
  if (encoding === "utf-8") return body;
  const withBom = new Uint8Array(body.length + 3);
  withBom.set([0xef, 0xbb, 0xbf]);
  withBom.set(body, 3);
  return withBom;
}
