import { useState } from "react";
import type { Column } from "../../core/dataset";
import { EXPORT_PRESETS, type ExportPreset } from "../../core/export/csv";
import type { SplitMode } from "../../core/files/split";
import type { ExportScope } from "../../workers/protocol";
import { formatCount } from "../labels";
import { pickSaveTarget, writeToTarget } from "../save";
import { getWorkerClient } from "../worker";

type Preview = { total: number; parts: { name: string; rows: number }[]; estimatedBytes: number };

const FORMATS: [ExportPreset, string][] = [
  ["excel-br", "Excel em português (;)"],
  ["csv", "CSV padrão (,)"],
  ["tsv", "TSV (tabulação)"],
];

const size = (bytes: number) =>
  bytes > 1e6 ? `${(bytes / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(bytes / 1e3)} KB`;

type Props = {
  fileName: string;
  columns: Column[];
  viewChanged: boolean;
  onClose: () => void;
  onSaved: (fileName: string) => void;
};

// Divide o arquivo em partes (por número de linhas ou por valor de coluna), num .zip.
export function SplitDialog({ fileName, columns, viewChanged, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<"rows" | "column">("rows");
  const [rows, setRows] = useState(10_000);
  const [column, setColumn] = useState(0);
  const [preset, setPreset] = useState<ExportPreset>("excel-br");
  const [scope, setScope] = useState<ExportScope>("all");
  const [preview, setPreview] = useState<Preview>();
  const [status, setStatus] = useState<{ kind: "idle" } | { kind: "working"; message: string } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  const split: SplitMode = mode === "rows" ? { mode, size: rows } : { mode, column };
  const options = EXPORT_PRESETS[preset];
  const zipName = `${fileName.replace(/\.[^.]+$/, "") || "dados"}_partes.zip`;
  const reset = () => {
    setPreview(undefined);
    setStatus({ kind: "idle" });
  };
  const fail = (error: unknown) => setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });

  async function loadPreview() {
    setStatus({ kind: "working", message: "Calculando as partes…" });
    try {
      setPreview(await getWorkerClient().request("previewSplit", { split, options, scope }));
      setStatus({ kind: "idle" });
    } catch (error) {
      fail(error);
    }
  }

  async function save() {
    const target = await pickSaveTarget(zipName);
    if (target === "cancelled") return;
    setStatus({ kind: "working", message: "Gerando o .zip…" });
    try {
      const { bytes } = await getWorkerClient().request("exportSplit", { split, options, scope, policy: "replace" });
      await writeToTarget(target, bytes as Uint8Array<ArrayBuffer>, zipName);
      onSaved(zipName);
    } catch (error) {
      fail(error);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-title"
        onSubmit={(e) => {
          e.preventDefault();
          void (preview ? save() : loadPreview());
        }}
      >
        <h2 id="split-title">Dividir arquivo</h2>
        <p className="muted small">Gera um .zip com as partes; o cabeçalho se repete em cada uma. O arquivo aberto não muda.</p>
        <div className="action-fields">
          <fieldset>
            <legend>Dividir</legend>
            <label className="radio">
              <input type="radio" checked={mode === "rows"} onChange={() => (setMode("rows"), reset())} />
              <span>
                A cada{" "}
                <input
                  type="number"
                  className="inline-number"
                  min={1}
                  value={rows}
                  aria-label="Linhas por parte"
                  onChange={(e) => (setRows(Number(e.target.value)), reset())}
                />{" "}
                linhas
              </span>
            </label>
            <label className="radio">
              <input type="radio" checked={mode === "column"} onChange={() => (setMode("column"), reset())} />
              <span>
                Um arquivo para cada valor de{" "}
                <select value={column} aria-label="Coluna" onChange={(e) => (setColumn(Number(e.target.value)), setMode("column"), reset())}>
                  {columns.map((c, i) => (
                    <option key={i} value={i}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </fieldset>
          <label>
            Formato das partes
            <select value={preset} onChange={(e) => (setPreset(e.target.value as ExportPreset), reset())}>
              {FORMATS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {viewChanged && (
            <label className="checkbox">
              <input type="checkbox" checked={scope === "view"} onChange={(e) => (setScope(e.target.checked ? "view" : "all"), reset())} />
              Só as linhas que estão na tela (com filtros e ordenação)
            </label>
          )}
        </div>

        {preview && (
          <div className="split-preview">
            <p>
              <strong>{formatCount(preview.total)}</strong> {preview.total === 1 ? "arquivo" : "arquivos"}, cerca de{" "}
              {size(preview.estimatedBytes)} antes de compactar:
            </p>
            <ul>
              {preview.parts.map((part) => (
                <li key={part.name}>
                  <code>{part.name}</code>{" "}
                  <span className="muted">
                    {formatCount(part.rows)} {part.rows === 1 ? "linha" : "linhas"}
                  </span>
                </li>
              ))}
            </ul>
            {preview.total > preview.parts.length && (
              <p className="muted small">e mais {formatCount(preview.total - preview.parts.length)} arquivos.</p>
            )}
          </div>
        )}
        {status.kind === "working" && <p className="muted">{status.message}</p>}
        {status.kind === "error" && <p className="error">{status.message}</p>}

        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={status.kind === "working"}>
            {preview ? `Salvar ${zipName}` : "Ver prévia"}
          </button>
        </div>
      </form>
    </div>
  );
}
