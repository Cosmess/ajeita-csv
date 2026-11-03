import { VALID_DDDS } from "../validate/ddd";

export type PhoneFormat = "national" | "digits" | "e164";
export type PhoneOptions = { addNinthDigit: boolean; defaultDdd?: string };

export type PhoneResult =
  // DDD + número, só dígitos (10 ou 11).
  | { kind: "phone"; digits: string }
  // Números não geográficos (0800, 4004…) e curtos (190): ficam como estão.
  | { kind: "special" }
  | { kind: "unrecognized"; reason: string };

const NON_GEOGRAPHIC = /^0[3589]00\d{6,7}$/;
const CAPITALS = /^400[34]\d{4}$/;

// Normaliza um telefone brasileiro seguindo as regras do CLAUDE.md (2.2), nesta ordem.
export function normalizePhone(value: string, options: PhoneOptions): PhoneResult {
  // 1. Só dígitos, lembrando se havia "+".
  const plus = value.trim().startsWith("+");
  let digits = value.replace(/\D/g, "");
  if (digits === "") return { kind: "unrecognized", reason: "não tem dígitos" };

  // 6. Não geográficos e números curtos ficam como estão.
  if (NON_GEOGRAPHIC.test(digits) || CAPITALS.test(digits) || (!plus && digits.length <= 4)) return { kind: "special" };

  // 2. Código do país: 55 + 10 ou 11 dígitos (o tamanho separa do DDD 55).
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  else if (plus) return { kind: "unrecognized", reason: "número de outro país" };

  // 3. Prefixo de longa distância: 0 + operadora + DDD + número, ou 0 + DDD + número.
  if (digits.startsWith("0")) {
    if (digits.length === 13 || digits.length === 14) digits = digits.slice(3);
    else if (digits.length === 11 || digits.length === 12) digits = digits.slice(1);
  }

  // 5 (sem DDD). Usa o DDD padrão, se informado.
  if (digits.length === 8 || digits.length === 9) {
    if (!options.defaultDdd) return { kind: "unrecognized", reason: "sem DDD" };
    digits = options.defaultDdd + digits;
  }

  // 4. DDD válido.
  const ddd = digits.slice(0, 2);
  if (!VALID_DDDS.has(ddd)) return { kind: "unrecognized", reason: `DDD ${ddd} não existe` };

  // 5. Classificação pelo tamanho.
  const first = digits[2]!;
  if (digits.length === 11) {
    return first === "9" ? { kind: "phone", digits } : { kind: "unrecognized", reason: "celular deve começar com 9" };
  }
  if (digits.length === 10) {
    if (first >= "2" && first <= "5") return { kind: "phone", digits };
    if (first >= "6") return { kind: "phone", digits: options.addNinthDigit ? `${ddd}9${digits.slice(2)}` : digits };
  }
  return { kind: "unrecognized", reason: "número com tamanho inválido" };
}

export function formatPhone(digits: string, format: PhoneFormat): string {
  if (format === "digits") return digits;
  if (format === "e164") return `+55${digits}`;
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  const split = number.length - 4;
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}
