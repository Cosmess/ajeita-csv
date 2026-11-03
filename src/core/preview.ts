import type { Dataset } from "./dataset";
import { rowToText } from "./fix/problems";
import type { Plan, Unrecognized } from "./ops";
import type { Patch } from "./patch";

// Formato padrão de prévia: totais, as primeiras linhas afetadas (antes → depois)
// e os valores que a operação não reconheceu (e que ficam como estão).
export type Preview = {
  label: string;
  affectedRows: number;
  changedCells: number;
  samples: PreviewSample[];
  unrecognized: Unrecognized[];
  unrecognizedTotal: number;
};

export type PreviewSample =
  | { kind: "cell"; row: number; column: string; before: string; after: string }
  | { kind: "row"; row: number; before: string; after: string };

const MAX_SAMPLE_ROWS = 20;

export function previewPlan(dataset: Dataset, plan: Plan): Preview {
  const rows = new Set<number>();
  const samples: PreviewSample[] = [];
  let changedCells = 0;
  const { delimiter } = dataset.meta;
  const text = (cells: readonly string[]) => rowToText(cells, delimiter);
  const sampleRow = (row: number) => {
    rows.add(row);
    return rows.size <= MAX_SAMPLE_ROWS;
  };

  const visit = (patch: Patch) => {
    switch (patch.kind) {
      case "cells":
        for (const { row, column, value } of patch.cells) {
          changedCells++;
          if (sampleRow(row) || samples.at(-1)?.row === row) {
            const before = dataset.rows[row]![column]!;
            samples.push({ kind: "cell", row, column: dataset.columns[column]?.name ?? "", before, after: value });
          }
        }
        return;
      case "replace":
        for (const { index, cells } of patch.rows) {
          const before = dataset.rows[index] ?? [];
          changedCells += Math.max(before.length, cells.length);
          if (sampleRow(index)) samples.push({ kind: "row", row: index, before: text(before), after: text(cells) });
        }
        return;
      case "splice": {
        const removed = dataset.rows.slice(patch.index, patch.index + patch.remove);
        changedCells += removed.reduce((n, r) => n + r.length, 0);
        if (sampleRow(patch.index)) {
          samples.push({
            kind: "row",
            row: patch.index,
            before: removed.map(text).join("\n"),
            after: patch.insert.map(text).join("\n"),
          });
        }
        return;
      }
      case "deleteRows":
        for (const index of patch.rows) {
          const before = dataset.rows[index] ?? [];
          changedCells += before.length;
          if (sampleRow(index)) samples.push({ kind: "row", row: index, before: text(before), after: "" });
        }
        return;
      case "batch":
        patch.patches.forEach(visit);
        return;
      default:
        rows.add(-1);
    }
  };
  visit(plan.patch);
  samples.sort((a, b) => a.row - b.row);

  return {
    label: plan.label,
    affectedRows: rows.has(-1) ? dataset.rows.length : rows.size,
    changedCells,
    samples,
    unrecognized: plan.unrecognized,
    unrecognizedTotal: plan.unrecognizedTotal,
  };
}
