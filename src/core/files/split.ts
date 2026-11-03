import type { Dataset } from "../dataset";

export type SplitMode = { mode: "rows"; size: number } | { mode: "column"; column: number };

export type SplitPart = { name: string; rows: Uint32Array };

export const MAX_PARTS = 500;

// Tira o que não pode aparecer em nome de arquivo em nenhum sistema.
export function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
}

// Divide as linhas (todas, ou só as da visualização) em partes. Não altera os dados.
export function planSplit(dataset: Dataset, split: SplitMode, base: string, extension: string, rows?: Uint32Array): SplitPart[] {
  const indices = rows ?? Uint32Array.from({ length: dataset.rows.length }, (_, i) => i);
  const parts: SplitPart[] = [];

  if (split.mode === "rows") {
    if (!Number.isInteger(split.size) || split.size < 1) throw new Error("Informe quantas linhas cada parte deve ter");
    const total = Math.ceil(indices.length / split.size);
    if (total > MAX_PARTS) throw new Error(tooMany(total));
    const digits = Math.max(3, String(total).length);
    for (let p = 0; p < total; p++) {
      parts.push({
        name: `${base}_parte_${String(p + 1).padStart(digits, "0")}.${extension}`,
        rows: indices.subarray(p * split.size, (p + 1) * split.size),
      });
    }
    return parts;
  }

  if (split.column < 0 || split.column >= dataset.columns.length) throw new Error("Escolha a coluna");
  // Um arquivo por valor, na ordem em que os valores aparecem.
  const groups = new Map<string, number[]>();
  for (const index of indices) {
    const value = (dataset.rows[index]![split.column] ?? "").trim();
    let group = groups.get(value);
    if (!group) {
      if (groups.size >= MAX_PARTS) throw new Error(tooMany(countDistinct(dataset, split.column, indices)));
      group = [];
      groups.set(value, group);
    }
    group.push(index);
  }
  const used = new Map<string, number>();
  for (const [value, group] of groups) {
    const label = safeFileName(value) || "sem_valor";
    const key = label.toLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    parts.push({ name: `${base}_${label}${count > 1 ? `_${count}` : ""}.${extension}`, rows: Uint32Array.from(group) });
  }
  return parts;
}

function countDistinct(dataset: Dataset, column: number, indices: Uint32Array): number {
  const values = new Set<string>();
  for (const index of indices) values.add((dataset.rows[index]![column] ?? "").trim());
  return values.size;
}

const tooMany = (total: number) =>
  `Isso geraria ${total.toLocaleString("pt-BR")} arquivos; o limite é ${MAX_PARTS}. Use partes maiores ou outra coluna.`;
