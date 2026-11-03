import type { Dataset, ParseIssue } from "./dataset";
import { deriveColumns } from "./parse";

// Alteração reversível nos dados. Aplicar um patch devolve os dados novos e o
// patch inverso, que desfaz exatamente a alteração. Só o que mudou é guardado:
// desfazer não exige cópias do arquivo inteiro.
export type PatchBody =
  // Troca o valor de células que já existem na linha.
  | { kind: "cells"; cells: { row: number; column: number; value: string }[] }
  // Troca linhas inteiras (inclusive o número de células).
  | { kind: "replace"; rows: { index: number; cells: string[] }[] }
  // Remove `remove` linhas a partir de `index` e insere `insert` no lugar.
  | { kind: "splice"; index: number; remove: number; insert: string[][] }
  // Remove linhas (índices em ordem crescente).
  | { kind: "deleteRows"; rows: number[] }
  // Insere linhas; `index` é a posição final de cada uma, em ordem crescente.
  | { kind: "insertRows"; rows: { index: number; cells: string[] }[] }
  // Reordena: a nova linha i é a antiga order[i].
  | { kind: "permute"; order: Uint32Array }
  // Liga ou desliga o cabeçalho. Ao desligar, `row` volta a ser a primeira linha de dados.
  | { kind: "header"; hasHeader: boolean; row?: string[] }
  // Vários patches aplicados em sequência.
  | { kind: "batch"; patches: Patch[] };

// `issues`: problemas do parser a restaurar ao aplicar. Os inversos guardam o
// estado anterior; nos demais casos os índices são recalculados.
export type Patch = PatchBody & { issues?: ParseIssue[] };

export type AppliedPatch = { dataset: Dataset; inverse: Patch };

export function applyPatch(dataset: Dataset, patch: Patch): AppliedPatch {
  const result = applyBody(dataset, patch);
  // Num lote, cada passo já recalculou os problemas.
  const issues =
    patch.issues ?? (patch.kind === "batch" ? result.meta.issues : remapIssues(dataset.meta.issues, patch, dataset.rows.length));
  const meta = { ...result.meta, issues };
  return {
    dataset: { rows: result.rows, meta, columns: deriveColumns(result.rows, meta, dataset.columns) },
    inverse: { ...result.inverse, issues: dataset.meta.issues },
  };
}

type BodyResult = { rows: string[][]; meta: Dataset["meta"]; inverse: Patch };

function applyBody(dataset: Dataset, patch: Patch): BodyResult {
  const { meta } = dataset;
  switch (patch.kind) {
    case "cells": {
      const rows = dataset.rows.slice();
      const copied = new Set<number>();
      const previous: { row: number; column: number; value: string }[] = [];
      for (const { row, column, value } of patch.cells) {
        const original = rows[row];
        if (!original || column >= original.length) throw new Error(`Célula inexistente: linha ${row + 1}, coluna ${column + 1}`);
        if (!copied.has(row)) {
          rows[row] = original.slice();
          copied.add(row);
        }
        previous.push({ row, column, value: rows[row]![column]! });
        rows[row]![column] = value;
      }
      return { rows, meta, inverse: { kind: "cells", cells: previous.reverse() } };
    }

    case "replace": {
      const rows = dataset.rows.slice();
      const previous = patch.rows.map(({ index, cells }) => {
        const old = rows[index];
        if (!old) throw new Error(`Linha inexistente: ${index + 1}`);
        rows[index] = cells;
        return { index, cells: old };
      });
      return { rows, meta, inverse: { kind: "replace", rows: previous.reverse() } };
    }

    case "splice": {
      const rows = dataset.rows.slice();
      const removed = rows.splice(patch.index, patch.remove, ...patch.insert);
      return { rows, meta, inverse: { kind: "splice", index: patch.index, remove: patch.insert.length, insert: removed } };
    }

    case "deleteRows": {
      const remove = new Set(patch.rows);
      const rows: string[][] = [];
      const removed: { index: number; cells: string[] }[] = [];
      dataset.rows.forEach((row, index) => (remove.has(index) ? removed.push({ index, cells: row }) : rows.push(row)));
      return { rows, meta, inverse: { kind: "insertRows", rows: removed } };
    }

    case "insertRows": {
      const rows: string[][] = [];
      let source = 0;
      for (const { index, cells } of patch.rows) {
        while (rows.length < index && source < dataset.rows.length) rows.push(dataset.rows[source++]!);
        rows.push(cells);
      }
      while (source < dataset.rows.length) rows.push(dataset.rows[source++]!);
      return { rows, meta, inverse: { kind: "deleteRows", rows: patch.rows.map((r) => r.index) } };
    }

    case "permute": {
      const { order } = patch;
      if (order.length !== dataset.rows.length) throw new Error("A nova ordem não tem o mesmo número de linhas");
      const rows = new Array<string[]>(order.length);
      const inverse = new Uint32Array(order.length);
      for (let i = 0; i < order.length; i++) {
        rows[i] = dataset.rows[order[i]!]!;
        inverse[order[i]!] = i;
      }
      return { rows, meta, inverse: { kind: "permute", order: inverse } };
    }

    case "header": {
      if (patch.hasHeader === meta.hasHeader) return { rows: dataset.rows, meta, inverse: patch };
      if (patch.hasHeader) {
        const [first = [], ...rows] = dataset.rows;
        return {
          rows,
          meta: { ...meta, hasHeader: true, header: first },
          inverse: { kind: "header", hasHeader: false, row: first },
        };
      }
      const row = patch.row ?? meta.header;
      return {
        rows: [row, ...dataset.rows],
        meta: { ...meta, hasHeader: false, header: [] },
        inverse: { kind: "header", hasHeader: true },
      };
    }

    case "batch": {
      let current = dataset;
      const inverses: Patch[] = [];
      for (const step of patch.patches) {
        const applied = applyPatch(current, step);
        current = applied.dataset;
        inverses.push(applied.inverse);
      }
      return { rows: current.rows, meta: current.meta, inverse: { kind: "batch", patches: inverses.reverse() } };
    }
  }
}

// Recalcula os índices dos problemas do parser depois de uma alteração nas linhas.
// Linhas reescritas pelo usuário deixam de ter o problema.
function remapIssues(issues: ParseIssue[], patch: Patch, rowCount: number): ParseIssue[] {
  if (issues.length === 0) return issues;
  const map = (fn: (row: number) => number | undefined) =>
    issues.flatMap((issue) => {
      const row = fn(issue.row);
      return row === undefined ? [] : [{ ...issue, row }];
    });

  switch (patch.kind) {
    case "cells":
      return issues;
    case "replace": {
      const replaced = new Set(patch.rows.map((r) => r.index));
      return map((row) => (replaced.has(row) ? undefined : row));
    }
    case "splice": {
      const end = patch.index + patch.remove;
      return map((row) =>
        row < patch.index ? row : row < end ? undefined : row + patch.insert.length - patch.remove,
      );
    }
    case "deleteRows": {
      const deleted = patch.rows;
      return map((row) => {
        const below = countBelow(deleted, row);
        return deleted[below] === row ? undefined : row - below;
      });
    }
    case "insertRows":
      return map((row) => {
        let shift = 0;
        for (const { index } of patch.rows) {
          if (index <= row + shift) shift++;
          else break;
        }
        return row + shift;
      });
    case "permute": {
      const position = new Uint32Array(rowCount);
      patch.order.forEach((old, i) => (position[old] = i));
      return map((row) => position[row]);
    }
    case "header":
      return map((row) => (patch.hasHeader ? (row === 0 ? undefined : row - 1) : row + 1));
    case "batch":
      return issues;
  }
}

// Quantos valores de uma lista crescente são menores que `value`.
function countBelow(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid]! < value) low = mid + 1;
    else high = mid;
  }
  return low;
}
