// Limpeza de texto.

export function collapseSpaces(value: string): string {
  return value.replace(/[ \t ]+/g, " ").trim();
}

export function removeAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

// Palavras que ficam em minúsculas no meio de nomes: "Maria da Silva", "Pedro e Paulo".
const LOWER_WORDS = new Set(["da", "das", "de", "do", "dos", "e", "di", "du", "del", "van", "von"]);

export type CaseMode = "upper" | "lower" | "title";

export function changeCase(value: string, mode: CaseMode): string {
  if (mode === "upper") return value.toLocaleUpperCase("pt-BR");
  if (mode === "lower") return value.toLocaleLowerCase("pt-BR");
  let first = true;
  return value.toLocaleLowerCase("pt-BR").replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu, (word) => {
    const keepLower = !first && LOWER_WORDS.has(word);
    first = false;
    return keepLower ? word : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
  });
}
