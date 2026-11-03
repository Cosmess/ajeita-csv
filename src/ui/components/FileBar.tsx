import type { Delimiter, Encoding } from "../../core/dataset";
import type { ParseOverrides } from "../../core/parse";
import type { DatasetInfo } from "../../workers/protocol";
import { DELIMITER_LABELS, ENCODING_LABELS } from "../labels";
import { OpenFileButton } from "./FileDrop";

type Props = {
  info: DatasetInfo;
  busy: boolean;
  onReopen: (overrides: ParseOverrides, sheet?: string) => void;
  onOpenFile: (file: File) => void;
  onExport: () => void;
};

// Nome do arquivo, o que foi detectado (com opção de corrigir) e as ações principais.
export function FileBar({ info, busy, onReopen, onOpenFile, onExport }: Props) {
  const { meta } = info;
  const isCsv = meta.source === "csv";
  const encoding: Encoding = meta.encoding === "iso-8859-1" ? "windows-1252" : meta.encoding;

  return (
    <section className="file-bar">
      <div className="file-bar-top">
        <strong className="file-name" title={info.fileName}>
          {info.fileName}
        </strong>
        <div className="file-actions">
          <OpenFileButton onFile={onOpenFile} label="Abrir outro" primary={false} />
          <button type="button" className="button primary" onClick={onExport} disabled={busy}>
            Exportar
          </button>
        </div>
      </div>
      <div className="file-options">
        {isCsv && (
          <>
            <label>
              Encoding
              <select
                value={encoding}
                disabled={busy}
                onChange={(e) => onReopen({ encoding: e.target.value as Encoding })}
              >
                {Object.entries(ENCODING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Separador
              <select
                value={meta.delimiter}
                disabled={busy}
                onChange={(e) => onReopen({ delimiter: e.target.value as Delimiter })}
              >
                {Object.entries(DELIMITER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {info.sheets.length > 1 && (
          <label>
            Aba
            <select value={meta.sheet} disabled={busy} onChange={(e) => onReopen({}, e.target.value)}>
              {info.sheets.map((sheet) => (
                <option key={sheet} value={sheet}>
                  {sheet}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={meta.hasHeader}
            disabled={busy}
            onChange={(e) => onReopen({ hasHeader: e.target.checked })}
          />
          Primeira linha é cabeçalho
        </label>
      </div>
    </section>
  );
}
