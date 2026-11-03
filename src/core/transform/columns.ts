import type { Dataset } from "../dataset";
import type { ColumnSource, Patch } from "../patch";

const nameOf = (dataset: Dataset, column: number) => dataset.columns[column]?.name ?? `Coluna ${column + 1}`;
const headerOf = (dataset: Dataset, column: number) => dataset.meta.header[column] ?? nameOf(dataset, column);
const width = (dataset: Dataset) => dataset.columns.length;
const identity = (dataset: Dataset): ColumnSource[] => Array.from({ length: width(dataset) }, (_, from) => ({ from }));
const valuesOf = (dataset: Dataset, column: number) => dataset.rows.map((row) => row[column] ?? "");

type Remap = { sources: ColumnSource[]; names: (string | undefined)[] };

// Monta o patch a partir das novas colunas; `names[i]` só é usado em colunas novas.
function remap(dataset: Dataset, { sources, names }: Remap): Patch {
  const header = sources.map((source, i) => ("from" in source ? headerOf(dataset, source.from) : (names[i] ?? "")));
  return { kind: "remap", sources, header };
}

function checkColumn(dataset: Dataset, column: number): void {
  if (column < 0 || column >= width(dataset)) throw new Error(`Coluna inexistente: ${column + 1}`);
}

export function renameColumn(dataset: Dataset, column: number, name: string): Patch {
  checkColumn(dataset, column);
  if (!dataset.meta.hasHeader) throw new Error('Para dar nome às colunas, marque "Primeira linha é cabeçalho".');
  const patch = remap(dataset, { sources: identity(dataset), names: [] });
  if (patch.kind === "remap") patch.header[column] = name;
  return patch;
}

export function moveColumn(dataset: Dataset, from: number, to: number): Patch {
  checkColumn(dataset, from);
  checkColumn(dataset, to);
  const sources = identity(dataset);
  const [moved] = sources.splice(from, 1);
  sources.splice(to, 0, moved!);
  return remap(dataset, { sources, names: [] });
}

export function deleteColumns(dataset: Dataset, columns: readonly number[]): Patch {
  columns.forEach((c) => checkColumn(dataset, c));
  const remove = new Set(columns);
  return remap(dataset, { sources: identity(dataset).filter((s) => !remove.has((s as { from: number }).from)), names: [] });
}

export function emptyColumns(dataset: Dataset): number[] {
  return dataset.columns
    .map((_, column) => column)
    .filter((column) => dataset.rows.every((row) => (row[column] ?? "").trim() === ""));
}

export function duplicateColumn(dataset: Dataset, column: number): Patch {
  checkColumn(dataset, column);
  const sources: ColumnSource[] = identity(dataset);
  sources.splice(column + 1, 0, { values: valuesOf(dataset, column) });
  const names: (string | undefined)[] = [];
  names[column + 1] = `${nameOf(dataset, column)} (cópia)`;
  return remap(dataset, { sources, names });
}

// Divide no separador: as primeiras partes vão uma por coluna e o resto fica na última.
// Ex.: "Maria da Silva" com " " em 2 partes → "Maria" | "da Silva".
export function splitColumn(dataset: Dataset, column: number, separator: string, parts: number, names: string[] = []): Patch {
  checkColumn(dataset, column);
  if (separator === "") throw new Error("Informe o separador");
  if (parts < 2) throw new Error("Divida em pelo menos 2 partes");
  const columns = Array.from({ length: parts }, () => new Array<string>(dataset.rows.length));
  dataset.rows.forEach((row, r) => {
    const pieces = (row[column] ?? "").split(separator);
    for (let i = 0; i < parts; i++) {
      const piece = i < parts - 1 ? pieces[i] : pieces.slice(parts - 1).join(separator);
      columns[i]![r] = (piece ?? "").trim();
    }
  });
  const sources: ColumnSource[] = identity(dataset);
  sources.splice(column, 1, ...columns.map((values) => ({ values })));
  const base = nameOf(dataset, column);
  const newNames: (string | undefined)[] = [];
  for (let i = 0; i < parts; i++) newNames[column + i] = names[i]?.trim() || `${base} ${i + 1}`;
  return remap(dataset, { sources, names: newNames });
}

// Junta colunas com um separador numa coluna nova, na posição da primeira; vazios são ignorados.
export function mergeColumns(dataset: Dataset, columns: readonly number[], separator: string, name: string, keepOriginals: boolean): Patch {
  if (columns.length < 2) throw new Error("Escolha pelo menos 2 colunas");
  columns.forEach((c) => checkColumn(dataset, c));
  const values = dataset.rows.map((row) =>
    columns
      .map((c) => (row[c] ?? "").trim())
      .filter((v) => v !== "")
      .join(separator),
  );
  const remove = keepOriginals ? new Set<number>() : new Set(columns);
  const first = Math.min(...columns);
  const sources: ColumnSource[] = [];
  const names: (string | undefined)[] = [];
  identity(dataset).forEach((source, column) => {
    if (column === first) {
      names[sources.length] = name.trim() || columns.map((c) => nameOf(dataset, c)).join(" + ");
      sources.push({ values });
    }
    if (!remove.has(column)) sources.push(source);
  });
  return remap(dataset, { sources, names });
}
