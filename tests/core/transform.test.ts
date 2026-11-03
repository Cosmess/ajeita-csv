import { describe, expect, it } from "vitest";
import type { Dataset } from "../../src/core/dataset";
import { planOp, type Op } from "../../src/core/ops";
import { applyPatch } from "../../src/core/patch";
import { previewPlan } from "../../src/core/preview";
import { normalizePhone } from "../../src/core/transform/phone";
import { changeCase } from "../../src/core/transform/text";
import { openFixture, parseText } from "../helpers";

function run(dataset: Dataset, op: Op) {
  const plan = planOp(dataset, op);
  const applied = applyPatch(dataset, plan.patch);
  // Toda operação precisa poder ser desfeita exatamente.
  const undone = applyPatch(applied.dataset, applied.inverse).dataset;
  expect(undone.rows).toEqual(dataset.rows);
  expect(undone.meta).toEqual(dataset.meta);
  return { plan, dataset: applied.dataset, column: (i: number) => applied.dataset.rows.map((r) => r[i] ?? "") };
}

describe("limpeza", () => {
  it("remove espaços extras", () => {
    const { column } = run(openFixture("sujeira.csv"), { op: "trimSpaces", params: { columns: [0, 1, 3] } });
    expect(column(0)[0]).toBe("Maria da Silva");
    expect(column(1)[0]).toBe("MARIA@EXAMPLE.COM");
    expect(column(3)[7]).toBe("Porto Alegre");
  });

  it.each([
    ["upper", "joão da silva", "JOÃO DA SILVA"],
    ["lower", "JOÃO DA SILVA", "joão da silva"],
    ["title", "JOÃO DA SILVA", "João da Silva"],
    ["title", "pedro  álvares de cabral e silva", "Pedro  Álvares de Cabral e Silva"],
    ["title", "da silva", "Da Silva"],
    ["title", "maria d'ávila", "Maria D'ávila"],
  ] as const)("%s: %s → %s", (mode, value, expected) => {
    expect(changeCase(value, mode)).toBe(expected);
  });

  it("remove acentos", () => {
    const { column } = run(parseText("n\nJoão Conceição\nÂngela\n"), { op: "removeAccents", params: { columns: [0] } });
    expect(column(0)).toEqual(["Joao Conceicao", "Angela"]);
  });

  it("remove duplicadas inteiras ou por colunas-chave, mantendo a primeira", () => {
    const sujeira = openFixture("sujeira.csv");
    expect(run(sujeira, { op: "removeDuplicates", params: { columns: [] } }).dataset.rows).toHaveLength(sujeira.rows.length - 1);
    const byEmail = run(sujeira, { op: "removeDuplicates", params: { columns: [1] } });
    // joao@example.com repetido, ana@example.com repetido e dois e-mails vazios.
    expect(byEmail.plan.label).toBe('Remover 4 linhas duplicadas (por "email")');
  });

  it("remove linhas e colunas vazias", () => {
    const sujeira = openFixture("sujeira.csv");
    expect(run(sujeira, { op: "removeEmptyRows", params: {} }).dataset.rows).toHaveLength(sujeira.rows.length - 2);
    const columns = run(sujeira, { op: "removeEmptyColumns", params: {} }).dataset.columns.map((c) => c.name);
    expect(columns).toEqual(["nome", "email", "cidade"]);
  });
});

describe("conversões", () => {
  const datas = openFixture("datas-numeros.csv");

  it("converte datas, com e sem hora, e aponta as inválidas", () => {
    const { column, plan } = run(datas, { op: "convertDates", params: { columns: [0], to: "ymd", keepTime: true } });
    expect(column(0)).toEqual(["2025-03-15", "2024-12-01", "2026-01-31", "2025-04-03", "29/02/2025"]);
    expect(plan.unrecognized).toEqual([{ value: "29/02/2025", count: 1, row: 4, reason: "data inválida ou em outro formato" }]);

    const time = run(datas, { op: "convertDates", params: { columns: [3], to: "ymd", keepTime: true } }).column(3);
    expect(time.slice(0, 2)).toEqual(["2025-03-15 14:30", "2024-12-01 08:05:10"]);
    const noTime = run(datas, { op: "convertDates", params: { columns: [3], to: "dmy", keepTime: false } }).column(3);
    expect(noTime[0]).toBe("15/03/2025");

    const iso = run(datas, { op: "convertDates", params: { columns: [1], to: "dmy", keepTime: true } }).column(1);
    expect(iso.slice(0, 4)).toEqual(["15/03/2025", "01/12/2024", "31/01/2026", "03/04/2025"]);

    const us = run(datas, { op: "convertDates", params: { columns: [2], to: "dmy", keepTime: true, from: "mdy" } }).column(2);
    expect(us.slice(0, 4)).toEqual(["15/03/2025", "01/12/2024", "31/01/2026", "03/04/2025"]);
  });

  it("converte números entre os formatos BR e americano", () => {
    expect(run(datas, { op: "convertNumbers", params: { columns: [4], to: "us", keepCurrency: false } }).column(4)).toEqual([
      "1234.56",
      "0.99",
      "-15000.00",
      "1000",
      "abc",
    ]);
    expect(run(datas, { op: "convertNumbers", params: { columns: [5], to: "br", keepCurrency: false } }).column(5)).toEqual([
      "1.234,56",
      "0,99",
      "-15.000,00",
      "1.000",
      "1.234,56",
    ]);
  });

  it("remove ou mantém o R$", () => {
    const removed = run(datas, { op: "convertNumbers", params: { columns: [6], to: "br", keepCurrency: false } });
    expect(removed.column(6)).toEqual(["1.234,56", "0,99", "-15.000,00", "1.000", "R$ ?"]);
    const kept = run(datas, { op: "convertNumbers", params: { columns: [6], to: "br", keepCurrency: true } });
    expect(kept.column(6).slice(0, 3)).toEqual(["R$ 1.234,56", "R$ 0,99", "-R$ 15.000,00"]);
  });

  it("formata CEP e completa o zero perdido", () => {
    const { column, plan } = run(datas, { op: "formatCeps", params: { columns: [7], mode: "mask" } });
    expect(column(7)).toEqual(["01310-100", "01310-100", "01310-100", "70040-010", "123"]);
    expect(plan.unrecognizedTotal).toBe(1);
    expect(run(datas, { op: "formatCeps", params: { columns: [7], mode: "unmask" } }).column(7)[1]).toBe("01310100");
  });
});

describe("CPF e CNPJ", () => {
  const docs = openFixture("documentos-cpf-cnpj.csv");

  it("coloca máscara, completa zeros e identifica CPF ou CNPJ", () => {
    const { column, plan } = run(docs, { op: "formatDocuments", params: { columns: [1], mode: "mask", kind: "auto", padZeros: true } });
    expect(column(1)).toEqual([
      "529.982.247-25",
      "123.456.789-09",
      "987.654.321-01",
      "111.111.111-11",
      "012.345.678-90", // perdeu 1 zero: só como CPF o dígito verificador fecha
      // Perdeu 3 zeros e fecha tanto como CPF quanto como CNPJ: vale o tipo mais comum na coluna (CNPJ).
      "00.000.012/3456-01",
      "5,29982E+10",
      "11.222.333/0001-81",
      "45.321.789/0001-10",
      "45.321.789/0001-11",
      "00.000.000/0000-00",
      "00.600.000/0001-22",
      "1,12223E+13",
      "12.ABC.345/01DE-35",
      "A1.B2C.3D4/0001-93",
      "12.ABC.345/01DE-35",
      "12.ABC.345/01DE-36",
      "não informado",
    ]);
    expect(plan.unrecognized.map((u) => [u.value, u.reason])).toEqual([
      ["5,29982E+10", "valor truncado pelo Excel; recupere do arquivo original"],
      ["1,12223E+13", "valor truncado pelo Excel; recupere do arquivo original"],
      ["não informado", "não é CPF nem CNPJ"],
    ]);
  });

  it("tira a máscara", () => {
    const { column } = run(docs, { op: "formatDocuments", params: { columns: [1], mode: "unmask", kind: "auto", padZeros: true } });
    expect(column(1).slice(0, 2)).toEqual(["52998224725", "12345678909"]);
    expect(column(1)[13]).toBe("12ABC34501DE35");
  });

  it("respeita o tipo forçado e a opção de não completar zeros", () => {
    const data = parseText("doc\n1234567890\n");
    expect(run(data, { op: "formatDocuments", params: { columns: [0], mode: "mask", kind: "cnpj", padZeros: true } }).column(0)).toEqual([
      "00.001.234/5678-90",
    ]);
    const plan = planOp(data, { op: "formatDocuments", params: { columns: [0], mode: "mask", kind: "cpf", padZeros: false } });
    expect(plan.unrecognized[0]?.reason).toBe("faltam dígitos para CPF");
  });

  it("usa o tipo mais comum na coluna quando não dá para decidir pelo dígito", () => {
    // 1 não fecha nem como CPF nem como CNPJ; a coluna tem mais CNPJs.
    const data = parseText("doc\n11222333000181\n45321789000110\n1\n");
    const { column } = run(data, { op: "formatDocuments", params: { columns: [0], mode: "unmask", kind: "auto", padZeros: true } });
    expect(column(0)[2]).toBe("00000000000001");
  });
});

describe("telefones", () => {
  const phones = openFixture("telefones.csv");

  it("normaliza todos os casos da especificação", () => {
    const { column, plan } = run(phones, {
      op: "formatPhones",
      params: { columns: [1], format: "national", addNinthDigit: true },
    });
    expect(column(1)).toEqual([
      "(11) 91234-5678",
      "(11) 91234-5678",
      "(11) 91234-5678",
      "(11) 91234-5678",
      "(55) 99123-4567",
      "(11) 91234-5678",
      "(11) 3123-4567",
      "(11) 98123-4567",
      "(11) 3123-4567",
      "91234-5678",
      "0800 123 4567",
      "190",
      "(20) 91234-5678",
      "não tem",
    ]);
    expect(plan.unrecognized.map((u) => u.reason)).toEqual(["sem DDD", "DDD 20 não existe", "não tem dígitos"]);
  });

  it("usa o DDD padrão, formatos só dígitos e E.164, e pode não acrescentar o 9", () => {
    const e164 = run(phones, { op: "formatPhones", params: { columns: [1], format: "e164", addNinthDigit: false, defaultDdd: "21" } });
    expect(e164.column(1)[0]).toBe("+5511912345678");
    expect(e164.column(1)[7]).toBe("+551181234567");
    expect(e164.column(1)[9]).toBe("+5521912345678");
    const digits = run(phones, { op: "formatPhones", params: { columns: [1], format: "digits", addNinthDigit: true } });
    expect(digits.column(1)[6]).toBe("1131234567");
  });

  it("recusa número estrangeiro e celular sem 9", () => {
    expect(normalizePhone("+1 415 555 0100", { addNinthDigit: true })).toEqual({ kind: "unrecognized", reason: "número de outro país" });
    expect(normalizePhone("11 81234-5678", { addNinthDigit: true })).toEqual({
      kind: "unrecognized",
      reason: "celular deve começar com 9",
    });
  });

  it("rejeita DDD padrão inválido", () => {
    expect(() => planOp(phones, { op: "formatPhones", params: { columns: [1], format: "national", addNinthDigit: true, defaultDdd: "1" } })).toThrow(
      "O DDD padrão deve ter 2 dígitos",
    );
  });
});

describe("estrutura de colunas", () => {
  const clientes = () => openFixture("clientes-utf8-virgula.csv");
  const names = (d: Dataset) => d.columns.map((c) => c.name);

  it("renomeia, move, exclui e duplica", () => {
    expect(names(run(clientes(), { op: "renameColumn", params: { column: 0, name: "Cliente" } }).dataset)[0]).toBe("Cliente");
    expect(names(run(clientes(), { op: "moveColumn", params: { from: 6, to: 0 } }).dataset).slice(0, 2)).toEqual(["valor_compra", "nome"]);
    expect(names(run(clientes(), { op: "deleteColumns", params: { columns: [1, 2] } }).dataset)).toEqual([
      "nome",
      "cidade",
      "uf",
      "data_cadastro",
      "valor_compra",
    ]);
    const duplicated = run(clientes(), { op: "duplicateColumn", params: { column: 3 } });
    expect(names(duplicated.dataset).slice(3, 5)).toEqual(["cidade", "cidade (cópia)"]);
    expect(duplicated.column(4)).toEqual(duplicated.column(3));
  });

  it("não renomeia sem cabeçalho", () => {
    expect(() => planOp(openFixture("sem-cabecalho.csv"), { op: "renameColumn", params: { column: 0, name: "x" } })).toThrow(
      "Primeira linha é cabeçalho",
    );
  });

  it("divide uma coluna no separador", () => {
    const split = run(clientes(), { op: "splitColumn", params: { column: 0, separator: " ", parts: 2, names: ["Nome", "Sobrenome"] } });
    expect(names(split.dataset).slice(0, 3)).toEqual(["Nome", "Sobrenome", "cpf"]);
    expect(split.column(0)[0]).toBe("João");
    expect(split.column(1)[0]).toBe("da Silva");
  });

  it("junta colunas com separador, mantendo ou removendo as originais", () => {
    const merged = run(clientes(), {
      op: "mergeColumns",
      params: { columns: [3, 4], separator: " - ", name: "cidade_uf", keepOriginals: false },
    });
    expect(names(merged.dataset)).toEqual(["nome", "cpf", "email", "cidade_uf", "data_cadastro", "valor_compra"]);
    expect(merged.column(3)[0]).toBe("São Paulo - SP");
    const kept = run(clientes(), { op: "mergeColumns", params: { columns: [3, 4], separator: "/", name: "", keepOriginals: true } });
    expect(names(kept.dataset).slice(3, 6)).toEqual(["cidade + uf", "cidade", "uf"]);
  });

  it("mostra o cabeçalho e as primeiras linhas na prévia", () => {
    const dataset = clientes();
    const preview = previewPlan(dataset, planOp(dataset, { op: "splitColumn", params: { column: 0, separator: " ", parts: 2 } }));
    expect(preview.samples[0]).toMatchObject({ row: -1, after: "nome 1,nome 2,cpf,email,cidade,uf,data_cadastro,valor_compra" });
    expect(preview.affectedRows).toBe(5);
  });

  it("desfaz mudanças de coluna em linhas com menos células", () => {
    const jagged = parseText("a;b;c\n1;2;3\n4;5\n");
    run(jagged, { op: "deleteColumns", params: { columns: [0] } });
    run(jagged, { op: "moveColumn", params: { from: 2, to: 0 } });
  });
});

describe("localizar e substituir", () => {
  const data = () => parseText("nome;cpf\nJoão Silva;529.982.247-25\njoão;123.456.789-09\nMaria;R$ 10\n");

  it("substitui texto, diferenciando ou não maiúsculas", () => {
    const base = { replace: "Jo", matchCase: false, wholeCell: false, regex: false, columns: [0] };
    expect(run(data(), { op: "replace", params: { ...base, find: "joão" } }).column(0).slice(0, 2)).toEqual(["Jo Silva", "Jo"]);
    expect(run(data(), { op: "replace", params: { ...base, find: "joão", matchCase: true } }).column(0).slice(0, 2)).toEqual([
      "João Silva",
      "Jo",
    ]);
  });

  it("célula inteira", () => {
    const result = run(data(), {
      op: "replace",
      params: { find: "joão", replace: "X", matchCase: false, wholeCell: true, regex: false, columns: "all" },
    });
    expect(result.column(0)).toEqual(["João Silva", "X", "Maria"]);
  });

  it("expressão regular com grupos", () => {
    const result = run(data(), {
      op: "replace",
      params: { find: "(\\d{3})\\.(\\d{3})\\.(\\d{3})-(\\d{2})", replace: "$1$2$3$4", matchCase: false, wholeCell: false, regex: true, columns: [1] },
    });
    expect(result.column(1).slice(0, 2)).toEqual(["52998224725", "12345678909"]);
  });

  it("sem expressão regular, $ e pontos são texto comum", () => {
    const result = run(data(), {
      op: "replace",
      params: { find: "R$ 10", replace: "$1.00", matchCase: false, wholeCell: false, regex: false, columns: "all" },
    });
    expect(result.column(1)[2]).toBe("$1.00");
  });

  it("recusa expressão regular inválida", () => {
    expect(() =>
      planOp(data(), {
        op: "replace",
        params: { find: "(abc", replace: "", matchCase: false, wholeCell: false, regex: true, columns: "all" },
      }),
    ).toThrow("Expressão regular inválida");
  });
});
