import type { ColumnType, Dataset, DateFormat, NumberFormat } from "../dataset";
import { parseDate, parseNumber } from "../parse/values";
import { countInvalid, type ValidationRule } from "../validate";

export type ColumnSummary = {
  column: number;
  name: string;
  type: ColumnType;
  format?: string;
  total: number;
  empty: number;
  unique: number;
  min?: string;
  max?: string;
  // Colunas numéricas: soma e média dos valores que são números, já formatadas no
  // formato da coluna, e quantos valores entraram na conta.
  sum?: string;
  mean?: string;
  numeric?: number;
  top: { value: string; count: number }[];
  // Quantos valores não passam na validação ativa da coluna.
  invalid?: number;
};

const TOP_SIZE = 10;

export function summarizeColumn(dataset: Dataset, column: number, indices?: Uint32Array, rule?: ValidationRule): ColumnSummary {
  const info = dataset.columns[column];
  if (!info) throw new Error(`Coluna inexistente: ${column}`);

  const parse =
    info.type === "number"
      ? (v: string) => parseNumber(v, info.format as NumberFormat)
      : info.type === "date"
        ? (v: string) => parseDate(v, info.format as DateFormat)
        : undefined;

  const counts = new Map<string, number>();
  const total = indices ? indices.length : dataset.rows.length;
  let empty = 0;
  let min: { key: number; value: string } | undefined;
  let max: { key: number; value: string } | undefined;
  const isNumber = info.type === "number";
  const separator = info.format === "br" ? "," : ".";
  let sum = 0;
  let numeric = 0;
  let decimals = 0;
  let currency = 0;

  for (let i = 0; i < total; i++) {
    const row = indices ? indices[i]! : i;
    const value = dataset.rows[row]![column] ?? "";
    if (value.trim() === "") {
      empty++;
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (parse) {
      const key = parse(value);
      if (Number.isNaN(key)) continue;
      if (isNumber) {
        sum += key;
        numeric++;
        const point = value.lastIndexOf(separator);
        if (point >= 0) decimals = Math.max(decimals, value.trimEnd().length - point - 1);
        if (value.includes("R$")) currency++;
      }
      if (!min || key < min.key) min = { key, value };
      if (!max || key > max.key) max = { key, value };
    }
  }

  return {
    column,
    name: info.name,
    type: info.type,
    format: info.format,
    total,
    empty,
    unique: counts.size,
    min: min?.value,
    max: max?.value,
    ...(isNumber && numeric > 0
      ? {
          numeric,
          sum: formatNumber(sum, info.format as NumberFormat, decimals, currency * 2 >= numeric),
          mean: formatNumber(sum / numeric, info.format as NumberFormat, Math.max(decimals, 2), currency * 2 >= numeric, decimals),
        }
      : {}),
    top: topValues(counts),
    invalid: rule ? countInvalid(dataset.rows, column, rule, indices) : undefined,
  };
}

const MAX_DECIMALS = 6;

// Formata no padrão da coluna ("1.234,56" ou "1,234.56"); inteiros sem formato usam o
// brasileiro. `decimals` arredonda, o que também limpa o erro de ponto flutuante da soma
// (0,1 + 0,2 = 0,30000000000000004).
function formatNumber(value: number, format: NumberFormat, decimals: number, currency: boolean, minDecimals = decimals): string {
  const digits = Math.min(decimals, MAX_DECIMALS);
  const text = value.toLocaleString(format === "us" ? "en-US" : "pt-BR", {
    minimumFractionDigits: Math.min(minDecimals, digits),
    maximumFractionDigits: digits,
  });
  if (!currency) return text;
  return text.startsWith("-") ? `-R$ ${text.slice(1)}` : `R$ ${text}`;
}

// Seleciona os mais frequentes numa passada, sem ordenar todos os valores únicos.
function topValues(counts: Map<string, number>): { value: string; count: number }[] {
  const top: { value: string; count: number }[] = [];
  const before = (a: { value: string; count: number }, b: { value: string; count: number }) =>
    a.count > b.count || (a.count === b.count && a.value < b.value);
  for (const [value, count] of counts) {
    const entry = { value, count };
    if (top.length === TOP_SIZE && !before(entry, top[TOP_SIZE - 1]!)) continue;
    let pos = top.length === TOP_SIZE ? TOP_SIZE - 1 : top.length;
    while (pos > 0 && before(entry, top[pos - 1]!)) pos--;
    top.splice(pos, 0, entry);
    if (top.length > TOP_SIZE) top.pop();
  }
  return top;
}
