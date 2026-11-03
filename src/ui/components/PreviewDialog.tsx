import type { Preview } from "../../core/preview";
import { formatCount } from "../labels";

// Destaca a parte que mudou: o que sobra depois de tirar o começo e o fim em comum.
function Diff({ before, after }: { before: string; after: string }) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  const part = (text: string, className: string) => (
    <span className={className}>
      {text.slice(0, start)}
      <mark>{text.slice(start, text.length - end)}</mark>
      {text.slice(text.length - end)}
    </span>
  );
  return (
    <div className="diff">
      {part(before, "diff-before")}
      <span className="diff-arrow" aria-hidden="true">
        →
      </span>
      {after === "" ? <span className="diff-after muted">(linha excluída)</span> : part(after, "diff-after")}
    </div>
  );
}

type Props = {
  preview?: Preview;
  error?: string;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
  onGoToRow: (row: number) => void;
};

// Formato padrão de prévia: totais, antes → depois das primeiras linhas e valores não reconhecidos.
export function PreviewDialog({ preview, error, applying, onApply, onCancel, onGoToRow }: Props) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <h2 id="preview-title">{preview?.label ?? "Prévia"}</h2>
        {error && <p className="error">{error}</p>}
        {!preview && !error && <p className="muted">Calculando a prévia…</p>}
        {preview && (
          <>
            <p className="preview-totals">
              <strong>{formatCount(preview.affectedRows)}</strong> {preview.affectedRows === 1 ? "linha afetada" : "linhas afetadas"} ·{" "}
              <strong>{formatCount(preview.changedCells)}</strong> {preview.changedCells === 1 ? "célula alterada" : "células alteradas"}
              {preview.unrecognizedTotal > 0 && (
                <>
                  {" "}
                  · <strong>{formatCount(preview.unrecognizedTotal)}</strong> não reconhecidos
                </>
              )}
            </p>
            {preview.samples.length > 0 && (
              <div className="preview-samples">
                {preview.samples.map((sample, i) => (
                  <div key={i} className="preview-sample">
                    <span className="preview-where muted small">
                      {sample.row < 0 ? "Cabeçalho" : `Linha ${formatCount(sample.row + 1)}`}
                      {sample.kind === "cell" ? ` · ${sample.column}` : ""}
                    </span>
                    <Diff before={sample.before} after={sample.after} />
                  </div>
                ))}
                {preview.affectedRows > 20 && (
                  <p className="muted small">Mostrando as primeiras 20 linhas afetadas.</p>
                )}
              </div>
            )}
            {preview.unrecognized.length > 0 && (
              <div className="preview-unrecognized">
                <p>
                  <strong>Não reconhecidos</strong> <span className="muted small">(ficam como estão)</span>
                </p>
                <ul>
                  {preview.unrecognized.map((item) => (
                    <li key={item.value}>
                      <button type="button" className="button link" onClick={() => onGoToRow(item.row)}>
                        {item.value}
                      </button>
                      <span className="muted small">
                        {" "}
                        {formatCount(item.count)}×{item.reason ? ` — ${item.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.affectedRows === 0 && preview.changedCells === 0 && <p className="muted">Nada a alterar.</p>}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!preview || (preview.affectedRows === 0 && preview.changedCells === 0) || applying}
            onClick={onApply}
          >
            {applying ? "Aplicando…" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
