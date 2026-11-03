import { describe, expect, it } from "vitest";
import type { Dataset } from "../../src/core/dataset";
import { emptyHistory, execute, redo, undo, type History } from "../../src/core/history";
import type { Op } from "../../src/core/ops";
import { openFixture } from "../helpers";

// Gerador com semente fixa: o teste é sempre o mesmo.
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function randomOp(dataset: Dataset, next: () => number): Op {
  const row = Math.floor(next() * dataset.rows.length);
  const width = dataset.rows[row]?.length ?? 1;
  switch (Math.floor(next() * 7)) {
    case 0:
      return { op: "editCell", params: { row, column: Math.floor(next() * (width + 1)), value: `v${Math.floor(next() * 100)}` } };
    case 1:
      // Mantém algumas linhas para as próximas operações terem onde atuar.
      if (dataset.rows.length < 4) return { op: "editRow", params: { row, text: "a;b\nc;d\ne;f" } };
      return { op: "deleteRows", params: { rows: [row, Math.floor(next() * dataset.rows.length)] } };
    case 2:
      return { op: "editRow", params: { row, text: "x;y\nz;w" } };
    case 3:
      return { op: "applySort", params: { sort: [{ column: 0, direction: next() < 0.5 ? "asc" : "desc" }] } };
    case 4:
      return { op: "setHeader", params: { hasHeader: !dataset.meta.hasHeader } };
    case 5:
      return { op: "fixEncoding", params: {} };
    default:
      return { op: "editCell", params: { row, column: 0, value: "JoÃ£o" } };
  }
}

describe("desfazer e refazer", () => {
  it("50 passos desfeitos devolvem exatamente o original, e refeitos o estado final", () => {
    const original = openFixture("sujeira.csv");
    const next = random(7);
    let dataset = original;
    let history: History = emptyHistory();
    const states: Dataset[] = [];

    for (let i = 0; i < 50; i++) {
      states.push(dataset);
      ({ dataset, history } = execute(dataset, history, randomOp(dataset, next)));
    }
    const final = dataset;
    expect(history.done).toHaveLength(50);

    for (let i = 49; i >= 0; i--) {
      ({ dataset, history } = undo(dataset, history)!);
      expect(dataset.rows).toEqual(states[i]!.rows);
    }
    expect(dataset).toEqual(original);
    expect(undo(dataset, history)).toBeUndefined();

    for (let i = 0; i < 50; i++) ({ dataset, history } = redo(dataset, history)!);
    expect(dataset).toEqual(final);
    expect(redo(dataset, history)).toBeUndefined();
  });

  it("uma nova alteração depois de desfazer descarta o que podia ser refeito", () => {
    let { dataset, history } = execute(openFixture("sujeira.csv"), emptyHistory(), {
      op: "deleteRows",
      params: { rows: [0] },
    });
    ({ dataset, history } = undo(dataset, history)!);
    expect(history.undone).toHaveLength(1);
    ({ history } = execute(dataset, history, { op: "deleteRows", params: { rows: [1] } }));
    expect(history.undone).toHaveLength(0);
    expect(history.done.map((s) => s.label)).toEqual(["Excluir linha 2"]);
  });

  it("guarda cada passo como { op, params } serializável", () => {
    const { history } = execute(openFixture("mojibake.csv"), emptyHistory(), { op: "fixEncoding", params: {} });
    const step = history.done[0]!;
    expect(JSON.parse(JSON.stringify(step.op))).toEqual({ op: "fixEncoding", params: {} });
    expect(step.label).toBe("Corrigir acentos quebrados");
  });
});
