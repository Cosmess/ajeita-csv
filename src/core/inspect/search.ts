import type { Dataset } from "../dataset";
import { NormalizedColumns, normalizeText } from "./normalize";

export type SearchResult = {
  // Pares [posição na visualização, coluna], na ordem de leitura da grade.
  matches: Int32Array;
  // Total real de células encontradas; pode ser maior que matches.length / 2.
  total: number;
};

export const MAX_STORED_MATCHES = 100_000;

export function searchCells(dataset: Dataset, view: Uint32Array, query: string, normalized: NormalizedColumns): SearchResult {
  const needle = normalizeText(query);
  if (needle === "") return { matches: new Int32Array(0), total: 0 };

  const columns = dataset.columns.map((_, index) => normalized.get(index));
  const stored: number[] = [];
  let total = 0;
  for (let pos = 0; pos < view.length; pos++) {
    const row = view[pos]!;
    for (let col = 0; col < columns.length; col++) {
      if (!columns[col]![row]!.includes(needle)) continue;
      total++;
      if (stored.length < MAX_STORED_MATCHES * 2) stored.push(pos, col);
    }
  }
  return { matches: Int32Array.from(stored), total };
}
