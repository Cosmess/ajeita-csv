import { describe, expect, it } from "vitest";
import { EXPORT_PRESETS } from "../src/core/export/csv";
import type { OpenProgress } from "../src/workers/protocol";
import { WorkerSession } from "../src/workers/session";
import { fixture } from "./helpers";

const fileFrom = (name: string) => new File([fixture(name)], name);

async function openCsv(name: string) {
  const session = new WorkerSession();
  const events: OpenProgress[] = [];
  const result = await session.open(fileFrom(name), undefined, (p) => events.push(p));
  if (result.status !== "opened") throw new Error("esperava arquivo aberto");
  return { session, info: result.info, events };
}

describe("sessão do worker", () => {
  it("abre CSV, envia prévia e devolve as informações do arquivo", async () => {
    const { info, events } = await openCsv("clientes-windows1252-ponto-virgula.csv");
    expect(info).toMatchObject({ fileName: "clientes-windows1252-ponto-virgula.csv", rowCount: 5, sheets: [] });
    expect(info.meta).toMatchObject({ encoding: "windows-1252", delimiter: ";", hasHeader: true });
    expect(events.find((e) => e.preview)?.preview?.columns[0]).toBe("nome");
    expect(events.at(-1)?.fraction).toBe(1);
  });

  it("entrega as linhas visíveis por faixa", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    const page = session.getRows(1, 2);
    expect(page.indices).toEqual([1, 2]);
    expect(page.rows.map((r) => r[0])).toEqual(["Maria Conceição", "José Araújo"]);
  });

  it("aplica filtro e ordenação, e as linhas seguem a nova ordem", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    const view = session.setView({
      filters: [{ column: 4, op: "equals", value: "sp" }],
      sort: [{ column: 6, direction: "desc" }],
    });
    expect(view.viewCount).toBe(2);
    expect(session.getRows(0, 10).rows.map((r) => r[6])).toEqual(["1.234,56", "450,75"]);
  });

  it("busca e navega entre as ocorrências", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    expect(session.search("paulo")).toEqual({ total: 1, stored: 1 });
    expect(session.getMatch(0)).toEqual({ position: 0, column: 3 });
    expect(session.getMatch(1)).toBeNull();
  });

  it("troca o cabeçalho sem ler o arquivo de novo e troca delimitador relendo", async () => {
    const { session } = await openCsv("sem-cabecalho.csv");
    const withHeader = await session.reopen({ hasHeader: true }, undefined, () => {});
    expect(withHeader.rowCount).toBe(3);
    expect(withHeader.columns[1]!.name).toBe("Maria");

    const comma = await session.reopen({ delimiter: "," }, undefined, () => {});
    expect(comma.meta).toMatchObject({ delimiter: ",", hasHeader: true });
  });

  it("verifica caracteres fora do Windows-1252 e exporta com a política escolhida", async () => {
    const { session } = await openCsv("fora-windows-1252.csv");
    const options = { ...EXPORT_PRESETS["excel-br"], encoding: "windows-1252" as const };
    const check = session.checkExport(options, "all");
    expect(check.unencodable.map((u) => u.char)).toEqual(["😀", "₹", "✓"]);

    const bytes = session.exportFile(options, "all", "remove");
    const text = new TextDecoder("windows-1252").decode(bytes);
    expect(text).toContain("Cliente adorou \r\n");
    expect(text).toContain("€ 20");
  });

  it("exporta só a visualização quando pedido", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    session.setView({ filters: [{ column: 4, op: "equals", value: "MG" }], sort: [] });
    const text = new TextDecoder().decode(session.exportFile(EXPORT_PRESETS.csv, "view", "replace"));
    expect(text.trim().split("\n")).toHaveLength(2);
    expect(text).toContain("Maria Conceição");
  });

  it("pede a aba de um .xlsx com várias e abre a escolhida", async () => {
    const session = new WorkerSession();
    const first = await session.open(fileFrom("planilha-duas-abas.xlsx"), undefined, () => {});
    expect(first).toEqual({ status: "choose-sheet", sheets: ["Clientes", "Produtos"] });

    const opened = await session.open(fileFrom("planilha-duas-abas.xlsx"), "Produtos", () => {});
    expect(opened.status === "opened" && opened.info.meta.sheet).toBe("Produtos");

    const other = await session.reopen({}, "Clientes", () => {});
    expect(other).toMatchObject({ rowCount: 3, sheets: ["Clientes", "Produtos"] });
    expect(session.getRows(0, 1).rows[0]![1]).toBe("529.982.247-25");
  });

  it("dá erro claro quando não há arquivo aberto", () => {
    expect(() => new WorkerSession().getRows(0, 10)).toThrow("Nenhum arquivo aberto");
  });
});
