// JSON → linhas e colunas. Objetos aninhados viram colunas com ponto (endereco.cidade).
// Arrays: juntados com "|" ou, num campo escolhido, uma linha por item.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const ARRAY_SEPARATOR = "|";

const isObject = (value: Json): value is { [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function scalar(value: Json): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function parseJsonRecords(text: string): Json[] {
  let data: Json;
  try {
    data = JSON.parse(text) as Json;
  } catch (error) {
    throw new Error(`JSON inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Array.isArray(data)) return data;
  if (isObject(data)) return [data];
  throw new Error("O JSON precisa ser uma lista de objetos ou um objeto");
}

// Campos que são arrays (candidatos a "uma linha por item"), em ordem de aparição.
export function arrayFields(records: readonly Json[]): string[] {
  const found = new Set<string>();
  const visit = (value: Json, path: string) => {
    if (Array.isArray(value)) {
      if (path) found.add(path);
      return;
    }
    if (isObject(value)) for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
  };
  records.forEach((record) => visit(record, ""));
  return [...found];
}

// Achata um registro: { "a.b": "x", "tags": "1|2" }. Arrays de objetos viram uma coluna
// por campo, com os valores dos itens juntados: pedidos.numero = "P-001|P-002".
function flatten(value: Json, path: string, out: Map<string, string>): void {
  if (Array.isArray(value)) {
    if (value.some(isObject)) {
      const fields = new Map<string, string[]>();
      value.forEach((item, i) => {
        const inner = new Map<string, string>();
        if (isObject(item)) flatten(item, path, inner);
        else inner.set(path, scalar(item));
        for (const [key, v] of inner) {
          const list = fields.get(key) ?? [];
          list[i] = v;
          fields.set(key, list);
        }
      });
      for (const [key, list] of fields) {
        out.set(key, Array.from({ length: value.length }, (_, i) => list[i] ?? "").join(ARRAY_SEPARATOR));
      }
      if (value.length === 0) out.set(path, "");
      return;
    }
    out.set(path, value.map(scalar).join(ARRAY_SEPARATOR));
    return;
  }
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && path) out.set(path, "");
    for (const [key, child] of entries) flatten(child, path ? `${path}.${key}` : key, out);
    return;
  }
  out.set(path || "valor", scalar(value));
}

function getPath(record: Json, path: string): Json | undefined {
  let current: Json | undefined = record;
  for (const key of path.split(".")) {
    if (!current || !isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

// value undefined remove o campo (registro sem itens no campo escolhido).
function setPath(record: Json, path: string, value: Json | undefined): Json {
  if (!isObject(record)) return record;
  const [key, ...rest] = path.split(".");
  const next = { ...record };
  if (rest.length > 0) next[key!] = setPath(record[key!] ?? {}, rest.join("."), value);
  else if (value === undefined) delete next[key!];
  else next[key!] = value;
  return next;
}

export function jsonToRows(records: readonly Json[], explode?: string): string[][] {
  // Uma linha por item do campo escolhido; registro sem itens continua com uma linha.
  const expanded = explode
    ? records.flatMap((record) => {
        const items = getPath(record, explode);
        if (!Array.isArray(items) || items.length === 0) return [setPath(record, explode, undefined)];
        return items.map((item) => setPath(record, explode, item));
      })
    : records;

  const columns: string[] = [];
  const seen = new Set<string>();
  const flat = expanded.map((record) => {
    const out = new Map<string, string>();
    flatten(record, "", out);
    for (const key of out.keys()) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
    return out;
  });
  return [columns, ...flat.map((out) => columns.map((key) => out.get(key) ?? ""))];
}
