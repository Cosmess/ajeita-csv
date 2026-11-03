// Texto selecionado na página → linhas e colunas.
// Separador: tabulação (cópia de tabelas), ";" ou dois ou mais espaços (texto alinhado).

export type TextSeparator = "\t" | ";" | "spaces" | "none";

export function detectTextSeparator(lines: readonly string[]): TextSeparator {
  const share = (test: (line: string) => boolean) => lines.filter(test).length / Math.max(1, lines.length);
  if (share((l) => l.includes("\t")) >= 0.5) return "\t";
  if (share((l) => l.includes(";")) >= 0.8) return ";";
  if (share((l) => / {2,}/.test(l.trim())) >= 0.5) return "spaces";
  return "none";
}

export function rowsFromText(text: string): string[][] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim() !== "");
  const separator = detectTextSeparator(lines);
  return lines.map((line) => {
    if (separator === "none") return [line.trim()];
    const cells = separator === "spaces" ? line.trim().split(/ {2,}/) : line.split(separator);
    return cells.map((cell) => cell.trim());
  });
}
