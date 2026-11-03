import type { Dataset } from "../dataset";
import type { Plan, Unrecognized } from "../ops";

export const MAX_UNRECOGNIZED = 20;

// Resultado de uma transformação por célula: o novo valor, ou o motivo de não reconhecer.
export type CellOutcome = string | { unrecognized: string };

// Aplica `fn` às células não vazias das colunas escolhidas. Só entra no patch o
// que muda; o que não é reconhecido fica como está e vai para a prévia.
export function planCells(
  dataset: Dataset,
  columns: readonly number[],
  label: string,
  fn: (value: string) => CellOutcome,
): Plan {
  const cells: { row: number; column: number; value: string }[] = [];
  const failed = new Map<string, Unrecognized>();
  let unrecognizedTotal = 0;
  dataset.rows.forEach((row, rowIndex) => {
    for (const column of columns) {
      const value = row[column];
      if (value === undefined || value.trim() === "") continue;
      const outcome = fn(value);
      if (typeof outcome === "string") {
        if (outcome !== value) cells.push({ row: rowIndex, column, value: outcome });
        continue;
      }
      unrecognizedTotal++;
      const entry = failed.get(value);
      if (entry) entry.count++;
      else failed.set(value, { value, count: 1, row: rowIndex, reason: outcome.unrecognized });
    }
  });
  const unrecognized = [...failed.values()].sort((a, b) => b.count - a.count).slice(0, MAX_UNRECOGNIZED);
  return { patch: { kind: "cells", cells }, label, unrecognized, unrecognizedTotal };
}

// "value" ou "unrecognized" vindos das funções de formatação.
export const outcome = (result: { value: string } | { unrecognized: string }): CellOutcome =>
  "value" in result ? result.value : result;
