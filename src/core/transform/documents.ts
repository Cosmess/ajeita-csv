import { documentChars, isValidCnpj, isValidCpf, maskCnpj, maskCpf } from "../validate/documents";

export type DocumentMode = "mask" | "unmask";
export type DocumentKind = "auto" | "cpf" | "cnpj";

export type FormatResult = { value: string } | { unrecognized: string };

const SCIENTIFIC = /^\d+([.,]\d+)?E\+?\d+$/i;

// Tipo mais comum numa coluna: decide se um número curto (zeros perdidos) é CPF ou CNPJ.
export function predominantDocument(values: Iterable<string>): "cpf" | "cnpj" {
  let cpf = 0;
  let cnpj = 0;
  for (const value of values) {
    const chars = documentChars(value);
    if (chars.length === 11) cpf++;
    else if (chars.length === 14) cnpj++;
  }
  return cnpj > cpf ? "cnpj" : "cpf";
}

export function formatDocument(
  value: string,
  options: { mode: DocumentMode; kind: DocumentKind; padZeros: boolean; predominant: "cpf" | "cnpj" },
): FormatResult {
  const trimmed = value.trim();
  if (SCIENTIFIC.test(trimmed)) return { unrecognized: "valor truncado pelo Excel; recupere do arquivo original" };
  const chars = documentChars(trimmed);
  if (chars === "") return { unrecognized: "não é CPF nem CNPJ" };

  let target: "cpf" | "cnpj";
  if (/[A-Z]/.test(chars)) {
    // CNPJ alfanumérico: tem sempre os 14 caracteres (o Excel não tira zeros de texto).
    if (options.kind === "cpf" || chars.length !== 14) return { unrecognized: "não é CPF nem CNPJ" };
    target = "cnpj";
  } else if (options.kind !== "auto") {
    target = options.kind;
  } else if (chars.length === 11) {
    target = "cpf";
  } else if (chars.length === 14 || chars.length > 11) {
    target = "cnpj";
  } else {
    // Perdeu zeros: se só um dos dois completados tem dígito verificador válido, é esse.
    const asCpf = isValidCpf(chars.padStart(11, "0"));
    const asCnpj = isValidCnpj(chars.padStart(14, "0"));
    target = asCpf !== asCnpj ? (asCpf ? "cpf" : "cnpj") : options.predominant;
  }

  const size = target === "cpf" ? 11 : 14;
  if (chars.length > size) return { unrecognized: `tem dígitos demais para ${target.toUpperCase()}` };
  if (chars.length < size && !options.padZeros) return { unrecognized: `faltam dígitos para ${target.toUpperCase()}` };
  const full = chars.padStart(size, "0");
  if (options.mode === "unmask") return { value: full };
  return { value: target === "cpf" ? maskCpf(full) : maskCnpj(full) };
}

export function formatCep(value: string, mode: DocumentMode): FormatResult {
  let digits = value.replace(/\D/g, "");
  // CEPs que começam com 0 perdem o zero no Excel (ex.: 1310100).
  if (digits.length === 7) digits = `0${digits}`;
  if (digits.length !== 8 || /\D/.test(value.replace(/[\s.-]/g, ""))) return { unrecognized: "CEP precisa ter 8 dígitos" };
  return { value: mode === "mask" ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits };
}
