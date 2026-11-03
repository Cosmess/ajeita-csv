import { looksNumericOrDate } from "./values";

const SAMPLE_ROWS = 50;
const MIN_DATA_SHARE = 0.8;

// A primeira linha é considerada dado (e não cabeçalho) quando tem um número ou
// data numa coluna em que as linhas seguintes também têm números ou datas.
// Se todas as colunas forem texto, não há como distinguir: assume cabeçalho,
// que é o caso mais comum.
export function detectHeader(rows: readonly (readonly string[])[]): boolean {
  const [first, ...others] = rows;
  if (!first || others.length === 0) return true;
  const rest = others.slice(0, SAMPLE_ROWS);

  for (let col = 0; col < first.length; col++) {
    const value = first[col] ?? "";
    if (value.trim() === "" || !looksNumericOrDate(value)) continue;
    const below = rest.map((row) => row[col] ?? "").filter((v) => v.trim() !== "");
    if (below.length === 0) continue;
    const share = below.filter(looksNumericOrDate).length / below.length;
    if (share >= MIN_DATA_SHARE) return false;
  }
  return true;
}
