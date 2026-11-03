import type { Dataset } from "./dataset";
import { fixMojibake, looksLikeMojibake } from "./fix/mojibake";
import { findProblems, parseRowText, planProblemFix, type ProblemKind } from "./fix/problems";
import { NormalizedColumns } from "./inspect/normalize";
import { allIndices, sortIndices, type SortKey } from "./inspect/view";
import type { Patch } from "./patch";

// Operação serializável ({ op, params }): é o que fica no histórico e, no futuro,
// nas receitas que reaplicam a mesma sequência em outro arquivo.
export type Op =
  | { op: "fixEncoding"; params: Record<string, never> }
  | { op: "editCell"; params: { row: number; column: number; value: string } }
  | { op: "editRow"; params: { row: number; text: string } }
  | { op: "deleteRows"; params: { rows: number[] } }
  | { op: "fixProblems"; params: { rows: number[] | "all"; kind?: ProblemKind } }
  | { op: "applySort"; params: { sort: SortKey[] } }
  | { op: "setHeader"; params: { hasHeader: boolean } };

export type Unrecognized = { value: string; count: number; row: number };

export type Plan = { patch: Patch; label: string; unrecognized: Unrecognized[]; unrecognizedTotal: number };

const MAX_UNRECOGNIZED = 20;

const rowLabel = (rows: readonly number[], one: string, many: string) =>
  rows.length === 1 ? `${one} ${rows[0]! + 1}` : `${many.replace("{n}", rows.length.toLocaleString("pt-BR"))}`;

export function planOp(dataset: Dataset, op: Op): Plan {
  const plan = (patch: Patch, label: string): Plan => ({ patch, label, unrecognized: [], unrecognizedTotal: 0 });

  switch (op.op) {
    case "fixEncoding":
      return planFixEncoding(dataset);

    case "editCell": {
      const { row, column, value } = op.params;
      const cells = dataset.rows[row];
      if (!cells) throw new Error(`Linha inexistente: ${row + 1}`);
      const name = dataset.columns[column]?.name ?? `Coluna ${column + 1}`;
      const label = `Editar célula (linha ${row + 1}, ${name})`;
      if (column < cells.length) return plan({ kind: "cells", cells: [{ row, column, value }] }, label);
      // Célula além do fim da linha: completa a linha com vazios.
      const padded = [...cells, ...Array<string>(column - cells.length).fill(""), value];
      return plan({ kind: "replace", rows: [{ index: row, cells: padded }] }, label);
    }

    case "editRow": {
      const { row, text } = op.params;
      if (!dataset.rows[row]) throw new Error(`Linha inexistente: ${row + 1}`);
      const insert = parseRowText(text, dataset.meta.delimiter);
      return plan({ kind: "splice", index: row, remove: 1, insert }, `Editar linha ${row + 1}`);
    }

    case "deleteRows": {
      const rows = [...new Set(op.params.rows)].filter((r) => r >= 0 && r < dataset.rows.length).sort((a, b) => a - b);
      return plan({ kind: "deleteRows", rows }, rowLabel(rows, "Excluir linha", "Excluir {n} linhas"));
    }

    case "fixProblems": {
      const { rows, kind } = op.params;
      const wanted = rows === "all" ? undefined : new Set(rows);
      const problems = findProblems(dataset).filter(
        (p) => (!wanted || wanted.has(p.row)) && (!kind || p.kinds.includes(kind)),
      );
      if (problems.length === 0) throw new Error("Nenhum problema para corrigir");
      const label = rowLabel(
        problems.map((p) => p.row),
        "Corrigir linha",
        "Corrigir {n} linhas com problema",
      );
      return plan(planProblemFix(dataset, problems), label);
    }

    case "applySort": {
      const order = sortIndices(dataset, allIndices(dataset.rows.length), op.params.sort, new NormalizedColumns(dataset));
      return plan({ kind: "permute", order }, "Aplicar ordenação");
    }

    case "setHeader": {
      const { hasHeader } = op.params;
      return plan(
        { kind: "header", hasHeader },
        hasHeader ? "Usar a primeira linha como cabeçalho" : "Tratar o cabeçalho como dados",
      );
    }
  }
}

function planFixEncoding(dataset: Dataset): Plan {
  const cells: { row: number; column: number; value: string }[] = [];
  const failed = new Map<string, Unrecognized>();
  let unrecognizedTotal = 0;
  dataset.rows.forEach((row, rowIndex) =>
    row.forEach((cell, column) => {
      if (!looksLikeMojibake(cell)) return;
      const fixed = fixMojibake(cell);
      if (fixed !== undefined) {
        cells.push({ row: rowIndex, column, value: fixed });
        return;
      }
      unrecognizedTotal++;
      const entry = failed.get(cell);
      if (entry) entry.count++;
      else failed.set(cell, { value: cell, count: 1, row: rowIndex });
    }),
  );
  const unrecognized = [...failed.values()].sort((a, b) => b.count - a.count).slice(0, MAX_UNRECOGNIZED);
  return { patch: { kind: "cells", cells }, label: "Corrigir acentos quebrados", unrecognized, unrecognizedTotal };
}
