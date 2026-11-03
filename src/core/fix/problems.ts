import Papa from "papaparse";
import type { Dataset, Delimiter } from "../dataset";
import type { Patch } from "../patch";

export type ProblemKind = "column_count" | "unclosed_quote" | "line_break";

export type Problem = { row: number; kinds: ProblemKind[]; message: string };

export const PROBLEM_LABELS: Record<ProblemKind, string> = {
  unclosed_quote: "Aspas não fechadas",
  column_count: "Número de colunas diferente",
  line_break: "Quebra de linha dentro de campo",
};

const isEmptyRow = (row: readonly string[]) => row.length === 1 && row[0] === "";
const hasLineBreak = (row: readonly string[]) => row.some((cell) => cell.includes("\n") || cell.includes("\r"));

// Quantas colunas cada linha deveria ter: a do cabeçalho ou, sem ele, a mais comum.
export function expectedColumns(dataset: Dataset): number {
  if (dataset.meta.hasHeader && dataset.meta.header.length > 0) return dataset.meta.header.length;
  const counts = new Map<number, number>();
  for (const row of dataset.rows) if (!isEmptyRow(row)) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  let best = 0;
  let frequency = 0;
  for (const [length, count] of counts) {
    if (count > frequency) {
      best = length;
      frequency = count;
    }
  }
  return best;
}

export function findProblems(dataset: Dataset): Problem[] {
  const expected = expectedColumns(dataset);
  const quoted = new Set(dataset.meta.issues.filter((i) => i.kind === "unclosed_quote").map((i) => i.row));
  const problems: Problem[] = [];

  dataset.rows.forEach((row, index) => {
    if (isEmptyRow(row)) return;
    const kinds: ProblemKind[] = [];
    const messages: string[] = [];
    if (quoted.has(index)) {
      kinds.push("unclosed_quote");
      messages.push("Aspas não fechadas: as linhas seguintes podem ter sido juntadas a esta");
    }
    if (row.length !== expected) {
      kinds.push("column_count");
      messages.push(`Tem ${row.length} ${row.length === 1 ? "coluna" : "colunas"}; o esperado é ${expected}`);
    }
    if (!quoted.has(index) && hasLineBreak(row)) {
      kinds.push("line_break");
      messages.push("Quebra de linha dentro de um campo");
    }
    if (kinds.length > 0) problems.push({ row: index, kinds, message: messages.join(". ") });
  });
  return problems;
}

export function countProblems(problems: readonly Problem[]): Record<ProblemKind, number> {
  const counts: Record<ProblemKind, number> = { column_count: 0, unclosed_quote: 0, line_break: 0 };
  for (const problem of problems) for (const kind of problem.kinds) counts[kind]++;
  return counts;
}

// Texto de uma linha como apareceria no arquivo, para edição manual.
export function rowToText(row: readonly string[], delimiter: Delimiter): string {
  return Papa.unparse([row as string[]], { delimiter, newline: "\n", escapeFormulae: false });
}

// Lê o texto editado pelo usuário. Pode virar mais de uma linha; vazio vira nenhuma.
export function parseRowText(text: string, delimiter: Delimiter): string[][] {
  if (text.trim() === "") return [];
  const { data } = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true });
  return data;
}

// Uma aspa aberta e não fechada faz o parser juntar as linhas seguintes num só
// campo. Reconstrói o texto original (sem a aspa solta) e lê linha por linha de novo.
export function splitUnclosedQuote(row: readonly string[], delimiter: Delimiter): string[][] | undefined {
  const broken = row.findIndex((cell) => cell.includes("\n") || cell.includes("\r"));
  if (broken < 0) return undefined;
  const before = row.slice(0, broken);
  const after = row.slice(broken + 1);
  // Se havia campos depois, o parser fechou o campo numa aspa mais adiante; ela volta ao texto.
  const text =
    (before.length > 0 ? rowToText(before, delimiter) + delimiter : "") +
    row[broken]! +
    (after.length > 0 ? '"' + delimiter + rowToText(after, delimiter) : "");
  const rows = text
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== "")
    .map((line) => Papa.parse<string[]>(line, { delimiter }).data[0] ?? [""]);
  return rows.length > 1 ? rows : undefined;
}

// Completa linhas curtas com vazios; em linhas longas, junta o excedente no último
// campo (costuma ser um separador sem aspas dentro do texto).
function fitColumns(row: string[], expected: number, delimiter: Delimiter): string[] {
  if (expected <= 0 || row.length === expected) return row;
  if (row.length < expected) return [...row, ...Array<string>(expected - row.length).fill("")];
  return [...row.slice(0, expected - 1), row.slice(expected - 1).join(delimiter)];
}

// Correção automática de uma linha, conforme os problemas dela.
function fixRow(row: string[], kinds: readonly ProblemKind[], expected: number, delimiter: Delimiter): string[][] {
  if (kinds.includes("unclosed_quote")) {
    const split = splitUnclosedQuote(row, delimiter);
    if (split) return split.map((r) => fitColumns(r, expected, delimiter));
  }
  let fixed = row;
  if (kinds.includes("line_break") || kinds.includes("unclosed_quote")) {
    fixed = fixed.map((cell) => cell.replace(/\s*(\r\n|\n|\r)\s*/g, " "));
  }
  return [fitColumns(fixed, expected, delimiter)];
}

export function planProblemFix(dataset: Dataset, problems: readonly Problem[]): Patch {
  const expected = expectedColumns(dataset);
  const { delimiter } = dataset.meta;
  const replace: { index: number; cells: string[] }[] = [];
  const splices: Patch[] = [];
  for (const problem of problems) {
    const fixed = fixRow(dataset.rows[problem.row]!, problem.kinds, expected, delimiter);
    if (fixed.length === 1) replace.push({ index: problem.row, cells: fixed[0]! });
    else splices.push({ kind: "splice", index: problem.row, remove: 1, insert: fixed });
  }
  // Substituições não mudam índices; divisões vão de baixo para cima para não deslocar as próximas.
  const patches: Patch[] = [];
  if (replace.length > 0) patches.push({ kind: "replace", rows: replace });
  patches.push(...splices.reverse());
  return patches.length === 1 ? patches[0]! : { kind: "batch", patches };
}
