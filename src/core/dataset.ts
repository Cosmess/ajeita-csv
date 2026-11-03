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

// row: índice da linha no arquivo, a partir de 0 e contando o cabeçalho.
export type ParseIssue = {
  row: number;
  kind: "column_count" | "unclosed_quote" | "encoding";
  message: string;
};

export type ParseMeta = {
  source: "csv" | "xlsx";
  encoding: Encoding;
  delimiter: Delimiter;
  hasHeader: boolean;
  hasBom: boolean;
  issues: ParseIssue[];
  sheet?: string;
};

export type Dataset = { columns: Column[]; rows: string[][]; meta: ParseMeta };

export const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];
