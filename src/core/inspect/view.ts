import type { Column, Dataset, DateFormat, NumberFormat } from "../dataset";
import { parseDate, parseNumber } from "../parse/values";
import { isValid, type ValidationRule } from "../validate";
import { NormalizedColumns, normalizeText } from "./normalize";

export type SortKey = { column: number; direction: "asc" | "desc" };

export type FilterOp = "contains" | "equals" | "startsWith" | "empty" | "notEmpty" | "invalid";
// `rule`: regra de validação usada pelo filtro "invalid".
export type Filter = { column: number; op: FilterOp; value?: string; rule?: ValidationRule };

export type ViewSpec = { sort: SortKey[]; filters: Filter[] };

export function allIndices(count: number): Uint32Array {
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  return indices;
}

export function filterIndices(dataset: Dataset, filters: readonly Filter[], normalized: NormalizedColumns): Uint32Array {
  const count = dataset.rows.length;
  if (filters.length === 0) return allIndices(count);

  const tests = filters.map((filter) => {
    const values = normalized.get(filter.column);
    const needle = normalizeText(filter.value ?? "");
    switch (filter.op) {
      case "contains":
        return (i: number) => values[i]!.includes(needle);
      case "equals":
        return (i: number) => values[i] === needle;
      case "startsWith":
        return (i: number) => values[i]!.startsWith(needle);
      case "empty":
        return (i: number) => values[i]!.trim() === "";
      case "notEmpty":
        return (i: number) => values[i]!.trim() !== "";
      case "invalid": {
        const rule = filter.rule ?? "required";
        return (i: number) => !isValid(rule, dataset.rows[i]![filter.column] ?? "");
      }
    }
  });

  const result = new Uint32Array(count);
  let size = 0;
  for (let i = 0; i < count; i++) {
    if (tests.every((test) => test(i))) result[size++] = i;
  }
  return result.slice(0, size);
}

type Comparator = (a: number, b: number) => number;

function numericKeys(dataset: Dataset, column: number, parse: (value: string) => number): Float64Array {
  const keys = new Float64Array(dataset.rows.length);
  for (let i = 0; i < keys.length; i++) {
    const value = dataset.rows[i]![column] ?? "";
    keys[i] = value.trim() === "" ? Number.NaN : parse(value);
  }
  return keys;
}

// Vazios e valores que não são do tipo da coluna vão sempre para o fim.
function compareNumbers(keys: Float64Array, sign: number): Comparator {
  return (a, b) => {
    const x = keys[a]!;
    const y = keys[b]!;
    const nx = Number.isNaN(x);
    const ny = Number.isNaN(y);
    if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
    return (x - y) * sign;
  };
}

// Texto vira um número: a posição do valor (sem acentos e maiúsculas) entre os valores
// distintos da coluna, ordenados uma vez só. Ordenar números é bem mais rápido que
// comparar strings a cada passo, e valores que só diferem em acentos ou maiúsculas
// empatam e passam para a próxima chave.
function textKeys(column: number, normalized: NormalizedColumns): Float64Array {
  const values = normalized.get(column);
  const distinct = [...new Set(values)].sort();
  const rank = new Map<string, number>();
  for (let i = 0; i < distinct.length; i++) rank.set(distinct[i]!, i);
  const keys = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    keys[i] = value.trim() === "" ? Number.NaN : rank.get(value)!;
  }
  return keys;
}

function comparatorFor(dataset: Dataset, key: SortKey, normalized: NormalizedColumns): Comparator {
  const column: Column | undefined = dataset.columns[key.column];
  const sign = key.direction === "asc" ? 1 : -1;
  if (column?.type === "number") {
    const format = column.format as NumberFormat;
    return compareNumbers(numericKeys(dataset, key.column, (v) => parseNumber(v, format)), sign);
  }
  if (column?.type === "date") {
    const format = column.format as DateFormat;
    return compareNumbers(numericKeys(dataset, key.column, (v) => parseDate(v, format)), sign);
  }
  return compareNumbers(textKeys(key.column, normalized), sign);
}

export function sortIndices(dataset: Dataset, indices: Uint32Array, sort: readonly SortKey[], normalized: NormalizedColumns): Uint32Array {
  if (sort.length === 0) return indices;
  const comparators = sort.map((key) => comparatorFor(dataset, key, normalized));
  const sorted = indices.slice();
  // Desempate pela posição original: ordenação estável e previsível.
  sorted.sort((a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return a - b;
  });
  return sorted;
}

export function buildView(dataset: Dataset, spec: ViewSpec, normalized: NormalizedColumns): Uint32Array {
  return sortIndices(dataset, filterIndices(dataset, spec.filters, normalized), spec.sort, normalized);
}
