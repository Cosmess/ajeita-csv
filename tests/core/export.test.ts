import { describe, expect, it } from "vitest";
import type { Dataset } from "../../src/core/dataset";
import { EXPORT_PRESETS, encodeText, serializeCsv, unencodableChars, type CsvExportOptions } from "../../src/core/export/csv";
import { encodeWindows1252, findUnencodable } from "../../src/core/export/windows1252";
import { buildDataset, parseCsvBytes } from "../../src/core/parse";
import { fixture, openFixture, parseText } from "../helpers";

const exportBytes = (dataset: Dataset, options: CsvExportOptions) =>
  encodeText(serializeCsv(dataset, options), options.encoding);

describe("Windows-1252", () => {
  it("é o inverso exato do TextDecoder para todos os 256 bytes", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = new TextDecoder("windows-1252").decode(bytes);
    expect(findUnencodable(text).size).toBe(0);
    expect(encodeWindows1252(text)).toEqual(bytes);
  });

  it("lista caracteres que não existem, com contagem", () => {
    const found = unencodableChars("😀 ok 😀 ₹ ✓ € ação", "windows-1252");
    expect(found).toEqual([
      { char: "😀", count: 2 },
      { char: "₹", count: 1 },
      { char: "✓", count: 1 },
    ]);
    expect(unencodableChars("😀", "utf-8")).toEqual([]);
  });

  it("substitui por ? ou remove", () => {
    const decode = (b: Uint8Array) => new TextDecoder("windows-1252").decode(b);
    expect(decode(encodeWindows1252("a😀b€", "replace"))).toBe("a?b€");
    expect(decode(encodeWindows1252("a😀b€", "remove"))).toBe("ab€");
  });
});

describe("serialização", () => {
  it("Excel BR: BOM, ponto e vírgula e CRLF", () => {
    const bytes = exportBytes(parseText("a,b\n1,x\n"), EXPORT_PRESETS["excel-br"]);
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("a;b\r\n1;x\r\n");
  });

  it("CSV padrão: vírgula, LF e sem BOM", () => {
    const bytes = exportBytes(parseText("a;b\n1;x\n"), EXPORT_PRESETS.csv);
    expect(bytes[0]).toBe("a".charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("a,b\n1,x\n");
  });

  it("converte para vírgula decimal só colunas numéricas em formato americano", () => {
    const dataset = parseText("valor,preco,codigo\n1234.56,\"1.234,56\",0001\n0.99,\"89,90\",0002\n");
    const text = serializeCsv(dataset, EXPORT_PRESETS["excel-br"]);
    expect(text).toBe("valor;preco;codigo\r\n1234,56;1.234,56;0001\r\n0,99;89,90;0002\r\n");
  });

  it("coloca aspas só quando necessário, ou em todos os campos", () => {
    const dataset = parseText('a;b\n"x;y";"diz ""oi"""\nlinha;"com\nquebra"\n');
    expect(serializeCsv(dataset, EXPORT_PRESETS["excel-br"])).toBe(
      'a;b\r\n"x;y";"diz ""oi"""\r\nlinha;"com\nquebra"\r\n',
    );
    expect(serializeCsv(dataset, { ...EXPORT_PRESETS.csv, quoteAll: true })).toBe(
      '"a","b"\n"x;y","diz ""oi"""\n"linha","com\nquebra"\n',
    );
  });

  it("não escreve cabeçalho em arquivo que não tinha", () => {
    expect(serializeCsv(parseText("1;2\n3;4\n"), EXPORT_PRESETS.csv)).toBe("1,2\n3,4\n");
  });

  it("exporta só as linhas pedidas, na ordem pedida", () => {
    const dataset = parseText("n\na\nb\nc\n");
    expect(serializeCsv(dataset, EXPORT_PRESETS.csv, Uint32Array.from([2, 0]))).toBe("n\nc\na\n");
  });
});

// A única mudança esperada: números em formato americano passam a usar vírgula decimal.
function withDecimalComma(dataset: Dataset): string[][] {
  const us = dataset.columns.flatMap((c, i) => (c.type === "number" && c.format === "us" ? [i] : []));
  return dataset.rows.map((row) =>
    row.map((value, i) => (us.includes(i) ? value.replaceAll(",", "").replace(".", ",") : value)),
  );
}

describe("ida e volta: exportar e abrir de novo devolve os mesmos dados", () => {
  const fixtures = [
    "clientes-utf8-virgula.csv",
    "clientes-windows1252-ponto-virgula.csv",
    "clientes-utf8-bom.csv",
    "produtos.tsv",
    "produtos-pipe.txt",
    "sem-cabecalho.csv",
    "somente-texto.csv",
    "documentos-cpf-cnpj.csv",
    "telefones.csv",
    "datas-numeros.csv",
    "mojibake.csv",
    "sujeira.csv",
  ];

  const formats: [string, CsvExportOptions][] = [
    ["Excel BR", EXPORT_PRESETS["excel-br"]],
    ["CSV padrão", EXPORT_PRESETS.csv],
    ["Windows-1252", { ...EXPORT_PRESETS["excel-br"], encoding: "windows-1252" }],
    ["TSV com aspas em tudo", { ...EXPORT_PRESETS.csv, delimiter: "\t", quoteAll: true }],
    ["pipe com CRLF", { ...EXPORT_PRESETS.csv, delimiter: "|", lineEnding: "\r\n" }],
  ];

  for (const [label, options] of formats) {
    it.each(fixtures)(`${label}: %s`, (name) => {
      const original = openFixture(name);
      const reopened = buildDataset(
        parseCsvBytes(exportBytes(original, options), { hasHeader: original.meta.hasHeader }),
      );
      expect(reopened.columns.map((c) => c.name)).toEqual(original.columns.map((c) => c.name));
      expect(reopened.rows).toEqual(options.decimalComma ? withDecimalComma(original) : original.rows);
    });
  }

  it("o export Windows-1252 de texto acentuado é lido de volta como Windows-1252", () => {
    const bytes = exportBytes(openFixture("clientes-utf8-virgula.csv"), {
      ...EXPORT_PRESETS["excel-br"],
      encoding: "windows-1252",
    });
    const reopened = buildDataset(parseCsvBytes(bytes));
    expect(reopened.meta.encoding).toBe("windows-1252");
    expect(reopened.rows[0]![0]).toBe("João da Silva");
    expect(reopened.rows[4]![3]).toBe("Maceió");
  });

  it("detecta o mesmo encoding e delimitador do arquivo exportado", () => {
    const reopened = buildDataset(parseCsvBytes(exportBytes(openFixture("produtos.tsv"), EXPORT_PRESETS["excel-br"])));
    expect(reopened.meta).toMatchObject({ encoding: "utf-8", hasBom: true, delimiter: ";", hasHeader: true });
    expect(fixture("produtos.tsv").length).toBeGreaterThan(0);
  });
});
