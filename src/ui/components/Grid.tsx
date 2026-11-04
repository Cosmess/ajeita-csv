import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type React from "react";
import type { Column } from "../../core/dataset";
import { parseChanges } from "../../core/files/compare";
import { normalizeText } from "../../core/inspect/normalize";
import type { Filter, SortKey } from "../../core/inspect/view";
import { isValid, RULE_LABELS, type ValidationRule } from "../../core/validate";
import { useRowCache } from "../hooks/useRowCache";
import { formatCount } from "../labels";

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 34;
const MIN_WIDTH = 72;
const MAX_WIDTH = 320;
const CHAR_WIDTH = 7.5;
// Tipo do arrasto de colunas, para não confundir com arquivos soltos no painel.
const COLUMN_DRAG = "application/x-ajeita-column";

export type GridProps = {
  columns: Column[];
  viewVersion: number;
  viewCount: number;
  sort: SortKey[];
  filters: Filter[];
  searchQuery: string;
  currentMatch?: { position: number; column: number };
  // Linha a destacar e trazer para a tela (ex.: "ir para a linha" do painel de problemas).
  focus?: { position: number; key: number };
  readOnly: boolean;
  // Validação ativa por coluna e quantos inválidos cada uma tem.
  validations: Partial<Record<number, ValidationRule>>;
  invalidCounts: Partial<Record<number, number>>;
  // Resultado de "Comparar": colunas de situação e de alterações, para destacar as células que mudaram.
  comparison?: { status: number; changes: number };
  onSort: (column: number, additive: boolean) => void;
  onFilter: (column: number) => void;
  onFilterInvalid: (column: number) => void;
  onColumnMenu: (column: number, anchor: { left: number; top: number }) => void;
  onMoveColumn: (from: number, to: number) => void;
  // row: índice da linha nos dados (não a posição na tela).
  onEditCell: (row: number, column: number, value: string) => void;
  onPaste: (row: number, column: number, text: string) => void;
  onDeleteRow: (row: number) => void;
};

type Selected = { position: number; column: number };

type Editing = { position: number; column: number; row: number; value: string };

function columnWidth(name: string, sample: readonly (readonly string[])[], index: number): number {
  let chars = name.length + 4; // espaço para os botões do cabeçalho
  for (const row of sample) chars = Math.max(chars, Math.min((row[index] ?? "").length, 40));
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, chars * CHAR_WIDTH + 20)));
}

export function Grid(props: GridProps) {
  const { columns, viewVersion, viewCount, sort, filters, searchQuery, currentMatch, focus, validations, invalidCounts, comparison } = props;
  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);
  const [dropTarget, setDropTarget] = useState<number>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Editing>();
  const [selected, setSelected] = useState<Selected>();

  // Qualquer mudança nos dados cancela a edição em andamento.
  useEffect(() => setEditing(undefined), [viewVersion]);

  const startEditing = (position: number, column: number) => {
    const row = getRow(position);
    if (row && !props.readOnly) setEditing({ position, column, row: row.index, value: row.cells[column] ?? "" });
  };

  // Teclado com uma célula selecionada: setas movem, Enter edita, Delete apaga.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected || editing || e.target !== scrollRef.current) return;
    const move = (position: number, column: number) => {
      e.preventDefault();
      const next = {
        position: Math.max(0, Math.min(viewCount - 1, position)),
        column: Math.max(0, Math.min(columns.length - 1, column)),
      };
      setSelected(next);
      rowVirtualizer.scrollToIndex(next.position, { align: "auto" });
      columnVirtualizer.scrollToIndex(next.column, { align: "auto" });
    };
    if (e.key === "ArrowDown") move(selected.position + 1, selected.column);
    else if (e.key === "ArrowUp") move(selected.position - 1, selected.column);
    else if (e.key === "ArrowRight" || e.key === "Tab") move(selected.position, selected.column + 1);
    else if (e.key === "ArrowLeft") move(selected.position, selected.column - 1);
    else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEditing(selected.position, selected.column);
    } else if ((e.key === "Delete" || e.key === "Backspace") && !props.readOnly) {
      const row = getRow(selected.position);
      if (row && (row.cells[selected.column] ?? "") !== "") props.onEditCell(row.index, selected.column, "");
    }
  };

  // Colar (⌘V / Ctrl+V) a partir da célula selecionada.
  const onPaste = (e: React.ClipboardEvent) => {
    if (!selected || editing || props.readOnly) return;
    const row = getRow(selected.position);
    const text = e.clipboardData.getData("text/plain");
    if (!row || !text) return;
    e.preventDefault();
    props.onPaste(row.index, selected.column, text);
  };

  const commit = () => {
    if (!editing) return;
    const original = getRow(editing.position)?.cells[editing.column] ?? "";
    if (editing.value !== original) props.onEditCell(editing.row, editing.column, editing.value);
    setEditing(undefined);
  };
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

  useEffect(() => {
    if (focus) rowVirtualizer.scrollToIndex(focus.position, { align: "center" });
  }, [focus, rowVirtualizer]);

  const needle = normalizeText(searchQuery.trim());
  const totalWidth = columnVirtualizer.getTotalSize() + rowNumberWidth;

  const sortInfo = (column: number) => {
    const position = sort.findIndex((key) => key.column === column);
    return position < 0 ? undefined : { direction: sort[position]!.direction, order: position + 1 };
  };

  return (
    <div
      ref={scrollRef}
      className="grid-scroll"
      role="grid"
      tabIndex={0}
      aria-rowcount={viewCount + 1}
      aria-colcount={columns.length}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      <div style={{ height: rowVirtualizer.getTotalSize() + HEADER_HEIGHT, width: totalWidth, position: "relative" }}>
        <div className="grid-header" style={{ height: HEADER_HEIGHT, width: totalWidth }} role="row">
          <div className="grid-corner" style={{ width: rowNumberWidth }} />
          {virtualColumns.map((vc) => {
            const column = columns[vc.index]!;
            const sorted = sortInfo(vc.index);
            const filtered = filters.some((f) => f.column === vc.index);
            const rule = validations[vc.index];
            const invalid = invalidCounts[vc.index] ?? 0;
            return (
              <div
                key={vc.key}
                className={`grid-header-cell${dropTarget === vc.index ? " drop-target" : ""}`}
                role="columnheader"
                aria-sort={sorted ? (sorted.direction === "asc" ? "ascending" : "descending") : "none"}
                style={{ left: rowNumberWidth + vc.start, width: vc.size, height: HEADER_HEIGHT }}
                draggable={!props.readOnly}
                title="Arraste para mudar a coluna de lugar"
                onDragStart={(e) => {
                  e.dataTransfer.setData(COLUMN_DRAG, String(vc.index));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(COLUMN_DRAG)) return;
                  e.preventDefault();
                  setDropTarget(vc.index);
                }}
                onDragLeave={() => setDropTarget(undefined)}
                onDrop={(e) => {
                  const from = Number(e.dataTransfer.getData(COLUMN_DRAG));
                  setDropTarget(undefined);
                  if (!e.dataTransfer.types.includes(COLUMN_DRAG)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (from !== vc.index) props.onMoveColumn(from, vc.index);
                }}
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
                {rule && (
                  <button
                    type="button"
                    className={`grid-badge${invalid > 0 ? " bad" : ""}`}
                    title={
                      invalid > 0
                        ? `${formatCount(invalid)} inválidos (${RULE_LABELS[rule]}). Clique para ver só eles.`
                        : `Todos válidos (${RULE_LABELS[rule]})`
                    }
                    onClick={() => invalid > 0 && props.onFilterInvalid(vc.index)}
                  >
                    {invalid > 0 ? `✗ ${formatCount(invalid)}` : "✓"}
                  </button>
                )}
                <button
                  type="button"
                  className="grid-icon"
                  title={`Opções de "${column.name}"`}
                  aria-label={`Opções de ${column.name}`}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    props.onColumnMenu(vc.index, { left: rect.right - 220, top: rect.bottom + 4 });
                  }}
                >
                  ⋯
                </button>
              </div>
            );
          })}
        </div>

        {virtualRows.map((vr) => {
          const row = getRow(vr.index);
          // Valores antigos das células alteradas, lidos da coluna "alterações" da linha.
          const changed = comparison && row ? parseChanges(row.cells[comparison.changes] ?? "", columnNames) : undefined;
          return (
            <div
              key={vr.key}
              className={`grid-row${focus?.position === vr.index ? " focused" : ""}`}
              role="row"
              style={{ top: HEADER_HEIGHT + vr.start, height: vr.size, width: totalWidth }}
            >
              <div className="grid-row-number" style={{ width: rowNumberWidth }} title="Número da linha nos dados">
                {row && !props.readOnly && (
                  <button
                    type="button"
                    className="row-delete"
                    aria-label={`Excluir linha ${row.index + 1}`}
                    title="Excluir linha"
                    onClick={() => props.onDeleteRow(row.index)}
                  >
                    ×
                  </button>
                )}
                {row ? formatCount(row.index + 1) : ""}
              </div>
              {virtualColumns.map((vc) => {
                const value = row?.cells[vc.index] ?? "";
                const isCurrent = currentMatch?.position === vr.index && currentMatch.column === vc.index;
                const isMatch = needle !== "" && value !== "" && normalizeText(value).includes(needle);
                const rule = validations[vc.index];
                const isInvalid = row !== undefined && rule !== undefined && !isValid(rule, value);
                const isSelected = selected?.position === vr.index && selected.column === vc.index;
                const before = changed?.get(columns[vc.index]?.name ?? "");
                const status = comparison?.status === vc.index && value ? ` status-${normalizeText(value)}` : "";
                const className = `grid-cell${isCurrent ? " match-current" : isMatch ? " match" : ""}${isInvalid ? " invalid" : ""}${isSelected ? " selected" : ""}${before !== undefined ? " diff-changed" : ""}${status}${row ? "" : " loading"}`;
                const style = { left: rowNumberWidth + vc.start, width: vc.size, height: vr.size };
                if (editing && editing.position === vr.index && editing.column === vc.index) {
                  return (
                    <input
                      key={vc.key}
                      className="grid-cell grid-editor"
                      style={style}
                      autoFocus
                      value={editing.value}
                      aria-label={`Editar ${columns[vc.index]?.name ?? ""}, linha ${(row?.index ?? 0) + 1}`}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onBlur={commit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commit();
                          scrollRef.current?.focus();
                        }
                        if (e.key === "Escape") {
                          setEditing(undefined);
                          scrollRef.current?.focus();
                        }
                      }}
                    />
                  );
                }
                return (
                  <div
                    key={vc.key}
                    className={className}
                    role="gridcell"
                    title={
                      before !== undefined
                        ? `Antes: ${before || "(vazio)"}`
                        : value.length > 20
                          ? value
                          : props.readOnly
                            ? undefined
                            : "Clique duas vezes para editar"
                    }
                    style={style}
                    onClick={() => {
                      setSelected({ position: vr.index, column: vc.index });
                      scrollRef.current?.focus({ preventScroll: true });
                    }}
                    onDoubleClick={() => startEditing(vr.index, vc.index)}
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
