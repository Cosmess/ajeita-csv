import type { Dataset } from "../dataset";

export type MergeInput = { name: string; dataset: Dataset };

export type MergeFileSummary = {
  name: string;
  encoding: string;
  delimiter: string;
  source: string;
  hasHeader: boolean;
  rows: number;
  // Colunas que não existem em nenhum outro arquivo.
  onlyHere: string[];
};

export const SOURCE_COLUMN = "arquivo_origem";

// Mesma coluna em arquivos diferentes: compara o nome sem maiúsculas nem espaços nas pontas.
const key = (name: string) => name.trim().toLocaleLowerCase("pt-BR");

export function mergedColumns(inputs: readonly MergeInput[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const { dataset } of inputs) {
    for (const column of dataset.columns) {
      if (seen.has(key(column.name))) continue;
      seen.add(key(column.name));
      columns.push(column.name.trim());
    }
  }
  return columns;
}

export function summarizeMerge(inputs: readonly MergeInput[]): MergeFileSummary[] {
  return inputs.map(({ name, dataset }, i) => {
    const others = new Set(inputs.flatMap((input, j) => (j === i ? [] : input.dataset.columns.map((c) => key(c.name)))));
    return {
      name,
      encoding: dataset.meta.encoding,
      delimiter: dataset.meta.delimiter,
      source: dataset.meta.source,
      hasHeader: dataset.meta.hasHeader,
      rows: dataset.rows.length,
      onlyHere: inputs.length > 1 ? dataset.columns.filter((c) => !others.has(key(c.name))).map((c) => c.name) : [],
    };
  });
}

// Junta os arquivos um embaixo do outro, alinhando as colunas pelo nome.
// Devolve as linhas com o cabeçalho na primeira.
export function mergeDatasets(inputs: readonly MergeInput[], addSource: boolean): string[][] {
  if (inputs.length < 2) throw new Error("Escolha pelo menos 2 arquivos");
  const columns = mergedColumns(inputs);
  const position = new Map(columns.map((name, i) => [key(name), i]));
  const header = addSource ? [...columns, SOURCE_COLUMN] : columns;
  const rows: string[][] = [header];
  for (const { name, dataset } of inputs) {
    const targets = dataset.columns.map((c) => position.get(key(c.name))!);
    for (const row of dataset.rows) {
      const merged = Array<string>(header.length).fill("");
      targets.forEach((target, c) => (merged[target] = row[c] ?? ""));
      if (addSource) merged[columns.length] = name;
      rows.push(merged);
    }
  }
  return rows;
}
