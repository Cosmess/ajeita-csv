import type { Dataset } from "../dataset";
import { encodeWindows1252, findUnencodable } from "../export/windows1252";

// Início de uma sequência UTF-8 (Â…ô) seguido de um byte de continuação lido como
// Windows-1252 (0x80–0xBF). É o rastro de UTF-8 aberto como Windows-1252: "Ã£", "Ã©", "â€™".
const SUSPECT =
  /[Â-ô][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-‚“-„†-•…‰‹›€™]/;

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function looksLikeMojibake(value: string): boolean {
  return SUSPECT.test(value);
}

// Volta o texto para os bytes Windows-1252 e lê de novo como UTF-8. Repete se o
// texto foi estragado mais de uma vez. Devolve undefined se não der para corrigir.
export function fixMojibake(value: string): string | undefined {
  let current = value;
  for (let pass = 0; pass < 3 && SUSPECT.test(current); pass++) {
    if (findUnencodable(current).size > 0) break;
    try {
      current = utf8.decode(encodeWindows1252(current));
    } catch {
      break;
    }
  }
  return current === value ? undefined : current;
}

export function countMojibakeCells(dataset: Dataset): number {
  let count = 0;
  for (const row of dataset.rows) for (const cell of row) if (SUSPECT.test(cell)) count++;
  return count;
}
