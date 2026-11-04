import { useState } from "react";
import type { CompareOptions } from "../../core/files/compare";
import type { ComparePreview } from "../../workers/protocol";
import { DELIMITER_LABELS, formatCount } from "../labels";
import { getWorkerClient } from "../worker";
import { ACCEPTED_EXTENSIONS } from "./FileDrop";

type Props = {
  // Nome do arquivo aberto: ele é o "antes". Sem arquivo aberto, escolhe-se os dois.
  current?: string;
  replacing: boolean;
  onCompare: (before: File | undefined, after: File, options: CompareOptions) => void;
  onClose: () => void;
};

// Compara duas versões de uma planilha: o resultado abre como uma planilha nova, com as
// colunas "situação" (Novo, Removido, Alterado, Igual) e "alterações".
export function CompareDialog({ current, replacing, onCompare, onClose }: Props) {
  const [before, setBefore] = useState<File>();
  const [after, setAfter] = useState<File>();
  const [preview, setPreview] = useState<ComparePreview>();
  const [keys, setKeys] = useState<string[]>([]);
  const [byValue, setByValue] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [includeSame, setIncludeSame] = useState(true);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function load(nextBefore: File | undefined, nextAfter: File | undefined) {
    setPreview(undefined);
    setError(undefined);
    if (!nextAfter || (!current && !nextBefore)) return;
    setLoading(true);
    try {
      const result = await getWorkerClient().request("previewCompare", { before: current ? undefined : nextBefore, after: nextAfter });
      setPreview(result);
      setKeys(result.suggestedKey ? [result.suggestedKey] : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const pick = (list: FileList | null) => list?.[0];
  const toggleKey = (name: string) =>
    setKeys((selected) => (selected.includes(name) ? selected.filter((k) => k !== name) : [...selected, name]));

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (preview && after) onCompare(current ? undefined : before, after, { keys, byValue, ignoreCase, includeSame });
        }}
      >
        <h2 id="compare-title">Comparar duas planilhas</h2>
        <p className="muted small">
          Mostra o que entrou, saiu e mudou entre duas versões de um arquivo. Cada arquivo tem encoding e separador detectados
          separadamente, e as colunas são alinhadas pelo nome do cabeçalho.
        </p>
        {current ? (
          <p className="small">
            Antes: <strong>{current}</strong> (o arquivo aberto)
          </p>
        ) : (
          <label>
            Antes (versão antiga)
            <input
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={(e) => {
                const file = pick(e.target.files);
                setBefore(file);
                void load(file, after);
              }}
            />
          </label>
        )}
        <label>
          Depois (versão nova)
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            onChange={(e) => {
              const file = pick(e.target.files);
              setAfter(file);
              void load(before, file);
            }}
          />
        </label>
        {loading && <p className="muted">Lendo os arquivos…</p>}
        {error && <p className="error">{error}</p>}
        {preview && (
          <>
            <div className="merge-table-scroll">
              <table className="merge-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Arquivo</th>
                    <th>Encoding</th>
                    <th>Separador</th>
                    <th>Linhas</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.files.map((file, i) => (
                    <tr key={i}>
                      <td>{i === 0 ? "Antes" : "Depois"}</td>
                      <td>{file.name}</td>
                      <td>{file.source === "csv" ? file.encoding : file.source}</td>
                      <td>{file.source === "csv" ? DELIMITER_LABELS[file.delimiter as keyof typeof DELIMITER_LABELS] : "—"}</td>
                      <td>{formatCount(file.rows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(preview.columns.onlyBefore.length > 0 || preview.columns.onlyAfter.length > 0) && (
              <p className="muted small">
                {preview.columns.onlyBefore.length > 0 && <>Só no antes: {preview.columns.onlyBefore.join(", ")}. </>}
                {preview.columns.onlyAfter.length > 0 && <>Só no depois: {preview.columns.onlyAfter.join(", ")}. </>}
                Essas colunas aparecem no resultado, mas não são comparadas.
              </p>
            )}
            {preview.columns.common.length === 0 ? (
              <p className="error">Os arquivos não têm nenhuma coluna com o mesmo nome.</p>
            ) : (
              <fieldset className="column-picker">
                <legend>Coluna-chave (identifica a mesma linha nos dois arquivos)</legend>
                <div className="column-picker-list">
                  {preview.columns.common.map((name) => (
                    <label key={name} className="checkbox">
                      <input type="checkbox" checked={keys.includes(name)} onChange={() => toggleKey(name)} />
                      {name}
                      {name === preview.suggestedKey && <span className="muted small"> (sugerida)</span>}
                    </label>
                  ))}
                </div>
                <p className="muted small">
                  {keys.length === 0
                    ? "Nenhuma marcada: compara linha a linha, pela posição."
                    : "Use uma coluna sem repetições, como código, CPF ou e-mail. Pode marcar mais de uma."}
                </p>
              </fieldset>
            )}
            <label className="checkbox">
              <input type="checkbox" checked={byValue} onChange={(e) => setByValue(e.target.checked)} />
              Comparar números, datas e documentos pelo valor (1.234,56 = 1234.56; CPF com e sem máscara)
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} />
              Ignorar maiúsculas, acentos e espaços extras
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={includeSame} onChange={(e) => setIncludeSame(e.target.checked)} />
              Incluir no resultado as linhas que não mudaram
            </label>
            {replacing && <p className="muted small">O arquivo aberto será substituído pelo resultado (as alterações nele serão descartadas).</p>}
          </>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              void getWorkerClient().request("cancelCompare", {});
              onClose();
            }}
          >
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={!preview || loading || preview.columns.common.length === 0}>
            Comparar
          </button>
        </div>
      </form>
    </div>
  );
}
