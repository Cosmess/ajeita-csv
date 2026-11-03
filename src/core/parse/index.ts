import type { Column, Dataset, Delimiter, Encoding, ParseMeta } from "../dataset";
import { jsonToRows, parseJsonRecords } from "../create/json";
import { parseCsvText, type CsvParseCallbacks } from "./csv";
import { detectDelimiter } from "./delimiter";
import { decodeBytes, detectEncoding } from "./encoding";
import { detectHeader } from "./header";
import { detectColumnType } from "./values";

// explode: JSON, campo de array que vira uma linha por item ("" = nenhum).
export type ParseOverrides = { encoding?: Encoding; delimiter?: Delimiter; hasHeader?: boolean; explode?: string };

// Resultado do parse antes de separar cabeçalho e dados. Os índices de
// meta.issues aqui contam a primeira linha do arquivo.
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
    meta: { source: "csv", encoding, delimiter, hasHeader, header: [], hasBom: detected.hasBom, issues },
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
      header: [],
      hasBom: false,
      issues: [],
      sheet: overrides.sheet,
    },
  };
}

const createdMeta = (source: ParseMeta["source"], hasHeader: boolean): ParseMeta => ({
  source,
  encoding: "utf-8",
  delimiter: ",",
  hasHeader,
  header: [],
  hasBom: false,
  issues: [],
});

// Linhas montadas no painel: grade vazia, texto ou tabela da página.
export function tableFromCreated(rows: string[][], hasHeader: boolean): RawTable {
  return { rows, meta: createdMeta("created", hasHeader) };
}

export function tableFromJson(text: string, explode?: string): RawTable {
  const rows = jsonToRows(parseJsonRecords(text), explode || undefined);
  return { rows, meta: { ...createdMeta("json", true), explode: explode || undefined } };
}

export function buildDataset(table: RawTable): Dataset {
  const { meta } = table;
  const header = meta.hasHeader ? (table.rows[0] ?? []) : [];
  const rows = meta.hasHeader ? table.rows.slice(1) : table.rows;
  const offset = meta.hasHeader ? 1 : 0;
  const issues = meta.issues
    .map((issue) => ({ ...issue, row: issue.row - offset }))
    .filter((issue) => issue.row >= 0);
  const datasetMeta: ParseMeta = { ...meta, header, issues };
  return { columns: deriveColumns(rows, datasetMeta), rows, meta: datasetMeta };
}

export function columnName(header: readonly string[], index: number): string {
  const name = header[index];
  return name?.trim() ? name : `Coluna ${index + 1}`;
}

// Colunas a partir do cabeçalho e da linha mais larga. Chamado de novo a cada
// alteração: linhas corrigidas podem tirar ou acrescentar colunas, e os tipos mudam.
export function deriveColumns(rows: readonly (readonly string[])[], meta: ParseMeta, previous: readonly Column[] = []): Column[] {
  let width = meta.header.length;
  for (const row of rows) if (row.length > width) width = row.length;

  const columns: Column[] = [];
  for (let i = 0; i < width; i++) {
    columns.push({
      id: previous[i]?.id ?? `c${i}`,
      name: columnName(meta.header, i),
      ...detectColumnType(columnValues(rows, i)),
    });
  }
  return columns;
}

function* columnValues(rows: readonly (readonly string[])[], index: number): Generator<string> {
  for (const row of rows) yield row[index] ?? "";
}
