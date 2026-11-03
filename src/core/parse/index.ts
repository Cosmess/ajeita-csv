import type { Column, Dataset, Delimiter, Encoding, ParseMeta } from "../dataset";
import { findColumnCountIssues, parseCsvText, type CsvParseCallbacks } from "./csv";
import { detectDelimiter } from "./delimiter";
import { decodeBytes, detectEncoding } from "./encoding";
import { detectHeader } from "./header";
import { detectColumnType } from "./values";

export type ParseOverrides = { encoding?: Encoding; delimiter?: Delimiter; hasHeader?: boolean };

// Resultado do parse antes de separar cabeçalho e dados: permite trocar
// "tem cabeçalho" sem ler o arquivo de novo.
export type RawTable = { rows: string[][]; meta: ParseMeta };

const DELIMITER_SAMPLE = 64 * 1024;

export function parseCsvBytes(bytes: Uint8Array, overrides: ParseOverrides = {}, callbacks: CsvParseCallbacks = {}): RawTable {
  const detected = detectEncoding(bytes);
  const encoding = overrides.encoding ?? detected.encoding;
  const text = decodeBytes(bytes, encoding);
  const delimiter = overrides.delimiter ?? detectDelimiter(text.slice(0, DELIMITER_SAMPLE));
  const { rows, issues } = parseCsvText(text, delimiter, callbacks);
  const hasHeader = overrides.hasHeader ?? detectHeader(rows.slice(0, 51));
  return {
    rows,
    meta: { source: "csv", encoding, delimiter, hasHeader, hasBom: detected.hasBom, issues },
  };
}

export function tableFromRows(rows: string[][], overrides: ParseOverrides & { sheet?: string } = {}): RawTable {
  return {
    rows,
    meta: {
      source: "xlsx",
      encoding: "utf-8",
      delimiter: ",",
      hasHeader: overrides.hasHeader ?? detectHeader(rows.slice(0, 51)),
      hasBom: false,
      issues: [],
      sheet: overrides.sheet,
    },
  };
}

export function buildDataset(table: RawTable): Dataset {
  const { meta } = table;
  const header = meta.hasHeader ? (table.rows[0] ?? []) : [];
  const rows = meta.hasHeader ? table.rows.slice(1) : table.rows;

  let width = header.length;
  for (const row of rows) if (row.length > width) width = row.length;

  const columns: Column[] = [];
  for (let i = 0; i < width; i++) {
    const name = header[i]?.trim() ? header[i]! : `Coluna ${i + 1}`;
    columns.push({ id: `c${i}`, name, ...detectColumnType(columnValues(rows, i)) });
  }

  // Problemas de aspas vêm do parser; contagem de colunas depende do cabeçalho.
  const headerOffset = meta.hasHeader ? 1 : 0;
  const expected = meta.hasHeader ? header.length : (rows[0]?.length ?? 0);
  const quoteIssues = meta.issues.filter((issue) => issue.kind !== "column_count");
  const countIssues = findColumnCountIssues(rows, expected).map((issue) => ({ ...issue, row: issue.row + headerOffset }));

  return { columns, rows, meta: { ...meta, issues: [...quoteIssues, ...countIssues] } };
}

function* columnValues(rows: readonly (readonly string[])[], index: number): Generator<string> {
  for (const row of rows) yield row[index] ?? "";
}
