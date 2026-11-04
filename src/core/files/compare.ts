import type { Dataset, DateFormat, NumberFormat } from "../dataset";
import { KeyTable } from "../inspect/key-table";
import { parseNumber } from "../parse/values";
import { parseDateParts } from "../transform/convert";
import { removeAccents } from "../transform/text";

// Compara duas versões de uma planilha ("antes" e "depois"), casando as linhas por
// colunas-chave (ou pela posição) e as colunas pelo nome do cabeçalho.

export type CompareOptions = {
  // Colunas-chave pelo nome; vazio compara linha a linha, pela posição.
  keys: string[];
  // Ignora maiúsculas, acentos e espaços extras.
  ignoreCase: boolean;
  // Números e datas pelo valor (1.234,56 = 1234.56), CPF/CNPJ só pelos dígitos.
  byValue: boolean;
  // Inclui as linhas que não mudaram no resultado.
  includeSame: boolean;
};

export type CompareSide = { name: string; dataset: Dataset };

export type CompareStatus = "Novo" | "Removido" | "Alterado" | "Igual";

export const STATUS_COLUMN = "situação";
export const CHANGES_COLUMN = "alterações";
export const COMPARE_STATUSES: CompareStatus[] = ["Novo", "Removido", "Alterado", "Igual"];

export type CompareSummary = {
  counts: Record<CompareStatus, number>;
  // Chaves repetidas num arquivo: as linhas com a mesma chave são casadas na ordem.
  duplicateKeys: { before: number; after: number };
};

// Mesma coluna nos dois arquivos: compara o nome sem maiúsculas nem espaços nas pontas.
const columnKey = (name: string) => name.trim().toLocaleLowerCase("pt-BR");

export type CompareColumns = { common: string[]; onlyBefore: string[]; onlyAfter: string[] };

export function compareColumns(before: Dataset, after: Dataset): CompareColumns {
  const afterKeys = new Set(after.columns.map((c) => columnKey(c.name)));
  const beforeKeys = new Set(before.columns.map((c) => columnKey(c.name)));
  return {
    common: before.columns.filter((c) => afterKeys.has(columnKey(c.name))).map((c) => c.name.trim()),
    onlyBefore: before.columns.filter((c) => !afterKeys.has(columnKey(c.name))).map((c) => c.name.trim()),
    onlyAfter: after.columns.filter((c) => !beforeKeys.has(columnKey(c.name))).map((c) => c.name.trim()),
  };
}

const KEY_NAMES = /\b(id|codigo|cod|cpf|cnpj|documento|matricula|email|e mail|chave|sku|registro)\b/;

// Sugere uma coluna-chave: presente nos dois arquivos, sem vazios e sem repetição em
// nenhum deles. Dá preferência a nomes como "id", "código", "CPF" e "e-mail".
export function suggestKey(before: Dataset, after: Dataset): string | undefined {
  const { common } = compareColumns(before, after);
  const unique = (dataset: Dataset, name: string) => {
    const index = dataset.columns.findIndex((c) => columnKey(c.name) === columnKey(name));
    const seen = new Set<string>();
    for (const row of dataset.rows) {
      const value = (row[index] ?? "").trim();
      if (value === "" || seen.has(value)) return false;
      seen.add(value);
    }
    return seen.size > 0;
  };
  const words = (name: string) => removeAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const candidates = [...common].sort((a, b) => Number(KEY_NAMES.test(words(b))) - Number(KEY_NAMES.test(words(a))));
  return candidates.find((name) => unique(before, name) && unique(after, name));
}

// --- Comparação de valores ------------------------------------------------------

type Normalizer = (value: string) => string;

// CPF, CNPJ, CEP (com ou sem máscara) e sequências longas de dígitos são identificadores:
// comparados só pelos dígitos, sem os zeros à esquerda que o Excel costuma tirar.
const IDENTIFIER = /^(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{5}-\d{3}|\d{8,14})$/;

function normalizer(dataset: Dataset, column: number, options: CompareOptions): Normalizer {
  const info = dataset.columns[column]!;
  const text = options.ignoreCase
    ? (v: string) => removeAccents(v).toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
    : (v: string) => v;
  if (!options.byValue) return text;
  return (raw) => {
    const v = raw.trim();
    if (v === "") return "";
    if (IDENTIFIER.test(v)) return `i:${v.replace(/\D/g, "").replace(/^0+(?=\d)/, "")}`;
    if (info.type === "number") {
      const n = parseNumber(v, info.format as NumberFormat);
      if (!Number.isNaN(n)) return `n:${n}`;
    }
    if (info.type === "date") {
      const parts = parseDateParts(v, info.format as DateFormat);
      if (parts) {
        const time = parts.time ? ` ${parts.time.split(":").map((p) => p.padStart(2, "0")).join(":")}` : "";
        return `d:${parts.y}-${parts.m.padStart(2, "0")}-${parts.d.padStart(2, "0")}${time}`;
      }
    }
    return text(raw);
  };
}

// --- Texto da coluna "alterações" -----------------------------------------------

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export type CellChange = { column: string; before: string; after: string };

export function formatChanges(changes: readonly CellChange[]): string {
  return changes.map((c) => `${c.column}: ${quote(c.before)} → ${quote(c.after)}`).join("; ");
}

// Lê de volta o texto de formatChanges. `columns`: nomes conhecidos, para não depender
// de separadores que também podem aparecer nos valores.
export function parseChanges(text: string, columns: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  let position = 0;
  const readQuoted = (): string | undefined => {
    if (text[position] !== '"') return undefined;
    let value = "";
    position++;
    while (position < text.length) {
      const char = text[position]!;
      if (char === '"') {
        if (text[position + 1] === '"') {
          value += '"';
          position += 2;
          continue;
        }
        position++;
        return value;
      }
      value += char;
      position++;
    }
    return undefined;
  };
  const byLength = [...columns].sort((a, b) => b.length - a.length);
  while (position < text.length) {
    const column = byLength.find((name) => text.startsWith(`${name}: "`, position));
    if (column === undefined) break;
    position += column.length + 2;
    const before = readQuoted();
    if (before === undefined || !text.startsWith(" → ", position)) break;
    position += 3;
    if (readQuoted() === undefined) break;
    result.set(column, before);
    if (!text.startsWith("; ", position)) break;
    position += 2;
  }
  return result;
}

// --- Comparação ---------------------------------------------------------------------

export type CompareResult = { rows: string[][]; summary: CompareSummary };

export function compareDatasets(before: CompareSide, after: CompareSide, options: CompareOptions): CompareResult {
  const a = before.dataset;
  const b = after.dataset;
  // Colunas do resultado: as do "antes", depois as que só existem no "depois".
  const names = [...a.columns.map((c) => c.name.trim())];
  const position = new Map(names.map((name, i) => [columnKey(name), i]));
  for (const column of b.columns) {
    if (position.has(columnKey(column.name))) continue;
    position.set(columnKey(column.name), names.length);
    names.push(column.name.trim());
  }
  const targetsA = a.columns.map((c) => position.get(columnKey(c.name))!);
  const targetsB = b.columns.map((c) => position.get(columnKey(c.name))!);
  // Colunas comparadas: as que existem nos dois, com o índice em cada arquivo.
  const compared = a.columns.flatMap((c, i) => {
    const j = b.columns.findIndex((d) => columnKey(d.name) === columnKey(c.name));
    return j < 0 ? [] : [{ name: names[targetsA[i]!]!, a: i, b: j, normA: normalizer(a, i, options), normB: normalizer(b, j, options) }];
  });

  const keyColumns = options.keys.map((name) => {
    const column = compared.find((c) => columnKey(c.name) === columnKey(name));
    if (!column) throw new Error(`A coluna-chave "${name}" precisa existir nos dois arquivos`);
    return column;
  });
  const single = keyColumns.length === 1 ? keyColumns[0]! : undefined;
  const keyOf = (row: readonly string[], side: "a" | "b") =>
    single
      ? (side === "a" ? single.normA : single.normB)(row[single[side]] ?? "")
      : keyColumns.map((c) => (side === "a" ? c.normA : c.normB)(row[c[side]] ?? "")).join("\u0000");

  // Próxima linha do "antes" ainda sem par, por chave. As chaves normalizadas ("n:1234",
  // "i:52998224725") são montadas por concatenação, o que deixa o Map do Chrome lento:
  // por isso a KeyTable. Chaves repetidas, que são raras, guardam as linhas seguintes em
  // `repeated`.
  const SEEN = -1; // a chave já apareceu no "depois" e não sobra linha no "antes"
  const next = new KeyTable();
  const repeated = new Map<string, number[]>();
  const seenRepeated = new Set<string>();
  let duplicatesA = 0;
  let duplicatesB = 0;
  if (keyColumns.length > 0) {
    a.rows.forEach((row, index) => {
      const key = keyOf(row, "a");
      if (!next.has(key)) next.set(key, index);
      else {
        duplicatesA++;
        const queue = repeated.get(key);
        if (queue) queue.push(index);
        else repeated.set(key, [index]);
      }
    });
  }
  const take = (key: string): number | undefined => {
    const index = next.get(key);
    if (index === undefined || index === SEEN) {
      if (index === SEEN) duplicatesB++;
      next.set(key, SEEN);
      return undefined;
    }
    const queue = repeated.size > 0 ? repeated.get(key) : undefined;
    if (queue) {
      // Chave repetida no "antes": a partir da segunda vez, também é repetida no "depois".
      if (seenRepeated.has(key)) duplicatesB++;
      else seenRepeated.add(key);
      next.set(key, queue.shift() ?? SEEN);
    } else next.set(key, SEEN);
    return index;
  };

  const counts: Record<CompareStatus, number> = { Novo: 0, Removido: 0, Alterado: 0, Igual: 0 };
  const width = names.length + 2;
  const out: string[][] = [[STATUS_COLUMN, ...names, CHANGES_COLUMN]];
  const matched = new Uint8Array(a.rows.length);

  const emit = (status: CompareStatus, cells: string[], changes = "") => {
    counts[status]++;
    if (status === "Igual" && !options.includeSame) return;
    cells[0] = status;
    cells[width - 1] = changes;
    out.push(cells);
  };
  const place = (cells: string[], row: readonly string[], targets: number[]) =>
    targets.forEach((target, c) => (cells[target + 1] = row[c] ?? ""));

  b.rows.forEach((rowB, indexB) => {
    let indexA: number | undefined;
    if (keyColumns.length > 0) indexA = take(keyOf(rowB, "b"));
    else if (indexB < a.rows.length) indexA = indexB;

    const cells = Array<string>(width).fill("");
    if (indexA === undefined) {
      place(cells, rowB, targetsB);
      emit("Novo", cells);
      return;
    }
    matched[indexA] = 1;
    const rowA = a.rows[indexA]!;
    // Colunas que só existem no "antes" ficam com o valor antigo; as demais, com o novo.
    place(cells, rowA, targetsA);
    place(cells, rowB, targetsB);
    const changes: CellChange[] = [];
    for (const c of compared) {
      const va = rowA[c.a] ?? "";
      const vb = rowB[c.b] ?? "";
      if (va !== vb && c.normA(va) !== c.normB(vb)) changes.push({ column: c.name, before: va, after: vb });
    }
    emit(changes.length > 0 ? "Alterado" : "Igual", cells, formatChanges(changes));
  });

  a.rows.forEach((rowA, indexA) => {
    if (matched[indexA]) return;
    const cells = Array<string>(width).fill("");
    place(cells, rowA, targetsA);
    emit("Removido", cells);
  });

  return { rows: out, summary: { counts, duplicateKeys: { before: duplicatesA, after: duplicatesB } } };
}
