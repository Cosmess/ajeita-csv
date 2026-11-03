import { useEffect, useState } from "react";
import type { Column } from "../../core/dataset";
import type { Filter, FilterOp } from "../../core/inspect/view";
import { FILTER_LABELS } from "../labels";

const NEEDS_VALUE: ReadonlySet<FilterOp> = new Set(["contains", "equals", "startsWith"]);

function describe(filter: Filter, columns: Column[]): string {
  const name = columns[filter.column]?.name ?? "?";
  const op = FILTER_LABELS[filter.op];
  return NEEDS_VALUE.has(filter.op) ? `${name} ${op} "${filter.value ?? ""}"` : `${name} ${op}`;
}

type EditorProps = {
  column: number;
  columns: Column[];
  current?: Filter;
  onApply: (filter: Filter) => void;
  onRemove: () => void;
  onClose: () => void;
};

// Edita o filtro de uma coluna. Cada coluna tem no máximo um filtro.
export function FilterEditor({ column, columns, current, onApply, onRemove, onClose }: EditorProps) {
  const [op, setOp] = useState<FilterOp>(current?.op ?? "contains");
  const [value, setValue] = useState(current?.value ?? "");
  useEffect(() => {
    setOp(current?.op ?? "contains");
    setValue(current?.value ?? "");
  }, [column, current]);

  const needsValue = NEEDS_VALUE.has(op);
  const apply = () => onApply({ column, op, value: needsValue ? value : undefined });

  return (
    <form
      className="filter-editor"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <span className="filter-column">{columns[column]?.name}</span>
      <select value={op} onChange={(e) => setOp(e.target.value as FilterOp)} aria-label="Condição">
        {Object.entries(FILTER_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {needsValue && (
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="valor" aria-label="Valor" />
      )}
      <button type="submit" className="button primary">
        Filtrar
      </button>
      {current && (
        <button type="button" className="button" onClick={onRemove}>
          Remover
        </button>
      )}
      <button type="button" className="button link" onClick={onClose}>
        Fechar
      </button>
    </form>
  );
}

export function ActiveFilters(props: { filters: Filter[]; columns: Column[]; onRemove: (column: number) => void; onClear: () => void }) {
  if (props.filters.length === 0) return null;
  return (
    <div className="active-filters">
      {props.filters.map((filter) => (
        <span key={filter.column} className="chip">
          {describe(filter, props.columns)}
          <button type="button" aria-label="Remover filtro" onClick={() => props.onRemove(filter.column)}>
            ×
          </button>
        </span>
      ))}
      {props.filters.length > 1 && (
        <button type="button" className="button link" onClick={props.onClear}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}
