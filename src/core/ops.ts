import type { Dataset, DateFormat, NumberFormat } from "./dataset";
import { fixMojibake, looksLikeMojibake } from "./fix/mojibake";
import { findProblems, parseRowText, planProblemFix, type ProblemKind } from "./fix/problems";
import { NormalizedColumns } from "./inspect/normalize";
import { allIndices, sortIndices, type SortKey } from "./inspect/view";
import type { Patch } from "./patch";
import { MAX_UNRECOGNIZED, outcome, planCells } from "./transform/cells";
import {
  addColumn,
  deleteColumns,
  duplicateColumn,
  emptyColumns,
  mergeColumns,
  moveColumn,
  renameColumn,
  splitColumn,
} from "./transform/columns";
import { convertDate, convertNumber } from "./transform/convert";
import {
  formatCep,
  formatDocument,
  predominantDocument,
  type DocumentKind,
  type DocumentMode,
} from "./transform/documents";
import { formatPhone, normalizePhone, type PhoneFormat } from "./transform/phone";
import { replacer, type ReplaceOptions } from "./transform/replace";
import { changeCase, collapseSpaces, removeAccents, type CaseMode } from "./transform/text";
import { detectColumnType } from "./parse/values";

// Operação serializável ({ op, params }): é o que fica no histórico e, no futuro,
// nas receitas que reaplicam a mesma sequência em outro arquivo.
export type Op =
  | { op: "fixEncoding"; params: Record<string, never> }
  | { op: "editCell"; params: { row: number; column: number; value: string } }
  | { op: "editRow"; params: { row: number; text: string } }
  | { op: "deleteRows"; params: { rows: number[] } }
  | { op: "fixProblems"; params: { rows: number[] | "all"; kind?: ProblemKind } }
  | { op: "applySort"; params: { sort: SortKey[] } }
  | { op: "setHeader"; params: { hasHeader: boolean } }
  // Limpeza
  | { op: "trimSpaces"; params: { columns: number[] } }
  | { op: "changeCase"; params: { columns: number[]; mode: CaseMode } }
  | { op: "removeAccents"; params: { columns: number[] } }
  | { op: "removeDuplicates"; params: { columns: number[] } }
  | { op: "removeEmptyRows"; params: Record<string, never> }
  | { op: "removeEmptyColumns"; params: Record<string, never> }
  // Conversões
  | { op: "convertDates"; params: { columns: number[]; to: DateFormat; keepTime: boolean; from?: DateFormat } }
  | { op: "convertNumbers"; params: { columns: number[]; to: "br" | "us"; keepCurrency: boolean } }
  | { op: "formatDocuments"; params: { columns: number[]; mode: DocumentMode; kind: DocumentKind; padZeros: boolean } }
  | { op: "formatPhones"; params: { columns: number[]; format: PhoneFormat; addNinthDigit: boolean; defaultDdd?: string } }
  | { op: "formatCeps"; params: { columns: number[]; mode: DocumentMode } }
  // Estrutura de colunas
  | { op: "renameColumn"; params: { column: number; name: string } }
  | { op: "moveColumn"; params: { from: number; to: number } }
  | { op: "deleteColumns"; params: { columns: number[] } }
  | { op: "duplicateColumn"; params: { column: number } }
  | { op: "splitColumn"; params: { column: number; separator: string; parts: number; names?: string[] } }
  | { op: "mergeColumns"; params: { columns: number[]; separator: string; name: string; keepOriginals: boolean } }
  // Localizar e substituir
  | { op: "replace"; params: ReplaceOptions & { columns: number[] | "all" } }
  // Edição livre (grade vazia e colar)
  | { op: "insertRows"; params: { index: number; count: number } }
  | { op: "addColumn"; params: { index: number; name?: string } }
  | { op: "paste"; params: { row: number; column: number; text: string } };

export type Unrecognized = { value: string; count: number; row: number; reason?: string };

export type Plan = { patch: Patch; label: string; unrecognized: Unrecognized[]; unrecognizedTotal: number };


const columnNames = (dataset: Dataset, columns: readonly number[]) =>
  columns.length === 1 ? `"${dataset.columns[columns[0]!]?.name ?? ""}"` : `${columns.length} colunas`;

function requireColumns(dataset: Dataset, columns: readonly number[]): void {
  if (columns.length === 0) throw new Error("Escolha pelo menos uma coluna");
  for (const c of columns) if (c < 0 || c >= dataset.columns.length) throw new Error(`Coluna inexistente: ${c + 1}`);
}

function* values(dataset: Dataset, column: number): Generator<string> {
  for (const row of dataset.rows) yield row[column] ?? "";
}

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

    // --- Limpeza ---------------------------------------------------------------

    case "trimSpaces":
      requireColumns(dataset, op.params.columns);
      return planCells(dataset, op.params.columns, `Remover espaços extras em ${columnNames(dataset, op.params.columns)}`, collapseSpaces);

    case "changeCase": {
      const { columns, mode } = op.params;
      requireColumns(dataset, columns);
      const name = { upper: "MAIÚSCULAS", lower: "minúsculas", title: "Primeira Letra Maiúscula" }[mode];
      return planCells(dataset, columns, `${name} em ${columnNames(dataset, columns)}`, (v) => changeCase(v, mode));
    }

    case "removeAccents":
      requireColumns(dataset, op.params.columns);
      return planCells(dataset, op.params.columns, `Remover acentos em ${columnNames(dataset, op.params.columns)}`, removeAccents);

    case "removeDuplicates": {
      const { columns } = op.params;
      if (columns.length > 0) requireColumns(dataset, columns);
      const seen = new Set<string>();
      const rows: number[] = [];
      dataset.rows.forEach((row, index) => {
        const key = (columns.length > 0 ? columns.map((c) => row[c] ?? "") : row).join("\u0000");
        if (seen.has(key)) rows.push(index);
        else seen.add(key);
      });
      const by = columns.length > 0 ? ` (por ${columnNames(dataset, columns)})` : "";
      return plan({ kind: "deleteRows", rows }, `Remover ${rows.length.toLocaleString("pt-BR")} linhas duplicadas${by}`);
    }

    case "removeEmptyRows": {
      const rows = dataset.rows.flatMap((row, index) => (row.every((cell) => cell.trim() === "") ? [index] : []));
      return plan({ kind: "deleteRows", rows }, `Remover ${rows.length.toLocaleString("pt-BR")} linhas vazias`);
    }

    case "removeEmptyColumns": {
      const columns = emptyColumns(dataset);
      if (columns.length === 0) throw new Error("Não há colunas vazias");
      return plan(deleteColumns(dataset, columns), `Remover ${columnNames(dataset, columns)} vazias`);
    }

    // --- Conversões --------------------------------------------------------------

    case "convertDates": {
      const { columns, to, keepTime } = op.params;
      requireColumns(dataset, columns);
      const label = { dmy: "dd/mm/aaaa", ymd: "aaaa-mm-dd", mdy: "mm/dd/aaaa" }[to];
      return mergePlans(
        `Converter datas para ${label} em ${columnNames(dataset, columns)}`,
        columns.map((column) => {
          const info = dataset.columns[column]!;
          const detected = info.type === "date" ? (info.format as DateFormat) : detectColumnType(values(dataset, column)).format;
          const from = op.params.from ?? (detected === "mdy" || detected === "ymd" ? detected : "dmy");
          return planCells(dataset, [column], "", (v) => outcome(convertDate(v, from, to, keepTime)));
        }),
      );
    }

    case "convertNumbers": {
      const { columns, to, keepCurrency } = op.params;
      requireColumns(dataset, columns);
      return mergePlans(
        `Converter números para ${to === "br" ? "1.234,56" : "1234.56"} em ${columnNames(dataset, columns)}`,
        columns.map((column) => {
          const info = dataset.columns[column]!;
          const from = info.type === "number" ? (info.format as NumberFormat) : "br";
          return planCells(dataset, [column], "", (v) => outcome(convertNumber(v, from, to, keepCurrency)));
        }),
      );
    }

    case "formatDocuments": {
      const { columns, mode, kind, padZeros } = op.params;
      requireColumns(dataset, columns);
      return mergePlans(
        `${mode === "mask" ? "Colocar" : "Tirar"} máscara de CPF/CNPJ em ${columnNames(dataset, columns)}`,
        columns.map((column) => {
          const predominant = predominantDocument(values(dataset, column));
          return planCells(dataset, [column], "", (v) => outcome(formatDocument(v, { mode, kind, padZeros, predominant })));
        }),
      );
    }

    case "formatPhones": {
      const { columns, format, addNinthDigit, defaultDdd } = op.params;
      requireColumns(dataset, columns);
      if (defaultDdd && !/^\d{2}$/.test(defaultDdd)) throw new Error("O DDD padrão deve ter 2 dígitos");
      return planCells(dataset, columns, `Padronizar telefones em ${columnNames(dataset, columns)}`, (v) => {
        const result = normalizePhone(v, { addNinthDigit, defaultDdd: defaultDdd || undefined });
        if (result.kind === "special") return v;
        if (result.kind === "unrecognized") return { unrecognized: result.reason };
        return formatPhone(result.digits, format);
      });
    }

    case "formatCeps": {
      const { columns, mode } = op.params;
      requireColumns(dataset, columns);
      return planCells(
        dataset,
        columns,
        `${mode === "mask" ? "Colocar" : "Tirar"} hífen do CEP em ${columnNames(dataset, columns)}`,
        (v) => outcome(formatCep(v, mode)),
      );
    }

    // --- Estrutura de colunas ------------------------------------------------------

    case "renameColumn": {
      const { column, name } = op.params;
      if (name.trim() === "") throw new Error("O nome não pode ficar vazio");
      return plan(renameColumn(dataset, column, name.trim()), `Renomear ${columnNames(dataset, [column])} para "${name.trim()}"`);
    }

    case "moveColumn": {
      const { from, to } = op.params;
      return plan(moveColumn(dataset, from, to), `Mover ${columnNames(dataset, [from])}`);
    }

    case "deleteColumns":
      requireColumns(dataset, op.params.columns);
      return plan(deleteColumns(dataset, op.params.columns), `Excluir ${columnNames(dataset, op.params.columns)}`);

    case "duplicateColumn":
      return plan(duplicateColumn(dataset, op.params.column), `Duplicar ${columnNames(dataset, [op.params.column])}`);

    case "splitColumn": {
      const { column, separator, parts, names } = op.params;
      return plan(splitColumn(dataset, column, separator, parts, names), `Dividir ${columnNames(dataset, [column])}`);
    }

    case "mergeColumns": {
      const { columns, separator, name, keepOriginals } = op.params;
      return plan(mergeColumns(dataset, columns, separator, name, keepOriginals), `Juntar ${columnNames(dataset, columns)}`);
    }

    // --- Localizar e substituir ------------------------------------------------------

    case "replace": {
      const { columns, ...options } = op.params;
      const targets = columns === "all" ? dataset.columns.map((_, i) => i) : columns;
      requireColumns(dataset, targets);
      const fn = replacer(options);
      const where = columns === "all" ? "" : ` em ${columnNames(dataset, targets)}`;
      return planCells(dataset, targets, `Substituir "${options.find}" por "${options.replace}"${where}`, fn);
    }

    // --- Edição livre ------------------------------------------------------------

    case "insertRows": {
      const { index, count } = op.params;
      if (index < 0 || index > dataset.rows.length) throw new Error("Posição inválida");
      const width = Math.max(1, dataset.columns.length);
      const rows = Array.from({ length: count }, (_, i) => ({ index: index + i, cells: Array<string>(width).fill("") }));
      return plan({ kind: "insertRows", rows }, count === 1 ? "Adicionar linha" : `Adicionar ${count} linhas`);
    }

    case "addColumn": {
      const { index, name } = op.params;
      return plan(addColumn(dataset, index, name), `Adicionar coluna${name ? ` "${name}"` : ""}`);
    }

    case "paste": {
      const { row, column, text } = op.params;
      const lines = parseClipboard(text).length;
      return plan(planPaste(dataset, row, column, text), lines === 1 ? "Colar" : `Colar ${lines} linhas`);
    }
  }
}

// Texto colado de planilha (Excel, Google Sheets): linhas por quebra de linha, colunas por tabulação.
export function parseClipboard(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line) => line.split("\t"));
}

// Cola a partir de (row, column), sobrescrevendo células e criando linhas no fim se faltar.
function planPaste(dataset: Dataset, row: number, column: number, text: string): Patch {
  const values = parseClipboard(text);
  if (values.length === 0) throw new Error("A área de transferência está vazia");
  const width = Math.max(dataset.columns.length, column + Math.max(...values.map((v) => v.length)));
  const fill = (cells: readonly string[], pasted: readonly string[]) => {
    const next = cells.slice();
    while (next.length < column) next.push("");
    pasted.forEach((value, i) => (next[column + i] = value));
    return next;
  };
  const replace: { index: number; cells: string[] }[] = [];
  const insert: { index: number; cells: string[] }[] = [];
  values.forEach((pasted, i) => {
    const target = row + i;
    const existing = dataset.rows[target];
    if (existing) replace.push({ index: target, cells: fill(existing, pasted) });
    else insert.push({ index: dataset.rows.length + insert.length, cells: fill(Array<string>(width).fill(""), pasted) });
  });
  const patches: Patch[] = [];
  if (replace.length > 0) patches.push({ kind: "replace", rows: replace });
  if (insert.length > 0) patches.push({ kind: "insertRows", rows: insert });
  return patches.length === 1 ? patches[0]! : { kind: "batch", patches };
}

// Junta os planos de várias colunas (cada uma com o seu formato de origem) num só passo.
function mergePlans(label: string, plans: Plan[]): Plan {
  const cells = plans.flatMap((p) => (p.patch.kind === "cells" ? p.patch.cells : []));
  const unrecognized = plans
    .flatMap((p) => p.unrecognized)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_UNRECOGNIZED);
  const unrecognizedTotal = plans.reduce((n, p) => n + p.unrecognizedTotal, 0);
  return { patch: { kind: "cells", cells }, label, unrecognized, unrecognizedTotal };
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
