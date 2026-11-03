// Tabela HTML (já lida da página) → linhas e colunas, tratando colspan e rowspan.

export type TableCell = { text: string; colspan: number; rowspan: number; header: boolean };
export type TableModel = { rows: TableCell[][]; headerRows: number };

// Célula mesclada se repete em todas as posições que ocupa: em CSV não existe mescla,
// e repetir o valor mantém cada linha completa (ex.: "Sudeste" nas duas linhas da região).
export function expandTable(table: TableModel): string[][] {
  const grid: string[][] = [];
  table.rows.forEach((cells, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of cells) {
      while (grid[r]![c] !== undefined) c++;
      const colspan = Math.max(1, Math.min(cell.colspan, 1000));
      const rowspan = Math.max(1, Math.min(cell.rowspan, table.rows.length - r));
      for (let dr = 0; dr < rowspan; dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc++) grid[r + dr]![c + dc] = cell.text;
      }
      c += colspan;
    }
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  return grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));
}

// Cabeçalho em várias linhas vira uma só: "2025" sobre "1º semestre" → "2025 1º semestre".
export function tableToRows(table: TableModel): { rows: string[][]; hasHeader: boolean } {
  const grid = expandTable(table);
  const headerRows = Math.min(table.headerRows, grid.length);
  if (headerRows <= 1) return { rows: grid, hasHeader: headerRows === 1 };
  const width = grid[0]?.length ?? 0;
  const header = Array.from({ length: width }, (_, c) => {
    const parts: string[] = [];
    for (let r = 0; r < headerRows; r++) {
      const text = grid[r]![c]!.trim();
      if (text && parts.at(-1) !== text) parts.push(text);
    }
    return parts.join(" ");
  });
  return { rows: [header, ...grid.slice(headerRows)], hasHeader: true };
}
