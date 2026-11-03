import Papa from "papaparse";
import type { Dataset, DateFormat, NumberFormat } from "../dataset";
import { numberShape } from "../parse/values";
import { convertDate, convertNumber, parseDateParts } from "../transform/convert";
import { removeAccents } from "../transform/text";

export type SqlDialect = "postgres" | "sqlserver" | "mysql";
// insert: CREATE TABLE + INSERTs; copy: COPY ... FROM STDIN (psql); bulk: BULK INSERT (SQL Server).
export type SqlMode = "insert" | "copy" | "bulk";

export type SqlOptions = {
  dialect: SqlDialect;
  mode: SqlMode;
  table: string;
  createTable: boolean;
  // Nomes sem acentos, minúsculos e com "_" (ex.: "Data de Cadastro" → data_de_cadastro).
  normalizeNames: boolean;
};

export type SqlType =
  | { kind: "integer" | "bigint" | "boolean" | "date" | "timestamp" }
  | { kind: "decimal"; precision: number; scale: number }
  | { kind: "text"; length: number };

export type SqlColumn = { name: string; type: SqlType; index: number; format?: NumberFormat | DateFormat };

export const SQL_DIALECT_LABELS: Record<SqlDialect, string> = {
  postgres: "PostgreSQL",
  sqlserver: "SQL Server",
  mysql: "MySQL",
};

const INSERT_BATCH: Record<SqlDialect, number> = { postgres: 500, mysql: 500, sqlserver: 1000 };
const MAX_VARCHAR = 4000;
const INT_MAX = 2_147_483_647;
const TRUE_WORDS = new Set(["true", "sim", "verdadeiro", "s", "1"]);
const BOOLEAN_WORDS = new Set([...TRUE_WORDS, "false", "não", "nao", "falso", "n", "0"]);

// --- Nomes -------------------------------------------------------------------

export function sqlName(name: string, fallback: string): string {
  const normalized = removeAccents(name.replaceAll("º", "o").replaceAll("ª", "a"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return fallback;
  return /^\d/.test(normalized) ? `c_${normalized}` : normalized;
}

function quoteName(name: string, dialect: SqlDialect): string {
  if (dialect === "mysql") return `\`${name.replaceAll("`", "``")}\``;
  if (dialect === "sqlserver") return `[${name.replaceAll("]", "]]")}]`;
  return `"${name.replaceAll('"', '""')}"`;
}

function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const count = (used.get(name.toLowerCase()) ?? 0) + 1;
    used.set(name.toLowerCase(), count);
    return count === 1 ? name : `${name}_${count}`;
  });
}

// --- Tipos -------------------------------------------------------------------

// Confere o tipo detectado em todos os valores (não só na amostra) e mede tamanhos.
// Qualquer valor fora do tipo faz a coluna virar texto.
function inferType(dataset: Dataset, index: number, rows: Uint32Array | undefined): SqlColumn["type"] {
  const column = dataset.columns[index]!;
  const count = rows ? rows.length : dataset.rows.length;
  const values = (fn: (value: string) => boolean | void) => {
    for (let i = 0; i < count; i++) {
      const value = (dataset.rows[rows ? rows[i]! : i]![index] ?? "").trim();
      if (value !== "" && fn(value) === false) return false;
    }
    return true;
  };

  let maxLength = 1;
  values((v) => {
    maxLength = Math.max(maxLength, v.length);
  });
  const text: SqlType = { kind: "text", length: maxLength };

  if (column.type === "number") {
    const format = column.format as NumberFormat;
    if (format === "plain") {
      let big = false;
      const ok = values((v) => {
        if (numberShape(v) !== "plain") return false;
        if (Math.abs(Number(v)) > INT_MAX) big = true;
      });
      if (ok) return { kind: big ? "bigint" : "integer" };
    }
    let intDigits = 1;
    let scale = 0;
    const ok = values((v) => {
      const converted = convertNumber(v, format, "us", false);
      if (!("value" in converted)) return false;
      const [int = "", frac = ""] = converted.value.replace("-", "").split(".");
      intDigits = Math.max(intDigits, int.replace(/^0+(?=\d)/, "").length);
      scale = Math.max(scale, frac.length);
    });
    if (ok) return { kind: "decimal", precision: Math.min(38, intDigits + scale), scale: Math.min(scale, 18) };
    return text;
  }

  if (column.type === "date") {
    let withTime = false;
    const ok = values((v) => {
      const parts = parseDateParts(v, column.format as DateFormat);
      if (!parts) return false;
      if (parts.time) withTime = true;
    });
    if (ok) return { kind: withTime ? "timestamp" : "date" };
    return text;
  }

  if (column.type === "boolean" && values((v) => BOOLEAN_WORDS.has(v.toLowerCase()))) return { kind: "boolean" };
  return text;
}

export function inferSqlColumns(dataset: Dataset, options: Pick<SqlOptions, "normalizeNames">, rows?: Uint32Array): SqlColumn[] {
  const names = uniqueNames(
    dataset.columns.map((c, i) => (options.normalizeNames ? sqlName(c.name, `coluna_${i + 1}`) : c.name)),
  );
  return dataset.columns.map((column, index) => ({
    name: names[index]!,
    type: inferType(dataset, index, rows),
    index,
    format: column.format,
  }));
}

function typeSql(type: SqlType, dialect: SqlDialect): string {
  switch (type.kind) {
    case "integer":
      return dialect === "sqlserver" ? "INT" : dialect === "mysql" ? "INT" : "INTEGER";
    case "bigint":
      return "BIGINT";
    case "decimal":
      return `${dialect === "postgres" ? "NUMERIC" : "DECIMAL"}(${Math.max(type.precision, 1)}, ${type.scale})`;
    case "date":
      return "DATE";
    case "timestamp":
      return dialect === "sqlserver" ? "DATETIME2" : dialect === "mysql" ? "DATETIME" : "TIMESTAMP";
    case "boolean":
      return dialect === "sqlserver" ? "BIT" : "BOOLEAN";
    case "text":
      if (type.length > MAX_VARCHAR) return dialect === "sqlserver" ? "NVARCHAR(MAX)" : "TEXT";
      return `${dialect === "sqlserver" ? "NVARCHAR" : "VARCHAR"}(${type.length})`;
  }
}

// --- Valores -----------------------------------------------------------------

function quoteText(value: string, dialect: SqlDialect): string {
  const escaped = value.replaceAll("'", "''");
  if (dialect === "mysql") return `'${escaped.replaceAll("\\", "\\\\")}'`;
  if (dialect === "sqlserver") return `N'${escaped}'`;
  return `'${escaped}'`;
}

// Valor já no formato que o banco entende, sem aspas (null = vazio).
function plainValue(column: SqlColumn, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  switch (column.type.kind) {
    case "integer":
    case "bigint":
      return value;
    case "decimal": {
      const converted = convertNumber(value, column.format as NumberFormat, "us", false);
      return "value" in converted ? converted.value : value;
    }
    case "date":
    case "timestamp": {
      const converted = convertDate(value, column.format as DateFormat, "ymd", true);
      return "value" in converted ? converted.value : value;
    }
    case "boolean":
      return TRUE_WORDS.has(value.toLowerCase()) ? "true" : "false";
    case "text":
      return raw;
  }
}

function literal(column: SqlColumn, raw: string, dialect: SqlDialect): string {
  const value = plainValue(column, raw);
  if (value === null) return "NULL";
  switch (column.type.kind) {
    case "integer":
    case "bigint":
    case "decimal":
      return value;
    case "boolean":
      return dialect === "sqlserver" ? (value === "true" ? "1" : "0") : value.toUpperCase();
    case "date":
    case "timestamp":
      // Datas são só dígitos e separadores: não precisam do N'' do SQL Server.
      return `'${value}'`;
    case "text":
      return quoteText(value, dialect);
  }
}

// --- Script ------------------------------------------------------------------

export function generateSql(dataset: Dataset, options: SqlOptions, rows?: Uint32Array, sourceName = ""): string {
  const { dialect } = options;
  const columns = inferSqlColumns(dataset, options, rows);
  const table = quoteName(options.normalizeNames ? sqlName(options.table, "dados") : options.table || "dados", dialect);
  const names = columns.map((c) => quoteName(c.name, dialect)).join(", ");
  const count = rows ? rows.length : dataset.rows.length;
  const rowAt = (i: number) => dataset.rows[rows ? rows[i]! : i]!;
  const out: string[] = [];

  out.push(`-- Gerado pelo Ajeita CSV${sourceName ? ` a partir de ${sourceName}` : ""} (${count.toLocaleString("pt-BR")} linhas)`);
  out.push(`-- Dialeto: ${SQL_DIALECT_LABELS[dialect]}`);
  out.push("");

  if (options.createTable) {
    out.push(`CREATE TABLE ${table} (`);
    out.push(columns.map((c) => `  ${quoteName(c.name, dialect)} ${typeSql(c.type, dialect)}`).join(",\n"));
    out.push(");");
    out.push("");
  }

  if (options.mode === "copy" && dialect === "postgres") {
    out.push("-- Rode com o psql: psql -d banco -f arquivo.sql");
    out.push(`COPY ${table} (${names}) FROM STDIN WITH (FORMAT csv);`);
    const data: string[][] = [];
    for (let i = 0; i < count; i++) {
      const row = rowAt(i);
      data.push(columns.map((c) => plainValue(c, row[c.index] ?? "") ?? ""));
    }
    if (data.length > 0) out.push(Papa.unparse(data, { newline: "\n", escapeFormulae: false }));
    out.push("\\.");
    return out.join("\n") + "\n";
  }

  if (options.mode === "bulk" && dialect === "sqlserver") {
    out.push("-- 1. Exporte os dados em CSV padrão (vírgula, UTF-8), com datas aaaa-mm-dd e números 1234.56");
    out.push("--    (use Ajeitar → Datas e Ajeitar → Números antes, se precisar).");
    out.push("-- 2. Ajuste o caminho abaixo para onde o arquivo está no servidor.");
    out.push(`BULK INSERT ${table}`);
    out.push(`FROM 'C:\\caminho\\para\\${(sourceName || "dados").replace(/\.[^.]+$/, "")}.csv'`);
    out.push("WITH (FORMAT = 'CSV', FIRSTROW = 2, FIELDTERMINATOR = ',', ROWTERMINATOR = '0x0a', CODEPAGE = '65001', TABLOCK);");
    return out.join("\n") + "\n";
  }

  const batch = INSERT_BATCH[dialect];
  for (let start = 0; start < count; start += batch) {
    const end = Math.min(count, start + batch);
    out.push(`INSERT INTO ${table} (${names}) VALUES`);
    const values: string[] = [];
    for (let i = start; i < end; i++) {
      const row = rowAt(i);
      values.push(`  (${columns.map((c) => literal(c, row[c.index] ?? "", dialect)).join(", ")})`);
    }
    out.push(values.join(",\n") + ";");
  }
  return out.join("\n") + "\n";
}
