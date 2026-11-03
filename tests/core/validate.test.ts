import { describe, expect, it } from "vitest";
import { isValid } from "../../src/core/validate";
import { isValidCnpj, isValidCpf } from "../../src/core/validate/documents";
import { openFixture } from "../helpers";

describe("CPF e CNPJ", () => {
  const documents = openFixture("documentos-cpf-cnpj.csv").rows.map(([description, value]) => [description!, value!]);

  it.each(documents)("%s: %s", (description, value) => {
    const valid = isValidCpf(value) || isValidCnpj(value);
    expect(valid).toBe(/válido|minúsculas/.test(description) && !/inválido/.test(description));
  });

  it("valida o CNPJ alfanumérico do exemplo da Receita Federal", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
    // Os dígitos verificadores são sempre numéricos.
    expect(isValidCnpj("12ABC34501DEA5")).toBe(false);
  });

  it("CPF não aceita letras nem sequências repetidas", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529A82247-25")).toBe(false);
    expect(isValidCpf("000.000.000-00")).toBe(false);
  });
});

describe("regras de validação", () => {
  it.each([
    ["email", "maria@example.com", true],
    ["email", "pedro@example", false],
    ["email", "a b@x.com", false],
    ["cep", "01310-100", true],
    ["cep", "01310100", true],
    ["cep", "1310100", false],
    ["phone", "(11) 91234-5678", true],
    ["phone", "(20) 91234-5678", false],
    ["phone", "91234-5678", false],
    ["cpfCnpj", "11.222.333/0001-81", true],
    ["required", "", false],
    ["required", "  ", false],
    ["required", "x", true],
  ] as const)("%s: %j → %s", (rule, value, expected) => {
    expect(isValid(rule, value)).toBe(expected);
  });

  it("vazio só é inválido na regra obrigatório", () => {
    expect(isValid("cpf", "")).toBe(true);
    expect(isValid("email", " ")).toBe(true);
  });
});
