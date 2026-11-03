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
    top: topValues(counts),
    invalid: rule ? countInvalid(dataset.rows, column, rule, indices) : undefined,
  };
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
