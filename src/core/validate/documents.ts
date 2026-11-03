// CPF e CNPJ (inclusive o CNPJ alfanumérico, IN RFB nº 2.229/2024).

const allSame = (value: string) => /^(.)\1*$/.test(value);

// Só os caracteres que contam: dígitos (e letras, no CNPJ), em maiúsculas.
export function documentChars(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isValidCpf(value: string): boolean {
  if (/[A-Za-z]/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11 || allSame(digits)) return false;
  const d = [...digits].map(Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += d[i]! * (length + 1 - i);
    if (((sum * 10) % 11) % 10 !== d[length]) return false;
  }
  return true;
}

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

// Cada caractere vale o código ASCII − 48: "0"–"9" → 0–9, "A" → 17 … "Z" → 42.
function cnpjCheckDigit(values: readonly number[], weights: readonly number[]): number {
  const remainder = values.reduce((sum, v, i) => sum + v * weights[i]!, 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  const chars = documentChars(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(chars) || allSame(chars)) return false;
  const values = [...chars.slice(0, 12)].map((c) => c.charCodeAt(0) - 48);
  const first = cnpjCheckDigit(values, CNPJ_WEIGHTS_1);
  const second = cnpjCheckDigit([...values, first], CNPJ_WEIGHTS_2);
  return chars.endsWith(`${first}${second}`);
}

export function maskCpf(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function maskCnpj(chars: string): string {
  return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5, 8)}/${chars.slice(8, 12)}-${chars.slice(12)}`;
}
