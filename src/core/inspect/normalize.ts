import type { Dataset } from "../dataset";

const NON_ASCII = /[^\x00-\x7f]/;
const MARKS = /\p{M}/gu;

// Texto para comparação sem diferenciar maiúsculas nem acentos.
export function normalizeText(value: string): string {
  const lower = value.toLowerCase();
  return NON_ASCII.test(lower) ? lower.normalize("NFD").replace(MARKS, "") : lower;
}

// Guarda as colunas já normalizadas: busca e filtro repetidos não refazem o trabalho.
export class NormalizedColumns {
  private readonly cache = new Map<number, string[]>();

  constructor(private readonly dataset: Dataset) {}

  get(column: number): string[] {
    let values = this.cache.get(column);
    if (!values) {
      const { rows } = this.dataset;
      values = new Array<string>(rows.length);
      for (let i = 0; i < rows.length; i++) values[i] = normalizeText(rows[i]![column] ?? "");
      this.cache.set(column, values);
    }
    return values;
  }
}
