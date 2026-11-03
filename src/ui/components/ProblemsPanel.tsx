import { useEffect, useState } from "react";
import { PROBLEM_LABELS, type ProblemKind } from "../../core/fix/problems";
import type { DatasetInfo, ProblemItem } from "../../workers/protocol";
import { formatCount } from "../labels";
import { getWorkerClient } from "../worker";

const PAGE_SIZE = 100;

type Props = {
  info: DatasetInfo;
  busy: boolean;
  onGoToRow: (row: number) => void;
  onFixRow: (row: number) => void;
  onEditRow: (row: number, text: string) => void;
  onDeleteRow: (row: number) => void;
  onFixAll: () => void;
  onClose: () => void;
};

export function ProblemsPanel({ info, busy, onGoToRow, onFixRow, onEditRow, onDeleteRow, onFixAll, onClose }: Props) {
  const [items, setItems] = useState<ProblemItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<{ row: number; text: string }>();

  // Recarrega a lista a cada alteração nos dados.
  useEffect(() => {
    let cancelled = false;
    getWorkerClient()
      .request("getProblems", { offset: 0, limit })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setTotal(page.total);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [info.viewVersion, limit]);

  const kinds = (Object.keys(info.problems) as ProblemKind[]).filter((kind) => info.problems[kind] > 0);

  return (
    <aside className="drawer problems" aria-label="Problemas">
      <header className="drawer-header">
        <strong>Problemas ({formatCount(info.problemRows)})</strong>
        <button type="button" className="grid-icon" aria-label="Fechar problemas" onClick={onClose}>
          ×
        </button>
      </header>

      {info.problemRows === 0 ? (
        <p className="muted">Nenhum problema de estrutura encontrado.</p>
      ) : (
        <>
          <ul className="problem-kinds">
            {kinds.map((kind) => (
              <li key={kind}>
                {PROBLEM_LABELS[kind]}: <strong>{formatCount(info.problems[kind])}</strong>
              </li>
            ))}
          </ul>
          <button type="button" className="button primary" disabled={busy} onClick={onFixAll}>
            Corrigir todos automaticamente…
          </button>
          <p className="muted small">
            Linhas curtas são completadas com células vazias; o excedente de linhas longas vai para a última coluna;
            quebras de linha viram espaço; linhas juntadas por aspas não fechadas são separadas.
          </p>

          <ol className="problem-list">
            {items.map((item) => (
              <li key={item.row} className="problem">
                <div className="problem-head">
                  <button type="button" className="button link" onClick={() => onGoToRow(item.row)}>
                    Linha {formatCount(item.row + 1)}
                  </button>
                  <span className="small">{item.message}</span>
                </div>
                {editing?.row === item.row ? (
                  <form
                    className="problem-edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onEditRow(item.row, editing.text);
                      setEditing(undefined);
                    }}
                  >
                    <textarea
                      autoFocus
                      value={editing.text}
                      rows={Math.min(8, editing.text.split("\n").length + 1)}
                      onChange={(e) => setEditing({ row: item.row, text: e.target.value })}
                      aria-label={`Texto da linha ${item.row + 1}`}
                    />
                    <p className="muted small">
                      Separe os campos com {info.meta.delimiter === "\t" ? "tabulação" : `"${info.meta.delimiter}"`}. Cada
                      linha do texto vira uma linha nos dados; deixe vazio para excluir.
                    </p>
                    <div className="problem-actions">
                      <button type="submit" className="button primary" disabled={busy}>
                        Salvar
                      </button>
                      <button type="button" className="button" onClick={() => setEditing(undefined)}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <code className="problem-text" title={item.text}>
                      {item.text}
                    </code>
                    <div className="problem-actions">
                      <button type="button" className="button" disabled={busy} onClick={() => onFixRow(item.row)}>
                        Corrigir
                      </button>
                      <button type="button" className="button" onClick={() => setEditing({ row: item.row, text: item.text })}>
                        Editar
                      </button>
                      <button type="button" className="button" disabled={busy} onClick={() => onDeleteRow(item.row)}>
                        Excluir
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
          {total > items.length && (
            <button type="button" className="button" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              Mostrar mais ({formatCount(total - items.length)} restantes)
            </button>
          )}
        </>
      )}
    </aside>
  );
}
