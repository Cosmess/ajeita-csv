import Papa from "papaparse";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { clipboardText } from "../../src/core/export/clipboard";
import { EXPORT_PRESETS, encodeText, serializeCsv } from "../../src/core/export/csv";
import { buildXlsx, columnLetter, sheetName } from "../../src/core/export/xlsx";
import { mergeDatasets, summarizeMerge } from "../../src/core/files/merge";
import { planSplit, safeFileName } from "../../src/core/files/split";
import { buildDataset, parseCsvBytes, tableFromRows } from "../../src/core/parse";
import { readSheetRows, readWorkbook } from "../../src/core/parse/xlsx";
import { openFixture, parseText } from "../helpers";

describe("exportar .xlsx", () => {
  const reread = (bytes: Uint8Array) => {
    const workbook = readWorkbook(bytes);
    return { workbook, rows: readSheetRows(workbook, workbook.SheetNames[0]!) };
  };

  it("relido com SheetJS mantém textos, zeros à esquerda e datas", () => {
    const dataset = openFixture("clientes-utf8-virgula.csv");
    const { workbook, rows } = reread(buildXlsx(dataset, "clientes"));
    expect(workbook.SheetNames).toEqual(["clientes"]);
    expect(rows[0]).toEqual(dataset.meta.header);
    // Texto exatamente igual (CPF com máscara e zeros).
    expect(rows.slice(1).map((r) => r[1])).toEqual(dataset.rows.map((r) => r[1]));
    expect(rows[4]![1]).toBe("012.345.678-90");
    // Datas viram datas do Excel e voltam como dd/mm/aaaa.
    expect(rows.slice(1).map((r) => r[5])).toEqual(dataset.rows.map((r) => r[5]));
  });

  it("grava números como números e mantém identificadores longos como texto", () => {
    const dataset = parseText("valor;qtd;cpf;codigo\n1.234,56;10;52998224725;0001\n0,99;3;12345678909;0002\n");
    const bytes = buildXlsx(dataset, "x");
    const sheet = XLSX.read(bytes, { type: "array", cellNF: true }).Sheets.x!;
    expect(sheet.A2).toMatchObject({ t: "n", v: 1234.56, z: "#,##0.00" });
    expect(sheet.B2).toMatchObject({ t: "n", v: 10 });
    expect(sheet.C2).toMatchObject({ t: "s", v: "52998224725" });
    expect(sheet.D2).toMatchObject({ t: "s", v: "0001" });
  });

  it("dá nome válido à aba e recusa planilhas acima do limite do Excel", () => {
    expect(sheetName("vendas: 2025/jan")).toBe("vendas  2025 jan");
    expect(sheetName("")).toBe("Dados");
    const huge = { ...parseText("a\n1\n"), rows: { length: 1_048_576 } as unknown as string[][] };
    expect(() => buildXlsx(huge, "x")).toThrow("até 1.048.576 linhas");
  });

  it("escapa XML, tira caracteres de controle e nomeia colunas além de Z", () => {
    const dataset = parseText('a;b\n"<x> & \u0001""y""";  espaços  \n');
    expect(reread(buildXlsx(dataset, "x")).rows[1]).toEqual(['<x> & "y"', "  espaços  "]);
    expect([0, 25, 26, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
  });

  it("exporta só as linhas pedidas", () => {
    const dataset = parseText("n\na\nb\nc\n");
    const rows = reread(buildXlsx(dataset, "x", Uint32Array.from([2, 0]))).rows;
    expect(rows).toEqual([["n"], ["c"], ["a"]]);
  });
});

describe("copiar para colar no Excel/Sheets", () => {
  it("separa com tabulação e protege células com tabulação ou quebra de linha", () => {
    const dataset = parseText('a;b\nx;"linha 1\nlinha 2"\ny;"com\ttab"\n');
    const text = clipboardText(dataset);
    expect(text).toBe('a\tb\r\nx\t"linha 1\nlinha 2"\r\ny\t"com\ttab"');
    // Colado e lido de novo, mantém as colunas.
    expect(Papa.parse<string[]>(text, { delimiter: "\t" }).data).toEqual([["a", "b"], ...dataset.rows]);
  });
});

describe("dividir e juntar", () => {
  it("divide por número de linhas, com nomes numerados", () => {
    const dataset = openFixture("clientes-utf8-virgula.csv");
    const parts = planSplit(dataset, { mode: "rows", size: 2 }, "clientes", "csv");
    expect(parts.map((p) => [p.name, p.rows.length])).toEqual([
      ["clientes_parte_001.csv", 2],
      ["clientes_parte_002.csv", 2],
      ["clientes_parte_003.csv", 1],
    ]);
  });

  it("divide por valor de coluna, com nomes de arquivo seguros", () => {
    const dataset = parseText("uf;n\nSP;1\nRJ;2\nSP;3\n;4\nA/B;5\na/b;6\n");
    const parts = planSplit(dataset, { mode: "column", column: 0 }, "x", "csv");
    expect(parts.map((p) => [p.name, Array.from(p.rows)])).toEqual([
      ["x_SP.csv", [0, 2]],
      ["x_RJ.csv", [1]],
      ["x_sem_valor.csv", [3]],
      ["x_A_B.csv", [4]],
      ["x_a_b_2.csv", [5]],
    ]);
    expect(safeFileName(' a:b*"c" ')).toBe("a_b_c_");
  });

  it("recusa divisões que geram arquivos demais", () => {
    const rows = Array.from({ length: 600 }, (_, i) => String(i));
    const dataset = parseText(["id", ...rows].join("\n"));
    expect(() => planSplit(dataset, { mode: "column", column: 0 }, "x", "csv")).toThrow("600 arquivos; o limite é 500");
    expect(() => planSplit(dataset, { mode: "rows", size: 1 }, "x", "csv")).toThrow("o limite é 500");
  });

  it("dividir e juntar as partes devolve o arquivo original", () => {
    for (const name of ["clientes-utf8-virgula.csv", "documentos-cpf-cnpj.csv", "datas-numeros.csv"]) {
      const dataset = openFixture(name);
      const parts = planSplit(dataset, { mode: "rows", size: 2 }, "x", "csv").map((part) => {
        // CSV padrão: o Excel BR converteria de propósito números americanos para vírgula decimal.
        const bytes = encodeText(serializeCsv(dataset, EXPORT_PRESETS.csv, part.rows), "utf-8");
        return { name: part.name, dataset: buildDataset(parseCsvBytes(bytes, { hasHeader: true })) };
      });
      const [header, ...rows] = mergeDatasets(parts, false);
      expect(header).toEqual(dataset.meta.header);
      expect(rows).toEqual(dataset.rows);
    }
  });

  it("junta arquivos com encodings, separadores e colunas diferentes", () => {
    const inputs = ["juntar-parte-1.csv", "juntar-parte-2.csv", "juntar-parte-3.tsv"].map((name) => ({
      name,
      dataset: openFixture(name),
    }));
    expect(summarizeMerge(inputs).map((s) => [s.name, s.encoding, s.delimiter, s.rows, s.onlyHere])).toEqual([
      ["juntar-parte-1.csv", "utf-8", ",", 2, []],
      ["juntar-parte-2.csv", "windows-1252", ";", 2, ["UF"]],
      ["juntar-parte-3.tsv", "utf-8", "\t", 2, []],
    ]);
    expect(mergeDatasets(inputs, true)).toEqual([
      ["nome", "email", "cidade", "UF", "arquivo_origem"],
      ["Maria", "maria@example.com", "Recife", "", "juntar-parte-1.csv"],
      ["João", "joao@example.com", "Curitiba", "", "juntar-parte-1.csv"],
      ["Ana", "ana@example.com", "Manaus", "AM", "juntar-parte-2.csv"],
      ["Pedro", "pedro@example.com", "Goiânia", "GO", "juntar-parte-2.csv"],
      ["Carla", "carla@example.com", "", "", "juntar-parte-3.tsv"],
      ["Lucas", "lucas@example.com", "", "", "juntar-parte-3.tsv"],
    ]);
  });

  it("junta planilha .xlsx com CSV", () => {
    const xlsx = buildDataset(tableFromRows([["nome", "email"], ["Zé", "ze@example.com"]]));
    const merged = mergeDatasets([{ name: "a.xlsx", dataset: xlsx }, { name: "b.csv", dataset: openFixture("juntar-parte-1.csv") }], false);
    expect(merged[0]).toEqual(["nome", "email", "cidade"]);
    expect(merged[1]).toEqual(["Zé", "ze@example.com", ""]);
  });
});
