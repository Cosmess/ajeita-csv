import Papa from "papaparse";
import { DELIMITERS, type Delimiter } from "../dataset";

const SAMPLE_LINES = 50;

type Score = { delimiter: Delimiter; consistency: number; columns: number };

function score(sample: string, delimiter: Delimiter): Score {
  const { data } = Papa.parse<string[]>(sample, { delimiter, preview: SAMPLE_LINES, skipEmptyLines: true });
  const counts = new Map<number, number>();
  for (const row of data) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  let columns = 1;
  let frequency = 0;
  for (const [cols, freq] of counts) {
    if (freq > frequency || (freq === frequency && cols > columns)) {
      columns = cols;
      frequency = freq;
    }
  }
  return { delimiter, consistency: data.length ? frequency / data.length : 0, columns };
}

// Escolhe o delimitador que produz o número de colunas mais consistente
// nas primeiras linhas, exigindo mais de uma coluna.
export function detectDelimiter(sample: string): Delimiter {
  let best: Score | undefined;
  for (const delimiter of DELIMITERS) {
    const current = score(sample, delimiter);
    if (current.columns <= 1) continue;
    if (
      !best ||
      current.consistency > best.consistency ||
      (current.consistency === best.consistency && current.columns > best.columns)
    ) {
      best = current;
    }
  }
  return best?.delimiter ?? ",";
}
