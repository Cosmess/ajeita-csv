import { describe, expect, it } from "vitest";
import type { Dataset } from "../../src/core/dataset";
import { planOp, type Op } from "../../src/core/ops";
import { applyPatch } from "../../src/core/patch";
import { previewPlan } from "../../src/core/preview";
import {
  keyFromPassword,
  maskValue,
  randomKey,
  suggestColumns,
  type AnonymizeMethod,
  type DataKind,
} from "../../src/core/transform/anonymize";
import { isValid } from "../../src/core/validate";
import { parseText } from "../helpers";

const CSV = `nome;cpf;email;telefone;cep;nascimento;cidade;valor
João da Silva;529.982.247-25;joao.silva@gmail.com;(11) 91234-5678;01310-100;15/03/1987;São Paulo;1.234,56
Maria Conceição;12345678909;MARIA@EMPRESA.COM.BR;+5521987654321;20040020;1990-12-01;Rio de Janeiro;10,00
João da Silva;52998224725;joao.silva@gmail.com;11912345678;01310100;15/03/1987;São Paulo;99,90
Ana Lúcia Gonçalves;11.222.333/0001-81;ana@ex.com;(31) 3333-4444;30130-010;01/01/2000;Belo Horizonte;5,00
Pedro;;;0800 123 4567;;;Curitiba;1,00`;

const dataset = () => parseText(CSV);
const KEY = "a".repeat(64);
const KINDS: DataKind[] = ["name", "document", "email", "phone", "cep", "date"];

function anonymize(data: Dataset, method: AnonymizeMethod, options: { key?: string; shared?: boolean } = {}) {
  const op: Op = {
    op: "anonymize",
    params: {
      rules: KINDS.map((kind, column) => ({ column, method, kind })),
      key: options.key ?? KEY,
      shared: options.shared ?? false,
    },
  };
  const plan = planOp(data, op);
  const applied = applyPatch(data, plan.patch);
  expect(applyPatch(applied.dataset, applied.inverse).dataset.rows).toEqual(data.rows);
  return { plan, rows: applied.dataset.rows, column: (i: number) => applied.dataset.rows.map((r) => r[i] ?? "") };
}

describe("sugestão de colunas", () => {
  it("detecta o tipo pelo conteúdo e pelo nome da coluna", () => {
    const suggestions = suggestColumns(dataset());
    expect(suggestions.map((s) => [s.kind, s.sensitive])).toEqual([
      ["name", true],
      ["document", true],
      ["email", true],
      ["phone", true],
      ["cep", true],
      ["date", true],
      ["text", false],
      ["text", false],
    ]);
  });

  it("data sem pista de nascimento não é marcada como sensível", () => {
    const [suggestion] = suggestColumns(parseText("data_pedido\n01/02/2024\n03/04/2024"));
    expect(suggestion).toMatchObject({ kind: "date", sensitive: false });
  });
});

describe("mascarar", () => {
  it.each([
    ["529.982.247-25", "document", "***.982.247-**"],
    ["52998224725", "document", "***982247**"],
    ["1234567890", "document", "***345678**"],
    ["11.222.333/0001-81", "document", "**.222.333/0001-**"],
    ["12.ABC.345/01DE-35", "document", "**.ABC.345/01DE-**"],
    ["joao.silva@gmail.com", "email", "j***@gmail.com"],
    ["(11) 91234-5678", "phone", "(11) 9****-5678"],
    ["+553133334444", "phone", "(31) ****-4444"],
    ["0800 123 4567", "phone", "0800 123 4567"],
    ["01310-100", "cep", "01310-***"],
    ["1310100", "cep", "01310-***"],
    ["15/03/1987", "date", "**/**/1987"],
    ["1990-12-01", "date", "1990-**-**"],
    ["João da Silva", "name", "J*** d*** S***"],
  ] as [string, DataKind, string][])("%s (%s) → %s", (value, kind, expected) => {
    expect(maskValue(value, kind)).toBe(expected);
  });

  it("valor fora do tipo da coluna recebe a máscara genérica, nunca fica como está", () => {
    expect(maskValue("não informado", "document")).toBe("n*** i***");
    expect(maskValue("sem email", "email")).toBe("s*** e***");
  });

  it("mascara todas as colunas escolhidas e deixa as outras", () => {
    const { column, plan } = anonymize(dataset(), "mask");
    expect(column(1)).toEqual(["***.982.247-**", "***456789**", "***982247**", "**.222.333/0001-**", ""]);
    expect(column(6)).toEqual(dataset().rows.map((r) => r[6]));
    expect(plan.label).toBe("Anonimizar 6 colunas");
    expect(plan.unrecognizedTotal).toBe(0);
  });
});

describe("pseudônimo", () => {
  it("sem senha numera na ordem e repete o código para o mesmo valor, com ou sem máscara", () => {
    const { column } = anonymize(dataset(), "pseudonym");
    expect(column(0)).toEqual(["nome 0001", "nome 0002", "nome 0001", "nome 0003", "nome 0004"]);
    expect(column(1).slice(0, 3)).toEqual(["cpf 0001", "cpf 0002", "cpf 0001"]);
    expect(column(3).slice(0, 3)).toEqual(["telefone 0001", "telefone 0002", "telefone 0001"]);
  });

  it("com senha, o mesmo valor vira o mesmo código em outro arquivo", () => {
    const key = keyFromPassword("minha senha");
    const first = anonymize(dataset(), "pseudonym", { key, shared: true }).column(1);
    const other = parseText("x;cpf\n1;111.111.111-11\n2;529.982.247-25");
    const op: Op = { op: "anonymize", params: { rules: [{ column: 1, method: "pseudonym", kind: "document" }], key, shared: true } };
    const second = applyPatch(other, planOp(other, op).patch).dataset.rows.map((r) => r[1]);
    expect(first[0]).toMatch(/^cpf [0-9A-F]{12}$/);
    expect(second[1]).toBe(first[0]);
    expect(keyFromPassword("outra")).not.toBe(key);
  });
});

describe("dado falso", () => {
  it("gera valores válidos no mesmo formato e consistentes para a mesma pessoa", () => {
    const { column } = anonymize(dataset(), "fake");
    const cpfs = column(1);
    expect(cpfs[0]).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    expect(cpfs[1]).toMatch(/^\d{11}$/);
    expect(cpfs[3]).toMatch(/^\d{2}\.\d{3}\.\d{3}\/0001-\d{2}$/);
    expect(cpfs.slice(0, 4).every((v) => isValid("cpfCnpj", v))).toBe(true);
    // Mesmo CPF com e sem máscara: mesmo CPF falso (só muda o formato).
    expect(cpfs[2]).toBe(cpfs[0]!.replace(/\D/g, ""));
    expect(cpfs[0]).not.toBe("529.982.247-25");

    const emails = column(2);
    expect(emails.slice(0, 4).every((v) => /^[a-z]+\.[a-z]+\d{6}@example\.com$/.test(v))).toBe(true);
    expect(emails[2]).toBe(emails[0]);

    const phones = column(3);
    expect(phones[0]).toMatch(/^\(11\) 9[6-9]\d{3}-\d{4}$/);
    expect(phones[1]).toMatch(/^\+55219[6-9]\d{7}$/);
    expect(phones[3]).toMatch(/^\(31\) [2-5]\d{3}-\d{4}$/);
    expect(phones[4]).toBe("0800 123 4567");
    expect(phones.slice(0, 4).every((v) => isValid("phone", v))).toBe(true);

    expect(column(4)[0]).toMatch(/^\d{5}-\d{3}$/);
    expect(column(5)[0]).toMatch(/^\d{2}\/\d{2}\/1987$/);
    expect(column(5)[1]).toMatch(/^1990-\d{2}-\d{2}$/);
    expect(column(0)[0]).toMatch(/^\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+$/u);
    expect(column(0)[4]).toMatch(/^\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+$/u);
  });

  it("valores diferentes nunca viram o mesmo dado falso", () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `${i}@ex.com`).join("\n");
    const data = parseText(`email\n${rows}`);
    const op: Op = { op: "anonymize", params: { rules: [{ column: 0, method: "fake", kind: "email" }], key: randomKey(), shared: false } };
    const out = applyPatch(data, planOp(data, op).patch).dataset.rows.map((r) => r[0]);
    expect(new Set(out).size).toBe(3000);
  });

  it("chaves diferentes geram resultados diferentes", () => {
    const a = anonymize(dataset(), "fake", { key: randomKey() }).column(1);
    const b = anonymize(dataset(), "fake", { key: randomKey() }).column(1);
    expect(a).not.toEqual(b);
  });
});

describe("apagar", () => {
  it("esvazia as células e a prévia conta as alteradas", () => {
    const data = dataset();
    const { column, plan } = anonymize(data, "clear");
    expect(column(1).every((v) => v === "")).toBe(true);
    const preview = previewPlan(data, plan);
    expect(preview.changedCells).toBe(26);
    expect(preview.affectedRows).toBe(5);
  });
});
