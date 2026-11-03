import { describe, expect, it } from "vitest";
import { countMojibakeCells, fixMojibake } from "../../src/core/fix/mojibake";
import { findProblems, parseRowText, rowToText, splitUnclosedQuote } from "../../src/core/fix/problems";
import { applyPatch } from "../../src/core/patch";
import { planOp } from "../../src/core/ops";
import { previewPlan } from "../../src/core/preview";
import { openFixture, parseText } from "../helpers";

describe("acentos quebrados (mojibake)", () => {
  it.each([
    ["JoÃ£o", "João"],
    ["SÃ£o Paulo", "São Paulo"],
    ["ConceiÃ§Ã£o", "Conceição"],
    ["Itâ€™s ok â€” sem pendÃªncias", "It’s ok — sem pendências"],
    ["Prefere o â€œWhatsAppâ€\u009d", "Prefere o “WhatsApp”"],
    ["NÃ£o ligar apÃ³s Ã s 18h", "Não ligar após às 18h"],
    ["Ã‚ngela", "Ângela"],
    ["JoÃƒÂ£o", "João"], // estragado duas vezes
  ])("%s → %s", (broken, fixed) => {
    expect(fixMojibake(broken)).toBe(fixed);
  });

  it.each(["João", "São Paulo", "abc", "Ação 100%", "Preço: R$ 10", "Ã sozinho"])("não mexe em texto correto: %s", (text) => {
    expect(fixMojibake(text)).toBeUndefined();
  });

  it("corrige 100% da fixture sem alterar células que já estavam certas", () => {
    const dataset = openFixture("mojibake.csv");
    const plan = planOp(dataset, { op: "fixEncoding", params: {} });
    const fixed = applyPatch(dataset, plan.patch).dataset;
    expect(fixed.rows).toEqual([
      ["João", "São Paulo", "Cliente desde 2020"],
      ["Conceição", "Maceió", "Pagamento em débito"],
      ["José", "Ribeirão Preto", "Não ligar após às 18h"],
      ["Ângela", "Goiânia", "Prefere o “WhatsApp”"],
      ["Lúcia", "Florianópolis", "It’s ok — sem pendências"],
      ["Pedro", "Curitiba", "Texto já correto"],
    ]);
    expect(countMojibakeCells(fixed)).toBe(0);
    // Só células com mojibake entram na alteração.
    expect(plan.patch.kind === "cells" && plan.patch.cells.every((c) => c.row < 5)).toBe(true);
  });

  it("não encontra acentos quebrados nos arquivos corretos", () => {
    for (const name of ["clientes-utf8-virgula.csv", "clientes-windows1252-ponto-virgula.csv", "telefones.csv", "sujeira.csv"]) {
      expect(countMojibakeCells(openFixture(name))).toBe(0);
    }
  });

  it("mostra prévia no formato padrão", () => {
    const dataset = openFixture("mojibake.csv");
    const preview = previewPlan(dataset, planOp(dataset, { op: "fixEncoding", params: {} }));
    expect(preview).toMatchObject({ label: "Corrigir acentos quebrados", affectedRows: 5, unrecognizedTotal: 0 });
    expect(preview.changedCells).toBe(14);
    expect(preview.samples[0]).toEqual({ kind: "cell", row: 0, column: "nome", before: "JoÃ£o", after: "João" });
  });

  it("lista como não reconhecido o que parece quebrado mas não tem conserto", () => {
    const dataset = parseText("a\nJoÃ£o 😀\n");
    const plan = planOp(dataset, { op: "fixEncoding", params: {} });
    expect(plan.unrecognized).toEqual([{ value: "JoÃ£o 😀", count: 1, row: 0 }]);
  });
});

describe("problemas de estrutura", () => {
  it("encontra cada problema da fixture na linha certa", () => {
    const problems = findProblems(openFixture("linhas-quebradas.csv"));
    expect(problems.map((p) => [p.row + 1, p.kinds])).toEqual([
      [2, ["line_break"]],
      [3, ["column_count"]],
      [4, ["column_count"]],
      [5, ["unclosed_quote"]],
    ]);
    expect(problems[1]!.message).toBe("Tem 6 colunas; o esperado é 4");
  });

  it("separa as linhas engolidas por uma aspa não fechada", () => {
    const dataset = openFixture("linhas-quebradas.csv");
    expect(splitUnclosedQuote(dataset.rows[4]!, ",")).toEqual([
      ["5", "Carla", "Rua E", " 500", "ok"],
      ["6", "Lucas", "Rua F", "ok"],
      ["7", "Bruna", "Rua G, 700", "ok"],
    ]);
  });

  it("corrige todos os problemas automaticamente", () => {
    const dataset = openFixture("linhas-quebradas.csv");
    const fixed = applyPatch(dataset, planOp(dataset, { op: "fixProblems", params: { rows: "all" } }).patch).dataset;
    expect(fixed.rows).toEqual([
      ["1", "Maria", "Rua A, 100", "ok"],
      ["2", "João", "Av. Brasil, 200 apto 31", "quebra de linha dentro do campo (válido)"],
      ["3", "Ana", "Rua C", "colunas a mais,extra,extra2"],
      ["4", "Pedro", "Rua D", ""],
      ["5", "Carla", "Rua E", " 500,ok"],
      ["6", "Lucas", "Rua F", "ok"],
      ["7", "Bruna", "Rua G, 700", "ok"],
    ]);
    expect(findProblems(fixed)).toEqual([]);
    expect(fixed.meta.issues).toEqual([]);
  });

  it("corrige só o tipo pedido", () => {
    const dataset = openFixture("linhas-quebradas.csv");
    const plan = planOp(dataset, { op: "fixProblems", params: { rows: "all", kind: "line_break" } });
    const fixed = applyPatch(dataset, plan.patch).dataset;
    expect(findProblems(fixed).map((p) => p.kinds[0])).toEqual(["column_count", "column_count", "unclosed_quote"]);
  });

  it("sem cabeçalho, espera o número de colunas mais comum", () => {
    const problems = findProblems(parseText("1;a;x\n2;b;y\n3;c\n4;d;z\n", { hasHeader: false }));
    expect(problems.map((p) => p.row)).toEqual([2]);
  });

  it("ignora linhas totalmente vazias", () => {
    expect(findProblems(parseText("a;b\n1;2\n\n3;4\n"))).toEqual([]);
  });

  it("converte a linha em texto para edição e lê de volta", () => {
    const row = ["1", "Rua A, 100", 'diz "oi"'];
    const text = rowToText(row, ",");
    expect(text).toBe('1,"Rua A, 100","diz ""oi"""');
    expect(parseRowText(text, ",")).toEqual([row]);
    expect(parseRowText("a,b\nc,d", ",")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseRowText("  ", ",")).toEqual([]);
  });
});
