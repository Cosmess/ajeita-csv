import { describe, expect, it } from "vitest";
import {
  CHANGES_COLUMN,
  compareColumns,
  compareDatasets,
  formatChanges,
  parseChanges,
  STATUS_COLUMN,
  suggestKey,
  type CompareOptions,
} from "../../src/core/files/compare";
import { openFixture, parseText } from "../helpers";

const before = () => ({ name: "antes.csv", dataset: openFixture("comparar-antes.csv") });
const after = () => ({ name: "depois.csv", dataset: openFixture("comparar-depois.csv") });
const OPTIONS: CompareOptions = { keys: ["cpf"], ignoreCase: false, byValue: true, includeSame: true };

const byStatus = (rows: string[][]) => rows.slice(1).map((r) => `${r[0]} ${r[2]}`);

describe("comparar planilhas", () => {
  it("alinha as colunas pelo nome e sugere a coluna-chave", () => {
    expect(compareColumns(before().dataset, after().dataset)).toEqual({
      common: ["cpf", "nome", "email", "valor"],
      onlyBefore: ["cidade"],
      onlyAfter: ["telefone"],
    });
    expect(suggestKey(before().dataset, after().dataset)).toBe("cpf");
  });

  it("casa pela chave com CPF com e sem máscara e números em formatos diferentes", () => {
    const { rows, summary } = compareDatasets(before(), after(), OPTIONS);
    expect(rows[0]).toEqual([STATUS_COLUMN, "cpf", "nome", "email", "valor", "cidade", "telefone", CHANGES_COLUMN]);
    expect(byStatus(rows)).toEqual([
      "Alterado João da Silva",
      "Alterado MARIA CONCEIÇÃO",
      "Alterado José Araújo",
      "Novo Pedro Alves",
      "Removido Ana Lúcia",
    ]);
    expect(rows[1]!.at(-1)).toBe('email: "joao@antigo.com" → "joao@novo.com"');
    expect(rows[2]!.at(-1)).toBe('nome: "Maria Conceição" → "MARIA CONCEIÇÃO"');
    expect(rows[3]!.at(-1)).toBe('valor: "10,00" → "12.00"');
    // Coluna que só existe no "antes" mantém o valor antigo; a nova vem do "depois".
    expect(rows[1]![5]).toBe("São Paulo");
    expect(rows[1]![6]).toBe("(11) 91234-5678");
    expect(rows[5]![6]).toBe("");
    expect(summary.counts).toEqual({ Novo: 1, Removido: 1, Alterado: 3, Igual: 0 });
  });

  it("ignorando maiúsculas e acentos, a mudança só de caixa vira igual", () => {
    const { rows, summary } = compareDatasets(before(), after(), { ...OPTIONS, ignoreCase: true });
    expect(byStatus(rows)[1]).toBe("Igual MARIA CONCEIÇÃO");
    expect(summary.counts.Igual).toBe(1);
    const only = compareDatasets(before(), after(), { ...OPTIONS, ignoreCase: true, includeSame: false });
    expect(only.rows).toHaveLength(5);
    expect(only.summary.counts.Igual).toBe(1);
  });

  it("sem comparar pelo valor, CPF sem máscara é outra chave", () => {
    const { summary } = compareDatasets(before(), after(), { ...OPTIONS, byValue: false });
    expect(summary.counts).toEqual({ Novo: 4, Removido: 4, Alterado: 0, Igual: 0 });
  });

  it("CPF que perdeu o zero à esquerda no Excel é a mesma chave", () => {
    const a = parseText("cpf,v\n012.345.678-90,a");
    const b = parseText("cpf,v\n1234567890,a");
    const { summary } = compareDatasets({ name: "a", dataset: a }, { name: "b", dataset: b }, OPTIONS);
    expect(summary.counts.Igual).toBe(1);
  });

  it("sem chave, compara linha a linha pela posição", () => {
    const a = parseText("id,v\n1,a\n2,b\n3,c");
    const b = parseText("id,v\n1,a\n9,b");
    const { rows, summary } = compareDatasets({ name: "a", dataset: a }, { name: "b", dataset: b }, { ...OPTIONS, keys: [] });
    expect(byStatus(rows)).toEqual(["Igual a", "Alterado b", "Removido c"]);
    expect(summary.counts).toEqual({ Novo: 0, Removido: 1, Alterado: 1, Igual: 1 });
  });

  it("chaves repetidas casam na ordem e são contadas", () => {
    const a = parseText("id,v\n1,a\n1,b\n2,c");
    const b = parseText("id,v\n1,a\n1,x\n1,y");
    const { rows, summary } = compareDatasets({ name: "a", dataset: a }, { name: "b", dataset: b }, { ...OPTIONS, keys: ["id"] });
    expect(byStatus(rows)).toEqual(["Igual a", "Alterado x", "Novo y", "Removido c"]);
    expect(summary.duplicateKeys).toEqual({ before: 1, after: 2 });
  });

  it("chave que não existe nos dois arquivos é recusada", () => {
    expect(() => compareDatasets(before(), after(), { ...OPTIONS, keys: ["cidade"] })).toThrow("precisa existir nos dois");
  });

  it("o texto das alterações volta a ser lido, com aspas, ponto e vírgula e setas nos valores", () => {
    const changes = [
      { column: "nome", before: 'Ana "Aninha"', after: "Ana; Maria" },
      { column: "nome completo", before: "a → b", after: "" },
    ];
    const text = formatChanges(changes);
    const parsed = parseChanges(text, ["nome", "nome completo", "email"]);
    expect([...parsed]).toEqual([
      ["nome", 'Ana "Aninha"'],
      ["nome completo", "a → b"],
    ]);
    expect(parseChanges("texto qualquer", ["nome"]).size).toBe(0);
  });
});
