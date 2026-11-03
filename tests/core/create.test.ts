import { describe, expect, it } from "vitest";
import { arrayFields, jsonToRows, parseJsonRecords } from "../../src/core/create/json";
import { rowsFromText } from "../../src/core/create/selection";
import { expandTable, tableToRows, type TableModel } from "../../src/core/create/table";
import { planOp } from "../../src/core/ops";
import { applyPatch } from "../../src/core/patch";
import { fixture, parseText } from "../helpers";

describe("texto selecionado", () => {
  it.each([
    ["tabulação (cópia de tabela)", "Nome\tCidade\nMaria\tRecife\nJoão\tSão Paulo\n", [["Nome", "Cidade"], ["Maria", "Recife"], ["João", "São Paulo"]]],
    ["ponto e vírgula", "nome;uf\nAna;SP\nBia;RJ", [["nome", "uf"], ["Ana", "SP"], ["Bia", "RJ"]]],
    [
      "vários espaços (texto alinhado)",
      "Produto        Preço   Estoque\nCafé torrado   24,90   120\nAçúcar         5,49    300",
      [["Produto", "Preço", "Estoque"], ["Café torrado", "24,90", "120"], ["Açúcar", "5,49", "300"]],
    ],
    ["uma coluna", "Maria\nJoão\n\nAna", [["Maria"], ["João"], ["Ana"]]],
  ])("%s", (_, text, expected) => {
    expect(rowsFromText(text)).toEqual(expected);
  });
});

describe("tabela HTML", () => {
  const cell = (text: string, colspan = 1, rowspan = 1, header = false) => ({ text, colspan, rowspan, header });

  // Mesma estrutura de tests/fixtures/tabela-colspan-rowspan.html.
  const vendas: TableModel = {
    headerRows: 2,
    rows: [
      [cell("Região", 1, 2, true), cell("Estado", 1, 2, true), cell("2025", 2, 1, true)],
      [cell("1º semestre", 1, 1, true), cell("2º semestre", 1, 1, true)],
      [cell("Sudeste", 1, 2), cell("SP"), cell("1.200,00"), cell("1.350,00")],
      [cell("RJ"), cell("800,00"), cell("910,50")],
      [cell("Sul", 1, 2), cell("PR"), cell("430,00"), cell("470,00")],
      [cell("SC"), cell("sem dados", 2)],
    ],
  };

  it("repete células mescladas em todas as posições que ocupam", () => {
    expect(expandTable(vendas)).toEqual([
      ["Região", "Estado", "2025", "2025"],
      ["Região", "Estado", "1º semestre", "2º semestre"],
      ["Sudeste", "SP", "1.200,00", "1.350,00"],
      ["Sudeste", "RJ", "800,00", "910,50"],
      ["Sul", "PR", "430,00", "470,00"],
      ["Sul", "SC", "sem dados", "sem dados"],
    ]);
  });

  it("junta um cabeçalho de várias linhas numa só", () => {
    const { rows, hasHeader } = tableToRows(vendas);
    expect(hasHeader).toBe(true);
    expect(rows[0]).toEqual(["Região", "Estado", "2025 1º semestre", "2025 2º semestre"]);
    expect(rows).toHaveLength(5);
  });

  it("completa linhas curtas e ignora spans absurdos", () => {
    expect(expandTable({ headerRows: 0, rows: [[cell("a"), cell("b")], [cell("c")], [cell("d", 1, 99)]] })).toEqual([
      ["a", "b"],
      ["c", ""],
      ["d", ""],
    ]);
  });
});

describe("JSON", () => {
  const records = parseJsonRecords(new TextDecoder().decode(fixture("clientes-aninhado.json")));

  it("achata objetos aninhados com ponto e junta arrays com |", () => {
    const [header, ...rows] = jsonToRows(records);
    expect(header).toEqual([
      "id",
      "nome",
      "ativo",
      "endereco.rua",
      "endereco.cidade",
      "endereco.uf",
      "endereco.geo.lat",
      "endereco.geo.lng",
      "telefones",
      "pedidos.numero",
      "pedidos.total",
      "endereco",
    ]);
    expect(rows[0]).toEqual([
      "1",
      "Maria Silva",
      "true",
      "Rua A, 100",
      "São Paulo",
      "SP",
      "-23.55",
      "-46.63",
      "(11) 91234-5678|(11) 3123-4567",
      "P-001|P-002",
      "150.5|89.9",
      "",
    ]);
    // Campos ausentes e null ficam vazios.
    expect(rows[2]![header!.indexOf("pedidos.numero")]).toBe("");
    expect(rows[2]![header!.indexOf("endereco")]).toBe("");
  });

  it("gera uma linha por item do campo escolhido", () => {
    const [header, ...rows] = jsonToRows(records, "pedidos");
    expect(header).toContain("pedidos.numero");
    expect(rows.map((r) => [r[1], r[header!.indexOf("pedidos.numero")], r[header!.indexOf("pedidos.total")]])).toEqual([
      ["Maria Silva", "P-001", "150.5"],
      ["Maria Silva", "P-002", "89.9"],
      ["João Souza", "P-003", "1200"],
      ["Ana Lima", "", ""],
    ]);
    // Registro sem pedidos não cria coluna extra.
    expect(header).not.toContain("pedidos");
    // Os outros arrays continuam juntados.
    expect(rows[0]![header!.indexOf("telefones")]).toBe("(11) 91234-5678|(11) 3123-4567");
  });

  it("lista os campos de array", () => {
    expect(arrayFields(records)).toEqual(["telefones", "pedidos"]);
  });

  it("aceita um objeto só e recusa JSON inválido", () => {
    expect(jsonToRows(parseJsonRecords('{"a": 1, "b": {"c": "x"}}'))).toEqual([["a", "b.c"], ["1", "x"]]);
    expect(() => parseJsonRecords("[1, 2")).toThrow("JSON inválido");
    expect(() => parseJsonRecords('"texto"')).toThrow("lista de objetos");
  });
});

describe("edição livre", () => {
  const data = () => parseText("a;b\n1;2\n3;4\n");
  const run = (op: Parameters<typeof planOp>[1]) => {
    const dataset = data();
    const applied = applyPatch(dataset, planOp(dataset, op).patch);
    expect(applyPatch(applied.dataset, applied.inverse).dataset.rows).toEqual(dataset.rows);
    return applied.dataset;
  };

  it("insere linhas vazias", () => {
    expect(run({ op: "insertRows", params: { index: 1, count: 2 } }).rows).toEqual([["1", "2"], ["", ""], ["", ""], ["3", "4"]]);
  });

  it("adiciona coluna com nome", () => {
    const result = run({ op: "addColumn", params: { index: 1, name: "nova" } });
    expect(result.columns.map((c) => c.name)).toEqual(["a", "nova", "b"]);
    expect(result.rows[0]).toEqual(["1", "", "2"]);
  });

  it("cola texto de planilha, criando linhas e colunas quando faltam", () => {
    const result = run({ op: "paste", params: { row: 1, column: 1, text: "x\ty\tz\r\nw\tv\n" } });
    expect(result.rows).toEqual([
      ["1", "2"],
      ["3", "x", "y", "z"],
      ["", "w", "v", ""],
    ]);
    expect(result.columns).toHaveLength(4);
  });
});
