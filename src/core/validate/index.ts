import { normalizePhone } from "../transform/phone";
import { isValidCnpj, isValidCpf } from "./documents";

export type ValidationRule = "cpf" | "cnpj" | "cpfCnpj" | "email" | "cep" | "phone" | "required";

export const RULE_LABELS: Record<ValidationRule, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  cpfCnpj: "CPF ou CNPJ",
  email: "E-mail",
  cep: "CEP",
  phone: "Telefone",
  required: "Obrigatório",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const CEP = /^\d{5}-?\d{3}$/;

// Vazio só é inválido na regra "obrigatório"; nas demais, campo vazio não é erro de formato.
export function isValid(rule: ValidationRule, value: string): boolean {
  const v = value.trim();
  if (rule === "required") return v !== "";
  if (v === "") return true;
  switch (rule) {
    case "cpf":
      return isValidCpf(v);
    case "cnpj":
      return isValidCnpj(v);
    case "cpfCnpj":
      return isValidCpf(v) || isValidCnpj(v);
    case "email":
      return EMAIL.test(v);
    case "cep":
      return CEP.test(v);
    case "phone":
      return normalizePhone(v, { addNinthDigit: false }).kind !== "unrecognized";
  }
}

export function countInvalid(rows: readonly (readonly string[])[], column: number, rule: ValidationRule, indices?: Uint32Array): number {
  let count = 0;
  const total = indices ? indices.length : rows.length;
  for (let i = 0; i < total; i++) {
    const row = rows[indices ? indices[i]! : i]!;
    if (!isValid(rule, row[column] ?? "")) count++;
  }
  return count;
}
