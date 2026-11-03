export type ColumnType = "string" | "number" | "date" | "boolean" | "unknown";

// Formato detectado de colunas numéricas e de data. Necessário para ordenar,
// resumir e converter decimais sem adivinhar valor a valor.
export type NumberFormat = "br" | "us" | "plain";
export type DateFormat = "dmy" | "mdy" | "ymd";

export type Column = {
  id: string;
  name: string;
  type: ColumnType;
  format?: NumberFormat | DateFormat;
};

export type Encoding = "utf-8" | "windows-1252" | "iso-8859-1";
export type Delimiter = "," | ";" | "\t" | "|";

// Problema detectado pelo parser, que não dá para recalcular a partir dos dados.
// row: índice em Dataset.rows (a partir de 0, sem contar o cabeçalho).
export type ParseIssue = {
  row: number;
  kind: "unclosed_quote";
  message: string;
};

// Origem dos dados: arquivo CSV/TXT/TSV, planilha, JSON, ou criados no painel (grade vazia, página).
export type DataSource = "csv" | "xlsx" | "json" | "created";

export type ParseMeta = {
  source: DataSource;
  encoding: Encoding;
  delimiter: Delimiter;
  hasHeader: boolean;
  // Células originais do cabeçalho (vazio quando não há cabeçalho).
  header: string[];
  hasBom: boolean;
  issues: ParseIssue[];
  sheet?: string;
  // JSON: campo de array que vira uma linha por item (os demais arrays são juntados com "|").
  explode?: string;
};

export type Dataset = { columns: Column[]; rows: string[][]; meta: ParseMeta };

export const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];
