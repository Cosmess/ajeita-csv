import { describe, expect, it } from "vitest";
import { buildDataset, tableFromRows } from "../../src/core/parse";
import { readSheetRows, readWorkbook } from "../../src/core/parse/xlsx";
import { fixture } from "../helpers";

describe("leitura de .xlsx", () => {
  const workbook = readWorkbook(fixture("planilha-duas-abas.xlsx"));

  it("lista as abas", () => {
    expect(workbook.SheetNames).toEqual(["Clientes", "Produtos"]);
  });

  it("lê valores como texto, sem perder zeros à esquerda", () => {
    const rows = readSheetRows(workbook, "Clientes");
    expect(rows[2]![1]).toBe("01234567890");
    expect(rows[3]![1]).toBe("00012345601");
    expect(readSheetRows(workbook, "Produtos")[1]![0]).toBe("0001");
  });

  it("mostra datas como dd/mm/aaaa, não como número serial", () => {
    expect(readSheetRows(workbook, "Clientes")[1]![2]).toBe("15/03/2025");
  });

  it("monta o dataset com cabeçalho e tipos", () => {
    const dataset = buildDataset(tableFromRows(readSheetRows(workbook, "Clientes"), { sheet: "Clientes" }));
    expect(dataset.meta).toMatchObject({ source: "xlsx", hasHeader: true, sheet: "Clientes" });
    expect(dataset.columns.map((c) => [c.name, c.type])).toEqual([
      ["nome", "string"],
      ["cpf", "string"],
      ["data_cadastro", "date"],
      ["valor_compra", "number"],
    ]);
  });

  it("dá erro claro para aba inexistente", () => {
    expect(() => readSheetRows(workbook, "Nada")).toThrow("Aba não encontrada: Nada");
  });
});
