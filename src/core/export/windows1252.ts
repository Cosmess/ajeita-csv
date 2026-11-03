// Caracteres da faixa 0x80–0x9F do Windows-1252 que não coincidem com o Latin-1.
const EXTRA: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

// Bytes sem caractere definido; o TextDecoder os lê como o controle de mesmo código.
const UNDEFINED_BYTES = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

function byteFor(codePoint: number): number | undefined {
  if (codePoint < 0x80 || (codePoint >= 0xa0 && codePoint <= 0xff)) return codePoint;
  if (UNDEFINED_BYTES.has(codePoint)) return codePoint;
  return EXTRA.get(codePoint);
}

export type UnencodablePolicy = "replace" | "remove";

// Caracteres que não existem em Windows-1252, com quantas vezes aparecem.
export function findUnencodable(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) continue;
    const codePoint = text.codePointAt(i)!;
    if (codePoint > 0xffff) i++;
    if (byteFor(codePoint) === undefined) {
      const char = String.fromCodePoint(codePoint);
      found.set(char, (found.get(char) ?? 0) + 1);
    }
  }
  return found;
}

export function encodeWindows1252(text: string, policy: UnencodablePolicy = "replace"): Uint8Array {
  const out = new Uint8Array(text.length);
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      out[size++] = code;
      continue;
    }
    const codePoint = text.codePointAt(i)!;
    if (codePoint > 0xffff) i++;
    const byte = byteFor(codePoint);
    if (byte !== undefined) out[size++] = byte;
    else if (policy === "replace") out[size++] = 0x3f; // "?"
  }
  return out.slice(0, size);
}
