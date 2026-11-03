import { describe, expect, it } from "vitest";
import type { Dataset } from "../../src/core/dataset";
import { applyPatch, type Patch } from "../../src/core/patch";
import { openFixture, parseText } from "../helpers";

const base = () => parseText("nome;valor\nAna;1\nBia;2\nCaio;3\nDani;4\n");
const names = (d: Dataset) => d.rows.map((r) => r[0]);

// Aplicar e depois aplicar o inverso precisa devolver exatamente o original.
function roundTrip(dataset: Dataset, patch: Patch) {
  const applied = applyPatch(dataset, patch);
  const restored = applyPatch(applied.dataset, applied.inverse).dataset;
  expect(restored.rows).toEqual(dataset.rows);
  expect(restored.meta).toEqual(dataset.meta);
  expect(restored.columns).toEqual(dataset.columns);
  return applied.dataset;
}

describe("patches", () => {
  it("cells: troca valores e não altera as linhas originais", () => {
    const dataset = base();
    const changed = roundTrip(dataset, { kind: "cells", cells: [{ row: 1, column: 0, value: "Beatriz" }] });
    expect(changed.rows[1]).toEqual(["Beatriz", "2"]);
    expect(dataset.rows[1]).toEqual(["Bia", "2"]);
  });

  it("cells: recusa célula inexistente", () => {
    expect(() => applyPatch(base(), { kind: "cells", cells: [{ row: 0, column: 5, value: "x" }] })).toThrow("Célula inexistente");
  });

  it("replace: troca linhas inteiras, inclusive o tamanho", () => {
    const changed = roundTrip(base(), { kind: "replace", rows: [{ index: 0, cells: ["Ana", "1", "extra"] }] });
    expect(changed.columns).toHaveLength(3);
    expect(changed.columns[2]!.name).toBe("Coluna 3");
  });

  it("splice: remove e insere linhas", () => {
    const changed = roundTrip(base(), { kind: "splice", index: 1, remove: 2, insert: [["Xis", "9"]] });
    expect(names(changed)).toEqual(["Ana", "Xis", "Dani"]);
  });

  it("deleteRows e insertRows", () => {
    const changed = roundTrip(base(), { kind: "deleteRows", rows: [0, 2] });
    expect(names(changed)).toEqual(["Bia", "Dani"]);
    const inserted = roundTrip(base(), { kind: "insertRows", rows: [{ index: 0, cells: ["Zé", "0"] }, { index: 3, cells: ["Yu", "5"] }] });
    expect(names(inserted)).toEqual(["Zé", "Ana", "Bia", "Yu", "Caio", "Dani"]);
  });

  it("permute: reordena", () => {
    const changed = roundTrip(base(), { kind: "permute", order: Uint32Array.from([3, 2, 1, 0]) });
    expect(names(changed)).toEqual(["Dani", "Caio", "Bia", "Ana"]);
  });

  it("header: liga e desliga o cabeçalho sem perder nada", () => {
    const off = roundTrip(base(), { kind: "header", hasHeader: false });
    expect(off.meta.hasHeader).toBe(false);
    expect(off.rows[0]).toEqual(["nome", "valor"]);
    expect(off.columns[0]!.name).toBe("Coluna 1");

    const on = roundTrip(off, { kind: "header", hasHeader: true });
    expect(on.meta.header).toEqual(["nome", "valor"]);
    expect(on.rows).toEqual(base().rows);
  });

  it("batch: aplica em sequência e desfaz na ordem inversa", () => {
    const changed = roundTrip(base(), {
      kind: "batch",
      patches: [
        { kind: "cells", cells: [{ row: 0, column: 0, value: "Ana Maria" }] },
        { kind: "deleteRows", rows: [1] },
        { kind: "permute", order: Uint32Array.from([2, 1, 0]) },
      ],
    });
    expect(names(changed)).toEqual(["Dani", "Caio", "Ana Maria"]);
  });

  it("recalcula o índice das aspas não fechadas quando linhas mudam de lugar", () => {
    const dataset = openFixture("linhas-quebradas.csv");
    expect(dataset.meta.issues[0]!.row).toBe(4);
    expect(roundTrip(dataset, { kind: "deleteRows", rows: [0, 1] }).meta.issues[0]!.row).toBe(2);
    expect(roundTrip(dataset, { kind: "insertRows", rows: [{ index: 0, cells: ["x"] }] }).meta.issues[0]!.row).toBe(5);
    expect(roundTrip(dataset, { kind: "deleteRows", rows: [4] }).meta.issues).toEqual([]);
    expect(roundTrip(dataset, { kind: "permute", order: Uint32Array.from([4, 0, 1, 2, 3]) }).meta.issues[0]!.row).toBe(0);
    expect(roundTrip(dataset, { kind: "header", hasHeader: false }).meta.issues[0]!.row).toBe(5);
  });
});
