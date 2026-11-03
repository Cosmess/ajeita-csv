import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { emptyHistory, execute } from "../src/core/history";
import { indexedDbStore } from "../src/storage/session";
import { openFixture } from "./helpers";

describe("sessão no IndexedDB", () => {
  it("salva, lê o resumo, restaura e limpa", async () => {
    const dataset = openFixture("linhas-quebradas.csv");
    const { history } = execute(dataset, emptyHistory(), { op: "applySort", params: { sort: [{ column: 1, direction: "asc" }] } });
    const file = new Blob(["id,nome\n"]);

    await indexedDbStore.save({ savedAt: 123, fileName: "x.csv", file, dataset, history, view: { sort: [], filters: [] } });
    expect(await indexedDbStore.summary()).toEqual({ fileName: "x.csv", savedAt: 123, rowCount: 5, steps: 1 });

    const loaded = await indexedDbStore.load();
    expect(loaded?.dataset).toEqual(dataset);
    // O patch de reordenação (Uint32Array) sobrevive ao armazenamento.
    const step = loaded?.history.done[0];
    expect(step?.forward.kind === "permute" && step.forward.order).toBeInstanceOf(Uint32Array);

    await indexedDbStore.clear();
    expect(await indexedDbStore.summary()).toBeUndefined();
    expect(await indexedDbStore.load()).toBeUndefined();
  });

  it("divide arquivos grandes em blocos e junta na ordem certa", async () => {
    const rows = Array.from({ length: 45_123 }, (_, i) => [String(i), `nome ${i}`]);
    const base = openFixture("clientes-utf8-virgula.csv");
    const dataset = { ...base, rows };
    await indexedDbStore.save({ savedAt: 1, fileName: "grande.csv", file: new Blob([]), dataset, history: emptyHistory(), view: { sort: [], filters: [] } });
    const loaded = await indexedDbStore.load();
    expect(loaded?.dataset.rows).toHaveLength(45_123);
    expect(loaded?.dataset.rows[20_000]).toEqual(["20000", "nome 20000"]);
    expect(loaded?.dataset.rows.at(-1)).toEqual(["45122", "nome 45122"]);
    expect(loaded?.dataset.columns).toEqual(base.columns);
  });
});
