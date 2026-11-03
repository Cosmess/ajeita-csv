import { useState } from "react";
import type { MergeFileSummary } from "../../core/files/merge";
import { DELIMITER_LABELS, formatCount } from "../labels";
import { getWorkerClient } from "../worker";
import { ACCEPTED_EXTENSIONS } from "./FileDrop";

type Props = {
  replacing: boolean;
  onMerge: (files: File[], addSource: boolean) => void;
  onClose: () => void;
};

// Junta vários arquivos num só, alinhando as colunas pelo nome do cabeçalho.
export function MergeDialog({ replacing, onMerge, onClose }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [addSource, setAddSource] = useState(true);
  const [preview, setPreview] = useState<{ files: MergeFileSummary[]; columns: string[] }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function choose(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    setFiles(chosen);
    setPreview(undefined);
    setError(undefined);
    if (chosen.length < 2) {
      if (chosen.length === 1) setError("Escolha pelo menos 2 arquivos (segure ⌘ ou Ctrl para marcar vários).");
      return;
    }
    setLoading(true);
    try {
      setPreview(await getWorkerClient().request("previewMerge", { files: chosen }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const total = preview?.files.reduce((n, f) => n + f.rows, 0) ?? 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (preview) onMerge(files, addSource);
        }}
      >
        <h2 id="merge-title">Juntar arquivos</h2>
        <p className="muted small">
          Os arquivos ficam um embaixo do outro, com as colunas alinhadas pelo nome do cabeçalho. Cada arquivo tem encoding e
          separador detectados separadamente; colunas que faltam num arquivo ficam vazias nele.
        </p>
        <label>
          Arquivos
          <input type="file" multiple accept={ACCEPTED_EXTENSIONS.join(",")} onChange={(e) => void choose(e.target.files)} />
        </label>
        {loading && <p className="muted">Lendo os arquivos…</p>}
        {error && <p className="error">{error}</p>}
        {preview && (
          <>
            <div className="merge-table-scroll">
              <table className="merge-table">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Encoding</th>
                    <th>Separador</th>
                    <th>Linhas</th>
                    <th>Só neste arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.files.map((file) => (
                    <tr key={file.name}>
                      <td>{file.name}</td>
                      <td>{file.source === "csv" ? file.encoding : file.source}</td>
                      <td>{file.source === "csv" ? DELIMITER_LABELS[file.delimiter as keyof typeof DELIMITER_LABELS] : "—"}</td>
                      <td>{formatCount(file.rows)}</td>
                      <td>{file.onlyHere.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.files.some((f) => !f.hasHeader) && (
              <p className="muted small">
                Algum arquivo parece não ter cabeçalho: as colunas dele foram chamadas de "Coluna 1", "Coluna 2"… e só se
                alinham com outras de mesmo nome.
              </p>
            )}
            <p>
              Resultado: <strong>{formatCount(total)}</strong> linhas e <strong>{preview.columns.length + (addSource ? 1 : 0)}</strong>{" "}
              colunas.
            </p>
            <label className="checkbox">
              <input type="checkbox" checked={addSource} onChange={(e) => setAddSource(e.target.checked)} />
              Adicionar a coluna <code>arquivo_origem</code> com o nome do arquivo de cada linha
            </label>
            {replacing && <p className="muted small">O arquivo aberto será substituído pelo resultado (as alterações nele serão descartadas).</p>}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={!preview || loading}>
            Juntar
          </button>
        </div>
      </form>
    </div>
  );
}
