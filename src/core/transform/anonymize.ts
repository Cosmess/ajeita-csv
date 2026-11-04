import type { Dataset } from "../dataset";
import { cnpjCheckDigits, cpfCheckDigits, documentChars, isValidCnpj, isValidCpf, maskCnpj, maskCpf } from "../validate/documents";
import { formatPhone, normalizePhone } from "./phone";
import { fromHex, hmacSha256, sha256, toHex } from "./sha256";
import { removeAccents } from "./text";

// Anonimização para a LGPD. Nada aqui deixa o valor original passar: o que não é
// reconhecido no tipo da coluna recebe a máscara genérica (primeira letra de cada palavra).

export type AnonymizeMethod = "mask" | "pseudonym" | "fake" | "clear";
export type DataKind = "document" | "email" | "phone" | "cep" | "date" | "name" | "text";
export type AnonymizeRule = { column: number; method: AnonymizeMethod; kind: DataKind };

export const DATA_KIND_LABELS: Record<DataKind, string> = {
  document: "CPF/CNPJ",
  email: "E-mail",
  phone: "Telefone",
  cep: "CEP",
  date: "Data",
  name: "Nome",
  text: "Texto",
};

export type ColumnSuggestion = { column: number; kind: DataKind; sensitive: boolean };

// --- Detecção ------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const CEP = /^\d{5}-\d{3}$/;
const SAMPLE = 500;

// Pistas pelo nome da coluna ("nome_cliente", "Data de Nascimento", "E-mail").
const HEADER_HINTS: [RegExp, DataKind, boolean][] = [
  [/\b(cpf|cnpj|documento|doc)\b/, "document", true],
  [/\be ?mail\b/, "email", true],
  [/\b(tel|telefone|fone|celular|cel|whatsapp|whats)\b/, "phone", true],
  [/\bcep\b/, "cep", true],
  [/\b(nascimento|nasc|aniversario)\b/, "date", true],
  [/\b(nome|name|mae|pai|responsavel|titular|paciente|cliente|contato)\b/, "name", true],
  [/\b(endereco|logradouro|rua|bairro|complemento|rg)\b/, "text", true],
];

function headerHint(name: string): [DataKind, boolean] | undefined {
  const words = removeAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  for (const [pattern, kind, sensitive] of HEADER_HINTS) if (pattern.test(words)) return [kind, sensitive];
  return undefined;
}

function valueKind(value: string): DataKind | undefined {
  const v = value.trim();
  if (isValidCpf(v) || isValidCnpj(v)) return "document";
  if (EMAIL.test(v)) return "email";
  if (CEP.test(v)) return "cep";
  if (/[\d]/.test(v) && normalizePhone(v, { addNinthDigit: false }).kind === "phone") return "phone";
  return undefined;
}

// Sugere o tipo de dado de cada coluna e se ela parece ter dado pessoal.
export function suggestColumns(dataset: Dataset): ColumnSuggestion[] {
  return dataset.columns.map((info, column) => {
    const counts = new Map<DataKind, number>();
    let total = 0;
    for (const row of dataset.rows) {
      const value = row[column] ?? "";
      if (value.trim() === "") continue;
      const kind = valueKind(value);
      if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
      if (++total >= SAMPLE) break;
    }
    const [byContent, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
    // O conteúdo decide quando é claro (60% ou mais); senão vale o nome da coluna.
    if (byContent && count! >= total * 0.6) return { column, kind: byContent, sensitive: true };
    const hint = headerHint(info.name);
    if (hint) return { column, kind: hint[0], sensitive: hint[1] };
    return { column, kind: info.type === "date" ? "date" : "text", sensitive: false };
  });
}

// --- Chave -----------------------------------------------------------------------

// Chave aleatória por execução: os códigos não se repetem entre arquivos e não dá para
// testar todos os CPFs possíveis para descobrir o original.
export function randomKey(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

const PASSWORD_ROUNDS = 50_000;

// Chave derivada de uma senha: a mesma senha gera os mesmos códigos em outros arquivos.
// As rodadas encarecem a tentativa de adivinhar senhas fracas.
export function keyFromPassword(password: string): string {
  let hash = sha256(`ajeita-csv/anonimizar\u0000${password}`);
  const mac = hmacSha256(password);
  for (let i = 0; i < PASSWORD_ROUNDS; i++) hash = mac(hash);
  return toHex(hash);
}

// --- Máscaras ----------------------------------------------------------------------

const hasPunctuation = (value: string) => /[.\-/()\s]/.test(value.trim());

export function maskGeneric(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => `${[...word][0] ?? ""}***`)
    .join(" ");
}

// Documento completo (11 ou 14 caracteres), com os zeros perdidos no Excel de volta.
function documentOf(value: string): { kind: "cpf" | "cnpj"; chars: string } | undefined {
  const chars = documentChars(value);
  if (/[A-Z]/.test(chars)) return chars.length === 14 ? { kind: "cnpj", chars } : undefined;
  if (chars.length === 0 || chars.length > 14) return undefined;
  if (chars.length <= 11 && (chars.length === 11 || isValidCpf(chars.padStart(11, "0")))) return { kind: "cpf", chars: chars.padStart(11, "0") };
  if (chars.length > 11 || isValidCnpj(chars.padStart(14, "0"))) return { kind: "cnpj", chars: chars.padStart(14, "0") };
  return undefined;
}

// CPF: mostra só os dígitos do meio (***.982.247-**), como nas publicações do governo.
function maskDocument(value: string): string | undefined {
  const doc = documentOf(value);
  if (!doc) return undefined;
  const hidden =
    doc.kind === "cpf"
      ? `***${doc.chars.slice(3, 9)}**`
      : `**${doc.chars.slice(2, 12)}**`;
  if (!hasPunctuation(value)) return hidden;
  return doc.kind === "cpf" ? maskCpf(hidden) : maskCnpj(hidden);
}

function maskEmail(value: string): string | undefined {
  const v = value.trim();
  if (!EMAIL.test(v)) return undefined;
  const at = v.lastIndexOf("@");
  return `${[...v][0]}***${v.slice(at)}`;
}

function maskPhone(value: string): string | undefined {
  const result = normalizePhone(value, { addNinthDigit: false });
  if (result.kind === "special") return value;
  if (result.kind !== "phone") return undefined;
  const ddd = result.digits.slice(0, 2);
  const number = result.digits.slice(2);
  const visible = number.length === 9 ? `${number[0]}****` : "****";
  return `(${ddd}) ${visible}-${number.slice(-4)}`;
}

function maskCep(value: string): string | undefined {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 7) digits = `0${digits}`;
  if (digits.length !== 8 || !/^[\d\s.-]+$/.test(value.trim())) return undefined;
  return `${digits.slice(0, 5)}-***`;
}

const ISO_DATE = /^(\d{4})-\d{1,2}-\d{1,2}/;
const SLASH_DATE = /^\d{1,2}\/\d{1,2}\/(\d{4})/;

// Data: fica só o ano (**/**/1987).
function maskDate(value: string): string | undefined {
  const v = value.trim();
  const iso = ISO_DATE.exec(v);
  if (iso) return `${iso[1]}-**-**`;
  const slash = SLASH_DATE.exec(v);
  if (slash) return `**/**/${slash[1]}`;
  return undefined;
}

const MASKS: Partial<Record<DataKind, (value: string) => string | undefined>> = {
  document: maskDocument,
  email: maskEmail,
  phone: maskPhone,
  cep: maskCep,
  date: maskDate,
};

export function maskValue(value: string, kind: DataKind): string {
  return MASKS[kind]?.(value) ?? maskGeneric(value);
}

// --- Dados falsos ---------------------------------------------------------------------

const FIRST_NAMES = [
  "Ana", "Bruno", "Camila", "Daniel", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João",
  "Juliana", "Lucas", "Mariana", "Mateus", "Natália", "Otávio", "Patrícia", "Rafael", "Sofia", "Thiago",
  "Vitória", "Gustavo", "Larissa", "Pedro", "Beatriz", "Carlos", "Fernanda", "Leonardo", "Renata", "Vinícius",
];
const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes",
  "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa",
  "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes", "Marques", "Machado", "Mendes", "Freitas",
];

// Fonte de números a partir dos bytes do HMAC (32 bytes; se acabar, recomeça).
function reader(bytes: Uint8Array) {
  let i = 0;
  const next = () => bytes[i++ % bytes.length]!;
  return {
    digit: () => next() % 10,
    digits: (n: number) => Array.from({ length: n }, () => next() % 10).join(""),
    pick: <T>(list: readonly T[]) => list[(next() * 256 + next()) % list.length]!,
    between: (min: number, max: number) => min + (next() % (max - min + 1)),
  };
}

type Random = ReturnType<typeof reader>;

function fakeName(value: string, r: Random): string {
  const words = value.trim().split(/\s+/).length;
  const parts = [r.pick(FIRST_NAMES), r.pick(LAST_NAMES)];
  if (words >= 3) parts.push(r.pick(LAST_NAMES));
  return parts.join(" ");
}

function fakeDocument(value: string, r: Random): string | undefined {
  const doc = documentOf(value);
  if (!doc) return undefined;
  let chars: string;
  if (doc.kind === "cpf") {
    let base = r.digits(9);
    if (/^(\d)\1*$/.test(base)) base = `1${base.slice(1, 8)}2`;
    chars = base + cpfCheckDigits(base);
  } else {
    const base = `${r.digits(8)}0001`;
    chars = base + cnpjCheckDigits(base);
  }
  if (!hasPunctuation(value)) return chars;
  return doc.kind === "cpf" ? maskCpf(chars) : maskCnpj(chars);
}

function fakeEmail(value: string, r: Random): string | undefined {
  if (!EMAIL.test(value.trim())) return undefined;
  const user = removeAccents(`${r.pick(FIRST_NAMES)}.${r.pick(LAST_NAMES)}`).toLowerCase();
  // example.com é reservado para exemplos (RFC 2606): nunca é de alguém.
  return `${user}${r.digits(6)}@example.com`;
}

function fakePhone(value: string, r: Random): string | undefined {
  const result = normalizePhone(value, { addNinthDigit: false });
  if (result.kind === "special") return value;
  if (result.kind !== "phone") return undefined;
  const ddd = result.digits.slice(0, 2);
  const number = result.digits.length === 11 ? `9${r.between(6, 9)}${r.digits(7)}` : `${r.between(2, 5)}${r.digits(7)}`;
  const v = value.trim();
  const format = v.startsWith("+") ? "e164" : /[()\s-]/.test(v) ? "national" : "digits";
  return formatPhone(ddd + number, format);
}

function fakeCep(value: string, r: Random): string | undefined {
  if (!maskCep(value)) return undefined;
  const digits = `${r.between(1, 9)}${r.digits(7)}`;
  return value.includes("-") ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

// Data falsa no mesmo ano e no mesmo formato. Dia e mês até 12 valem em dd/mm e mm/dd.
function fakeDate(value: string, r: Random): string | undefined {
  const v = value.trim();
  const d = String(r.between(1, 12)).padStart(2, "0");
  const m = String(r.between(1, 12)).padStart(2, "0");
  const iso = ISO_DATE.exec(v);
  if (iso) return `${iso[1]}-${m}-${d}`;
  const slash = SLASH_DATE.exec(v);
  if (slash) return `${d}/${m}/${slash[1]}`;
  return undefined;
}

const FAKES: Partial<Record<DataKind, (value: string, r: Random) => string | undefined>> = {
  document: fakeDocument,
  email: fakeEmail,
  phone: fakePhone,
  cep: fakeCep,
  date: fakeDate,
  name: fakeName,
};

// Mesma pessoa, mesmo resultado: "529.982.247-25" e "52998224725" são o mesmo CPF.
function identity(value: string, kind: DataKind): string {
  const v = value.trim();
  switch (kind) {
    case "document":
      return documentOf(v)?.chars ?? v;
    case "phone": {
      const result = normalizePhone(v, { addNinthDigit: true });
      return result.kind === "phone" ? result.digits : v;
    }
    case "email":
      return v.toLowerCase();
    case "cep":
      return v.replace(/\D/g, "");
    default:
      return removeAccents(v).toLowerCase().replace(/\s+/g, " ");
  }
}

// --- Plano por coluna ---------------------------------------------------------------------

export type Anonymizer = (value: string) => string;

// Identificadores não podem repetir: dois CPFs diferentes virando o mesmo CPF falso
// juntariam pessoas diferentes. Nomes, datas e CEPs podem (e costumam) se repetir.
const UNIQUE_KINDS = new Set<DataKind>(["document", "email", "phone"]);

// Cria a função de uma coluna. `key` (hex) vem nos parâmetros da operação, para a prévia
// e o aplicar darem o mesmo resultado; `shared`: a chave veio de uma senha.
export function anonymizer(rule: AnonymizeRule, columnName: string, key: string, shared: boolean): Anonymizer {
  const { method, kind } = rule;
  if (method === "clear") return () => "";
  if (method === "mask") return (value) => maskValue(value, kind);

  const mac = hmacSha256(fromHex(key));
  const cache = new Map<string, string>();
  const label = columnName.trim() || "valor";

  if (method === "pseudonym") {
    // Sem senha: numeração na ordem em que aparecem. Com senha: código do HMAC, igual em
    // qualquer arquivo anonimizado com a mesma senha.
    let next = 0;
    return (value) => {
      const id = identity(value, kind);
      let code = cache.get(id);
      if (code === undefined) {
        code = shared
          ? `${label} ${toHex(mac(`${kind}\u0000${id}`)).slice(0, 12).toUpperCase()}`
          : `${label} ${String(++next).padStart(4, "0")}`;
        cache.set(id, code);
      }
      return code;
    };
  }

  const fake = FAKES[kind];
  // Sem gerador para o tipo (ou valor fora do formato): vira pseudônimo.
  const pseudonymOf = (value: string) => `${label} ${toHex(mac(`${kind}\u0000${identity(value, kind)}`)).slice(0, 12).toUpperCase()}`;
  // De quem é cada dado falso já usado (identificadores): a mesma pessoa reencontra o
  // seu, e outra pessoa que caísse nele tenta de novo com outra semente.
  const owners = UNIQUE_KINDS.has(kind) ? new Map<string, string>() : undefined;
  return (value) => {
    // Nomes, datas e CEPs se repetem muito: o mesmo texto dá sempre o mesmo resultado.
    if (!owners) {
      let result = cache.get(value);
      if (result === undefined) {
        result = fake?.(value, reader(mac(`${kind}\u00000\u0000${identity(value, kind)}`))) ?? pseudonymOf(value);
        cache.set(value, result);
      }
      return result;
    }
    const id = identity(value, kind);
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = fake?.(value, reader(mac(`${kind}\u0000${attempt}\u0000${id}`)));
      if (candidate === undefined) break;
      if (!owners) return candidate;
      const owner = owners.get(candidate);
      if (owner === undefined || owner === id) {
        owners.set(candidate, id);
        return candidate;
      }
    }
    return pseudonymOf(value);
  };
}
