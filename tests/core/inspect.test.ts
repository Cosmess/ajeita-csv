import { describe, expect, it } from "vitest";
import { NormalizedColumns, normalizeText } from "../../src/core/inspect/normalize";
import { searchCells } from "../../src/core/inspect/search";
import { summarizeColumn } from "../../src/core/inspect/summary";
import { allIndices, buildView, type ViewSpec } from "../../src/core/inspect/view";
import { parseText } from "../helpers";

const csv = [
  "nome;cidade;valor;data",
  "Érica;São Paulo;1.234,56;15/03/2025",
  "ana;Recife;89,90;01/12/2024",
  "Bruno;são paulo;;28/02/2026",
  "Ana;Curitiba;15.000,00;",
  "carlos;Recife;0,99;10/10/2023",
].join("\n");

function view(spec: Partial<ViewSpec>) {
  const dataset = parseText(csv);
  const indices = buildView(dataset, { sort: [], filters: [], ...spec }, new NormalizedColumns(dataset));
  return Array.from(indices, (i) => dataset.rows[i]![0]);
}

describe("normalização", () => {
  it("ignora maiúsculas e acentos", () => {
    expect(normalizeText("São JOSÉ")).toBe("sao jose");
    expect(normalizeText("abc")).toBe("abc");
  });
});

describe("ordenação", () => {
  it("ordena texto sem diferenciar acentos e maiúsculas", () => {
    expect(view({ sort: [{ column: 0, direction: "asc" }] })).toEqual(["ana", "Ana", "Bruno", "carlos", "Érica"]);
  });

  it("ordena números em formato BR e deixa vazios no fim", () => {
    expect(view({ sort: [{ column: 2, direction: "asc" }] })).toEqual(["carlos", "ana", "Érica", "Ana", "Bruno"]);
    expect(view({ sort: [{ column: 2, direction: "desc" }] })).toEqual(["Ana", "Érica", "ana", "carlos", "Bruno"]);
  });

  it("ordena datas dd/MM/yyyy cronologicamente", () => {
    expect(view({ sort: [{ column: 3, direction: "asc" }] })).toEqual(["carlos", "ana", "Érica", "Bruno", "Ana"]);
  });

  it("ordena por várias colunas", () => {
    expect(
      view({
        sort: [
          { column: 1, direction: "asc" },
          { column: 0, direction: "desc" },
        ],
      }),
    ).toEqual(["Ana", "carlos", "ana", "Érica", "Bruno"]);
  });
});

describe("filtros", () => {
  it.each([
    [{ column: 1, op: "contains", value: "sao" }, ["Érica", "Bruno"]],
    [{ column: 1, op: "equals", value: "RECIFE" }, ["ana", "carlos"]],
    [{ column: 0, op: "startsWith", value: "a" }, ["ana", "Ana"]],
    [{ column: 2, op: "empty" }, ["Bruno"]],
    [{ column: 3, op: "notEmpty" }, ["Érica", "ana", "Bruno", "carlos"]],
  ] as const)("%j", (filter, expected) => {
    expect(view({ filters: [filter] })).toEqual(expected);
  });

  it("combina filtros e ordenação", () => {
    expect(
      view({
        filters: [{ column: 1, op: "equals", value: "recife" }],
        sort: [{ column: 2, direction: "desc" }],
      }),
    ).toEqual(["ana", "carlos"]);
  });
});

describe("busca", () => {
  it("encontra células na ordem da grade, respeitando a visualização", () => {
    const dataset = parseText(csv);
    const normalized = new NormalizedColumns(dataset);
    const all = searchCells(dataset, allIndices(dataset.rows.length), "sao", normalized);
    expect(all.total).toBe(2);
    expect(Array.from(all.matches)).toEqual([0, 1, 2, 1]);

    const filtered = buildView(dataset, { sort: [], filters: [{ column: 0, op: "equals", value: "bruno" }] }, normalized);
    expect(Array.from(searchCells(dataset, filtered, "sao", normalized).matches)).toEqual([0, 1]);
  });

  it("não busca texto vazio", () => {
    const dataset = parseText(csv);
    expect(searchCells(dataset, allIndices(5), "  ", new NormalizedColumns(dataset)).total).toBe(0);
  });
});

describe("resumo por coluna", () => {
  it("conta vazios, únicos, mínimo, máximo e mais frequentes", () => {
    const summary = summarizeColumn(parseText(csv), 2);
    expect(summary).toMatchObject({ total: 5, empty: 1, unique: 4, type: "number", min: "0,99", max: "15.000,00" });

    const cities = summarizeColumn(parseText(csv), 1);
    expect(cities.top[0]).toEqual({ value: "Recife", count: 2 });
    expect(cities.top).toHaveLength(4);
  });

  it("considera só as linhas visíveis quando pedido", () => {
    const summary = summarizeColumn(parseText(csv), 1, Uint32Array.from([1, 4]));
    expect(summary).toMatchObject({ total: 2, unique: 1, top: [{ value: "Recife", count: 2 }] });
  });

  it("limita aos 10 valores mais frequentes", () => {
    const rows = ["v", ...Array.from({ length: 30 }, (_, i) => `valor${i % 15}`)];
    const summary = summarizeColumn(parseText(rows.join("\n")), 0);
    expect(summary.top).toHaveLength(10);
    expect(summary.top.every((t) => t.count === 2)).toBe(true);
  });
});
