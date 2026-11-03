import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import type { Column } from "../../core/dataset";
import { normalizeText } from "../../core/inspect/normalize";
import type { Filter, SortKey } from "../../core/inspect/view";
import { useRowCache } from "../hooks/useRowCache";
import { formatCount } from "../labels";

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 34;
const MIN_WIDTH = 72;
const MAX_WIDTH = 320;
const CHAR_WIDTH = 7.5;

export type GridProps = {
  columns: Column[];
  viewVersion: number;
  viewCount: number;
  sort: SortKey[];
  filters: Filter[];
  searchQuery: string;
  currentMatch?: { position: number; column: number };
  onSort: (column: number, additive: boolean) => void;
  onFilter: (column: number) => void;
  onSummary: (column: number) => void;
};

function columnWidth(name: string, sample: readonly (readonly string[])[], index: number): number {
  let chars = name.length + 4; // espaço para os botões do cabeçalho
  for (const row of sample) chars = Math.max(chars, Math.min((row[index] ?? "").length, 40));
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, chars * CHAR_WIDTH + 20)));
}

export function Grid(props: GridProps) {
  const { columns, viewVersion, viewCount, sort, filters, searchQuery, currentMatch } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ensure, getRow } = useRowCache(viewVersion, viewCount);

  // Largura da coluna de numeração conforme o número de dígitos.
  const rowNumberWidth = Math.max(44, String(viewCount).length * 8 + 20);

  // Larguras calculadas com as primeiras linhas carregadas e fixadas depois disso:
  // a grade não "pula" na rolagem nem encolhe quando a ordenação recarrega as linhas.
  const firstRows = getRow(0) ? Array.from({ length: Math.min(100, viewCount) }, (_, i) => getRow(i)?.cells ?? []) : [];
  const sampleReady = firstRows.length > 0;
  const lockedWidths = useRef<number[] | null>(null);
  const widths = useMemo(() => {
    if (lockedWidths.current) return lockedWidths.current;
    const computed = columns.map((column, i) => columnWidth(column.name, firstRows, i));
    if (sampleReady) lockedWidths.current = computed;
    return computed;
    // firstRows muda a cada render; só interessa quando a amostra fica pronta.
  }, [columns, sampleReady]);

  const rowVirtualizer = useVirtualizer({
    count: viewCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollPaddingStart: HEADER_HEIGHT,
  });
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => widths[i] ?? MIN_WIDTH,
    overscan: 4,
    scrollPaddingStart: rowNumberWidth,
  });

  useEffect(() => columnVirtualizer.measure(), [widths, columnVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const firstVisible = virtualRows[0]?.index ?? 0;
  const lastVisible = virtualRows.at(-1)?.index ?? 0;

  useEffect(() => {
    if (viewCount > 0) ensure(firstVisible, lastVisible + 1);
  }, [ensure, firstVisible, lastVisible, viewCount, viewVersion]);

  useEffect(() => {
    if (!currentMatch) return;
    rowVirtualizer.scrollToIndex(currentMatch.position, { align: "center" });
    columnVirtualizer.scrollToIndex(currentMatch.column, { align: "auto" });
  }, [currentMatch, rowVirtualizer, columnVirtualizer]);

  const needle = normalizeText(searchQuery.trim());
  const totalWidth = columnVirtualizer.getTotalSize() + rowNumberWidth;

  const sortInfo = (column: number) => {
    const position = sort.findIndex((key) => key.column === column);
    return position < 0 ? undefined : { direction: sort[position]!.direction, order: position + 1 };
  };

  return (
    <div ref={scrollRef} className="grid-scroll" role="grid" aria-rowcount={viewCount + 1} aria-colcount={columns.length}>
      <div style={{ height: rowVirtualizer.getTotalSize() + HEADER_HEIGHT, width: totalWidth, position: "relative" }}>
        <div className="grid-header" style={{ height: HEADER_HEIGHT, width: totalWidth }} role="row">
          <div className="grid-corner" style={{ width: rowNumberWidth }} />
          {virtualColumns.map((vc) => {
            const column = columns[vc.index]!;
            const sorted = sortInfo(vc.index);
            const filtered = filters.some((f) => f.column === vc.index);
            return (
              <div
                key={vc.key}
                className="grid-header-cell"
                role="columnheader"
                aria-sort={sorted ? (sorted.direction === "asc" ? "ascending" : "descending") : "none"}
                style={{ left: rowNumberWidth + vc.start, width: vc.size, height: HEADER_HEIGHT }}
              >
                <button
                  type="button"
                  className="grid-sort"
                  title="Clique para ordenar. Shift + clique para ordenar por mais de uma coluna."
                  onClick={(event: MouseEvent) => props.onSort(vc.index, event.shiftKey)}
                >
                  <span className="grid-header-name">{column.name}</span>
                  {sorted && (
                    <span className="grid-sort-indicator">
                      {sorted.direction === "asc" ? "▲" : "▼"}
                      {sort.length > 1 ? sorted.order : ""}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`grid-icon${filtered ? " active" : ""}`}
                  title={`Filtrar "${column.name}"`}
                  aria-label={`Filtrar ${column.name}`}
                  onClick={() => props.onFilter(vc.index)}
                >
                  ⏷
                </button>
                <button
                  type="button"
                  className="grid-icon"
                  title={`Resumo de "${column.name}"`}
                  aria-label={`Resumo de ${column.name}`}
                  onClick={() => props.onSummary(vc.index)}
                >
                  Σ
                </button>
              </div>
            );
          })}
        </div>

        {virtualRows.map((vr) => {
          const row = getRow(vr.index);
          return (
            <div
              key={vr.key}
              className="grid-row"
              role="row"
              style={{ top: HEADER_HEIGHT + vr.start, height: vr.size, width: totalWidth }}
            >
              <div className="grid-row-number" style={{ width: rowNumberWidth }} title="Número da linha nos dados">
                {row ? formatCount(row.index + 1) : ""}
              </div>
              {virtualColumns.map((vc) => {
                const value = row?.cells[vc.index] ?? "";
                const isCurrent = currentMatch?.position === vr.index && currentMatch.column === vc.index;
                const isMatch = needle !== "" && value !== "" && normalizeText(value).includes(needle);
                const className = `grid-cell${isCurrent ? " match-current" : isMatch ? " match" : ""}${row ? "" : " loading"}`;
                return (
                  <div
                    key={vc.key}
                    className={className}
                    role="gridcell"
                    title={value.length > 20 ? value : undefined}
                    style={{ left: rowNumberWidth + vc.start, width: vc.size, height: vr.size }}
                  >
                    {value}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
