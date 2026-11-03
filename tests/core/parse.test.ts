import { describe, expect, it } from "vitest";
import { detectDelimiter } from "../../src/core/parse/delimiter";
import { decodeBytes, detectEncoding } from "../../src/core/parse/encoding";
import { detectHeader } from "../../src/core/parse/header";
import { fixture, openFixture, parseText } from "../helpers";

describe("detecção de encoding", () => {
  it.each([
    ["clientes-utf8-virgula.csv", "utf-8", false],
    ["clientes-windows1252-ponto-virgula.csv", "windows-1252", false],
    ["clientes-utf8-bom.csv", "utf-8", true],
    ["juntar-parte-2.csv", "windows-1252", false],
    ["mojibake.csv", "utf-8", false],
  ])("%s → %s (BOM: %s)", (name, encoding, hasBom) => {
    expect(detectEncoding(fixture(name))).toEqual({ encoding, hasBom });
  });

  it("remove o BOM do texto decodificado", () => {
    const text = decodeBytes(fixture("clientes-utf8-bom.csv"), "utf-8");
    expect(text.startsWith("nome;")).toBe(true);
  });

  it("decodifica Windows-1252 com acentos corretos", () => {
    const text = decodeBytes(fixture("clientes-windows1252-ponto-virgula.csv"), "windows-1252");
    expect(text).toContain("João da Silva;");
    expect(text).toContain("Florianópolis");
  });
});

describe("detecção de delimitador", () => {
  const decode = (name: string) => {
    const bytes = fixture(name);
    return decodeBytes(bytes, detectEncoding(bytes).encoding);
  };

  it.each([
    ["clientes-utf8-virgula.csv", ","],
    ["clientes-windows1252-ponto-virgula.csv", ";"],
    ["clientes-utf8-bom.csv", ";"],
    ["produtos.tsv", "\t"],
    ["produtos-pipe.txt", "|"],
    ["sem-cabecalho.csv", ";"],
    ["somente-texto.csv", ","],
    ["mojibake.csv", ";"],
    ["linhas-quebradas.csv", ","],
    ["documentos-cpf-cnpj.csv", ";"],
    ["telefones.csv", ";"],
    ["datas-numeros.csv", ";"],
    ["sujeira.csv", ";"],
    ["fora-windows-1252.csv", ";"],
    ["juntar-parte-1.csv", ","],
    ["juntar-parte-2.csv", ";"],
    ["juntar-parte-3.tsv", "\t"],
  ])("%s → %j", (name, delimiter) => {
    expect(detectDelimiter(decode(name))).toBe(delimiter);
  });

  it("usa vírgula quando nenhum delimitador gera mais de uma coluna", () => {
    expect(detectDelimiter("nome\nMaria\nJoão\n")).toBe(",");
  });
});

describe("detecção de cabeçalho", () => {
  it.each([
    ["clientes-utf8-virgula.csv", true],
    ["produtos.tsv", true],
    ["datas-numeros.csv", true],
    ["sem-cabecalho.csv", false],
    ["somente-texto.csv", true],
  ])("%s → %s", (name, expected) => {
    expect(openFixture(name).meta.hasHeader).toBe(expected);
  });

  it("assume cabeçalho com uma linha só", () => {
    expect(detectHeader([["a", "b"]])).toBe(true);
  });
});

describe("parse completo", () => {
  it("monta colunas a partir do cabeçalho e linhas de dados", () => {
    const dataset = openFixture("clientes-windows1252-ponto-virgula.csv");
    expect(dataset.columns.map((c) => c.name)).toEqual([
      "nome",
      "cpf",
      "email",
      "cidade",
      "uf",
      "data_cadastro",
      "valor_compra",
    ]);
    expect(dataset.rows).toHaveLength(5);
    expect(dataset.rows[0]).toEqual([
      "João da Silva",
      "529.982.247-25",
      "joao.silva@example.com",
      "São Paulo",
      "SP",
      "15/03/2025",
      "1.234,56",
    ]);
  });

  it("detecta o tipo de cada coluna", () => {
    const { columns } = openFixture("clientes-utf8-virgula.csv");
    const types = Object.fromEntries(columns.map((c) => [c.name, [c.type, c.format]]));
    expect(types.nome).toEqual(["string", undefined]);
    expect(types.data_cadastro).toEqual(["date", "dmy"]);
    expect(types.valor_compra).toEqual(["number", "br"]);
  });

  it("nomeia colunas quando não há cabeçalho", () => {
    const dataset = openFixture("sem-cabecalho.csv");
    expect(dataset.columns.map((c) => c.name)).toEqual(["Coluna 1", "Coluna 2", "Coluna 3", "Coluna 4"]);
    expect(dataset.rows).toHaveLength(4);
  });

  it("respeita as escolhas do usuário", () => {
    const dataset = openFixture("sem-cabecalho.csv", { hasHeader: true, delimiter: "," });
    expect(dataset.meta.hasHeader).toBe(true);
    expect(dataset.meta.delimiter).toBe(",");
    expect(dataset.columns).toHaveLength(2);
  });

  it("mantém quebra de linha dentro de campo entre aspas", () => {
    const dataset = openFixture("linhas-quebradas.csv");
    expect(dataset.rows[1]![2]).toBe("Av. Brasil, 200\napto 31");
  });

  it("aponta linhas com número de colunas diferente e aspas não fechadas", () => {
    const { meta } = openFixture("linhas-quebradas.csv");
    const columnRows = meta.issues.filter((i) => i.kind === "column_count").map((i) => i.row);
    // Linha 3 tem colunas a mais e linha 4 a menos (índices contando o cabeçalho).
    expect(columnRows).toContain(3);
    expect(columnRows).toContain(4);
    expect(meta.issues.some((i) => i.kind === "unclosed_quote")).toBe(true);
  });

  it("não cria linha vazia por causa da quebra de linha final", () => {
    expect(parseText("a;b\n1;2\n").rows).toEqual([["1", "2"]]);
  });

  it("mantém linhas vazias do meio do arquivo", () => {
    expect(openFixture("sujeira.csv").rows.some((row) => row.length === 1 && row[0] === "")).toBe(true);
  });

  it("informa o progresso e envia uma prévia", async () => {
    const { parseCsvBytes } = await import("../../src/core/parse");
    const fractions: number[] = [];
    let preview: string[][] | undefined;
    parseCsvBytes(fixture("clientes-utf8-virgula.csv"), {}, {
      onProgress: (f) => fractions.push(f),
      onPreview: (rows) => (preview = rows),
    });
    expect(fractions.at(-1)).toBe(1);
    expect(preview?.[0]?.[0]).toBe("nome");
  });
});
