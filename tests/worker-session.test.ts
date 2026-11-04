import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { EXPORT_PRESETS } from "../src/core/export/csv";
import type { OpenProgress } from "../src/workers/protocol";
import { WorkerSession } from "../src/workers/session";
import { fixture } from "./helpers";
import { memoryStore } from "./memory-store";

const fileFrom = (name: string) => new File([fixture(name)], name);

async function openCsv(name: string, store = memoryStore()) {
  const session = new WorkerSession({ store, saveDelay: 0 });
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
    const session = new WorkerSession({ store: memoryStore(), saveDelay: 0 });
    const first = await session.open(fileFrom("planilha-duas-abas.xlsx"), undefined, () => {});
    expect(first).toEqual({ status: "choose-sheet", sheets: ["Clientes", "Produtos"] });

    const opened = await session.open(fileFrom("planilha-duas-abas.xlsx"), "Produtos", () => {});
    expect(opened.status === "opened" && opened.info.meta.sheet).toBe("Produtos");

    const other = await session.reopen({}, "Clientes", () => {});
    expect(other).toMatchObject({ rowCount: 3, sheets: ["Clientes", "Produtos"] });
    expect(session.getRows(0, 1).rows[0]![1]).toBe("529.982.247-25");
  });

  it("dá erro claro quando não há arquivo aberto", () => {
    expect(() => new WorkerSession({ store: memoryStore(), saveDelay: 0 }).getRows(0, 10)).toThrow("Nenhum arquivo aberto");
  });

  it("corrige, desfaz e refaz, informando o que seria desfeito", async () => {
    const { session, info } = await openCsv("mojibake.csv");
    expect(info.mojibakeCells).toBe(14);
    expect(info.undo).toBeUndefined();

    const preview = session.preview({ op: "fixEncoding", params: {} });
    expect(preview.changedCells).toBe(14);

    const fixed = session.execute({ op: "fixEncoding", params: {} });
    expect(fixed).toMatchObject({ mojibakeCells: 0, undo: "Corrigir acentos quebrados" });
    expect(session.getRows(0, 1).rows[0]![0]).toBe("João");

    const undone = session.undo();
    expect(undone).toMatchObject({ mojibakeCells: 14, redo: "Corrigir acentos quebrados" });
    expect(undone.undo).toBeUndefined();
    expect(session.redo().mojibakeCells).toBe(0);
  });

  it("lista problemas com o texto da linha e localiza a linha na visualização", async () => {
    const { session, info } = await openCsv("linhas-quebradas.csv");
    expect(info.problems).toEqual({ column_count: 2, unclosed_quote: 1, line_break: 1 });
    expect(info.problemRows).toBe(4);

    const page = session.getProblems(1, 2);
    expect(page.total).toBe(4);
    expect(page.items.map((p) => [p.row, p.text])).toEqual([
      [2, "3,Ana,Rua C,colunas a mais,extra,extra2"],
      [3, "4,Pedro,Rua D"],
    ]);

    session.setView({ sort: [{ column: 1, direction: "asc" }], filters: [] });
    expect(session.locateRow(3)).toBe(4);
    session.setView({ sort: [], filters: [{ column: 1, op: "equals", value: "maria" }] });
    expect(session.locateRow(3)).toBe(-1);

    const fixed = session.execute({ op: "fixProblems", params: { rows: "all" } });
    expect(fixed.problemRows).toBe(0);
  });

  it("aplica a ordenação aos dados e limpa a ordenação da visualização", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    session.setView({ sort: [{ column: 0, direction: "desc" }], filters: [] });
    const info = session.execute({ op: "applySort", params: { sort: [{ column: 0, direction: "desc" }] } });
    expect(info.view.sort).toEqual([]);
    expect(session.getRows(0, 1).rows[0]![0]).toBe("Maria Conceição");
    expect(session.undo().view.sort).toEqual([]);
    expect(session.getRows(0, 1).rows[0]![0]).toBe("João da Silva");
  });

  it("liga e desliga o cabeçalho com desfazer, sem perder edições", async () => {
    const { session } = await openCsv("sem-cabecalho.csv");
    session.execute({ op: "editCell", params: { row: 1, column: 1, value: "Joana" } });
    const withHeader = session.execute({ op: "setHeader", params: { hasHeader: true } });
    expect(withHeader.columns[1]!.name).toBe("Maria");
    expect(session.getRows(0, 1).rows[0]![1]).toBe("Joana");
    expect(session.undo().meta.hasHeader).toBe(false);
  });

  it("salva a sessão e restaura idêntica em outro worker", async () => {
    const store = memoryStore();
    const { session } = await openCsv("mojibake.csv", store);
    session.execute({ op: "fixEncoding", params: {} });
    session.execute({ op: "deleteRows", params: { rows: [5] } });
    await session.flush();

    const other = new WorkerSession({ store, saveDelay: 0 });
    expect(await other.savedSession()).toMatchObject({ fileName: "mojibake.csv", rowCount: 5, steps: 2 });
    const restored = await other.restore();
    expect(restored).toMatchObject({ fileName: "mojibake.csv", rowCount: 5, undo: "Excluir linha 6" });
    expect(other.getRows(0, 5).rows).toEqual(session.getRows(0, 5).rows);

    // O histórico continua funcionando depois de restaurar.
    other.undo();
    expect(other.undo().mojibakeCells).toBe(14);

    // E dá para reler o arquivo original com outro separador.
    expect((await other.reopen({ delimiter: "," }, undefined, () => {})).meta.delimiter).toBe(",");
  });

  it("espera um tempo sem alterações antes de salvar", async () => {
    const store = memoryStore();
    const session = new WorkerSession({ store, saveDelay: 50 });
    await session.open(fileFrom("clientes-utf8-virgula.csv"), undefined, () => {});
    session.execute({ op: "deleteRows", params: { rows: [0] } });
    session.execute({ op: "deleteRows", params: { rows: [0] } });
    expect(store.saves).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(store.saves).toBe(1);
    expect(store.saved?.dataset.rows).toHaveLength(3);
  });

  it("descarta a sessão salva", async () => {
    const store = memoryStore();
    const { session } = await openCsv("clientes-utf8-virgula.csv", store);
    await session.flush();
    await session.discardSaved();
    expect(await session.savedSession()).toBeUndefined();
  });

  it("volta ao início sem arquivo aberto e sem sessão salva", async () => {
    const store = memoryStore();
    const { session } = await openCsv("clientes-utf8-virgula.csv", store);
    session.execute({ op: "deleteRows", params: { rows: [0] } });
    await session.close();
    expect(await session.savedSession()).toBeUndefined();
    expect(() => session.getRows(0, 10)).toThrow("Nenhum arquivo aberto");
    // O salvamento agendado antes de fechar não grava nada depois.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await session.savedSession()).toBeUndefined();
  });

  it("conta inválidos e usa a regra no resumo e no filtro", async () => {
    const { session } = await openCsv("documentos-cpf-cnpj.csv");
    expect(session.countInvalid(1, "cpfCnpj")).toBe(11);
    expect(session.summarize(1, "all", "cpfCnpj").invalid).toBe(11);
    const view = session.setView({ sort: [], filters: [{ column: 1, op: "invalid", rule: "cpfCnpj" }] });
    expect(view.viewCount).toBe(11);
  });

  it("limpa filtros e ordenação quando as colunas mudam, mas não em outras alterações", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    session.setView({ sort: [{ column: 0, direction: "asc" }], filters: [{ column: 4, op: "equals", value: "SP" }] });
    expect(session.execute({ op: "trimSpaces", params: { columns: [0] } }).view.filters).toHaveLength(1);
    const moved = session.execute({ op: "moveColumn", params: { from: 4, to: 0 } });
    expect(moved.view).toEqual({ sort: [], filters: [] });
    expect(moved.columns[0]!.name).toBe("uf");
  });

  it("cria planilha em branco e permite editar, colar e salvar", async () => {
    const store = memoryStore();
    const session = new WorkerSession({ store, saveDelay: 0 });
    const blank = session.createBlank(3, 10);
    expect(blank).toMatchObject({ fileName: "nova-planilha.csv", rowCount: 10 });
    expect(blank.meta.source).toBe("created");
    expect(blank.columns.map((c) => c.name)).toEqual(["Coluna 1", "Coluna 2", "Coluna 3"]);
    session.execute({ op: "paste", params: { row: 0, column: 0, text: "Maria\tRecife\nJoão\tCuritiba" } });
    expect(session.getRows(0, 2).rows).toEqual([
      ["Maria", "Recife", ""],
      ["João", "Curitiba", ""],
    ]);
    await session.flush();
    expect(store.saved?.fileName).toBe("nova-planilha.csv");
    await expect(session.reopen({ delimiter: ";" }, undefined, () => {})).rejects.toThrow("não podem ser relidos");
  });

  it("cria a partir de linhas da página", async () => {
    const session = new WorkerSession({ store: memoryStore(), saveDelay: 0 });
    const info = session.createFromRows("Vendas.csv", [["Região", "Total"], ["Sul", "430,00"]], true);
    expect(info).toMatchObject({ fileName: "Vendas.csv", rowCount: 1 });
    expect(info.columns[1]).toMatchObject({ name: "Total", type: "number", format: "br" });
  });

  it("abre JSON e troca o campo que vira uma linha por item", async () => {
    const session = new WorkerSession({ store: memoryStore(), saveDelay: 0 });
    const result = await session.open(fileFrom("clientes-aninhado.json"), undefined, () => {});
    if (result.status !== "opened") throw new Error("esperava aberto");
    expect(result.info).toMatchObject({ rowCount: 3, jsonArrays: ["telefones", "pedidos"] });
    expect(result.info.meta.source).toBe("json");
    const exploded = await session.reopen({ explode: "pedidos" }, undefined, () => {});
    expect(exploded).toMatchObject({ rowCount: 4 });
    expect(exploded.meta.explode).toBe("pedidos");
    expect((await session.reopen({ explode: "" }, undefined, () => {})).rowCount).toBe(3);
  });

  it("gera prévia e arquivo SQL", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    const options = { dialect: "mysql", mode: "insert", table: "clientes", createTable: true, normalizeNames: true } as const;
    const preview = session.previewSql(options, "all");
    expect(preview.columns.find((c) => c.name === "valor_compra")?.type).toBe("decimal(7, 2)");
    expect(preview.text).toContain("CREATE TABLE `clientes`");
    const text = new TextDecoder().decode(session.exportSql(options, "all"));
    expect(text.match(/\n  \(/g)).toHaveLength(5);
  });

  it("divide em partes dentro de um .zip, com cabeçalho em cada parte", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    const split = { mode: "column", column: 4 } as const;
    expect(session.previewSplit(split, EXPORT_PRESETS.csv, "all")).toMatchObject({
      total: 4,
      parts: [
        { name: "clientes-utf8-virgula_SP.csv", rows: 2 },
        { name: "clientes-utf8-virgula_MG.csv", rows: 1 },
        { name: "clientes-utf8-virgula_SC.csv", rows: 1 },
        { name: "clientes-utf8-virgula_AL.csv", rows: 1 },
      ],
    });
    const zip = unzipSync(session.exportSplit(split, EXPORT_PRESETS.csv, "all", "replace"));
    expect(Object.keys(zip)).toHaveLength(4);
    const sp = strFromU8(zip["clientes-utf8-virgula_SP.csv"]!).trim().split("\n");
    expect(sp).toHaveLength(3);
    expect(sp[0]).toBe("nome,cpf,email,cidade,uf,data_cadastro,valor_compra");
  });

  it("junta arquivos e o resultado vira o arquivo aberto", async () => {
    const session = new WorkerSession({ store: memoryStore(), saveDelay: 0 });
    const files = ["juntar-parte-1.csv", "juntar-parte-2.csv", "juntar-parte-3.tsv"].map(fileFrom);
    const preview = await session.previewMerge(files);
    expect(preview.columns).toEqual(["nome", "email", "cidade", "UF"]);
    expect(preview.files[1]).toMatchObject({ encoding: "windows-1252", rows: 2, onlyHere: ["UF"] });
    const info = await session.mergeFiles(files, true);
    expect(info).toMatchObject({ fileName: "arquivos-juntados.csv", rowCount: 6 });
    expect(info.columns.map((c) => c.name)).toEqual(["nome", "email", "cidade", "UF", "arquivo_origem"]);
    await expect(session.previewMerge([fileFrom("juntar-parte-1.csv"), new File(["{"], "ruim.json")])).rejects.toThrow('"ruim.json"');
  });

  it("exporta .xlsx e texto para colar", async () => {
    const { session } = await openCsv("clientes-utf8-virgula.csv");
    expect(session.exportXlsx("all").subarray(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(session.copyText("all").split("\r\n")[1]).toBe("João da Silva\t529.982.247-25\tjoao.silva@example.com\tSão Paulo\tSP\t15/03/2025\t1.234,56");
  });
});
