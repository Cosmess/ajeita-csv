import type { ColumnSummary as Summary } from "../../core/inspect/summary";
import { FORMAT_LABELS, TYPE_LABELS, formatCount } from "../labels";

type Props = {
  summary?: Summary;
  loading: boolean;
  filtered: boolean;
  onFilterValue: (column: number, value: string) => void;
  onClose: () => void;
};

export function ColumnSummary({ summary, loading, filtered, onFilterValue, onClose }: Props) {
  return (
    <aside className="drawer" aria-label="Resumo da coluna">
      <header className="drawer-header">
        <strong>{summary ? `Resumo: ${summary.name}` : "Resumo da coluna"}</strong>
        <button type="button" className="grid-icon" aria-label="Fechar resumo" onClick={onClose}>
          ×
        </button>
      </header>
      {loading || !summary ? (
        <p className="muted">Calculando…</p>
      ) : (
        <>
          {filtered && <p className="muted small">Considerando só as linhas que passam pelos filtros.</p>}
          <dl className="stats">
            <dt>Tipo</dt>
            <dd>
              {TYPE_LABELS[summary.type]}
              {summary.format ? `, ${FORMAT_LABELS[summary.format] ?? summary.format}` : ""}
            </dd>
            <dt>Linhas</dt>
            <dd>{formatCount(summary.total)}</dd>
            <dt>Vazias</dt>
            <dd>{formatCount(summary.empty)}</dd>
            <dt>Valores únicos</dt>
            <dd>{formatCount(summary.unique)}</dd>
            {summary.min !== undefined && (
              <>
                <dt>Mínimo</dt>
                <dd>{summary.min}</dd>
                <dt>Máximo</dt>
                <dd>{summary.max}</dd>
              </>
            )}
            {summary.sum !== undefined && (
              <>
                <dt>Soma</dt>
                <dd>{summary.sum}</dd>
                <dt>Média</dt>
                <dd>{summary.mean}</dd>
              </>
            )}
          </dl>
          {summary.numeric !== undefined && summary.numeric < summary.total - summary.empty && (
            <p className="muted small">
              Soma e média usam os {formatCount(summary.numeric)} valores que são números; os outros{" "}
              {formatCount(summary.total - summary.empty - summary.numeric)} ficam de fora.
            </p>
          )}
          {summary.top.length > 0 && (
            <>
              <p className="drawer-subtitle">Mais frequentes (clique para filtrar)</p>
              <ol className="top-values">
                {summary.top.map((item) => (
                  <li key={item.value}>
                    <button type="button" onClick={() => onFilterValue(summary.column, item.value)} title={item.value}>
                      <span className="top-value">{item.value}</span>
                      <span className="top-count">{formatCount(item.count)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </aside>
  );
}
