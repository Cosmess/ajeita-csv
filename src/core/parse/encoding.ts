import type { Encoding } from "../dataset";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

export function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
}

export type DetectedEncoding = { encoding: Encoding; hasBom: boolean };

// UTF-8 válido é UTF-8; qualquer outra coisa é tratada como Windows-1252,
// que é o que o Excel e sistemas legados brasileiros costumam gerar.
export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  if (hasUtf8Bom(bytes)) return { encoding: "utf-8", hasBom: true };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoding: "utf-8", hasBom: false };
  } catch {
    return { encoding: "windows-1252", hasBom: false };
  }
}

export function decodeBytes(bytes: Uint8Array, encoding: Encoding): string {
  const body = encoding === "utf-8" && hasUtf8Bom(bytes) ? bytes.subarray(3) : bytes;
  // ignoreBOM: o BOM já foi tratado acima; não deixar o decoder removê-lo de novo.
  return new TextDecoder(encoding, { ignoreBOM: true }).decode(body);
}
