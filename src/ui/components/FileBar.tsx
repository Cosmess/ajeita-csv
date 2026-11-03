import type { Delimiter, Encoding } from "../../core/dataset";
import type { ParseOverrides } from "../../core/parse";
import type { DatasetInfo } from "../../workers/protocol";
import { DELIMITER_LABELS, ENCODING_LABELS } from "../labels";
import { OpenFileButton } from "./FileDrop";
import { SettingsButton } from "./Settings";

type Props = {
  info: DatasetInfo;
  busy: boolean;
  onReopen: (overrides: ParseOverrides, sheet?: string) => void;
  onSetHeader: (hasHeader: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenFile: (file: File) => void;
  onExport: () => void;
  onClearSaved: () => void;
};

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const shortcut = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

// Nome do arquivo, o que foi detectado (com opção de corrigir) e as ações principais.
export function FileBar(props: Props) {
  const { info, busy, onReopen, onOpenFile, onExport } = props;
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
          <button
            type="button"
            className="grid-icon history-button"
            disabled={busy || !info.undo}
            aria-label={info.undo ? `Desfazer: ${info.undo}` : "Desfazer"}
            title={info.undo ? `Desfazer: ${info.undo} (${shortcut("Z")})` : "Nada para desfazer"}
            onClick={props.onUndo}
          >
            ↶
          </button>
          <button
            type="button"
            className="grid-icon history-button"
            disabled={busy || !info.redo}
            aria-label={info.redo ? `Refazer: ${info.redo}` : "Refazer"}
            title={info.redo ? `Refazer: ${info.redo} (${shortcut("⇧Z")})` : "Nada para refazer"}
            onClick={props.onRedo}
          >
            ↷
          </button>
          <OpenFileButton onFile={onOpenFile} label="Abrir outro" primary={false} />
          <button type="button" className="button primary" onClick={onExport} disabled={busy}>
            Exportar
          </button>
          <SettingsButton onClearSaved={props.onClearSaved} />
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
        {meta.source === "json" && info.jsonArrays.length > 0 && (
          <label>
            Arrays
            <select value={meta.explode ?? ""} disabled={busy} onChange={(e) => onReopen({ explode: e.target.value })}>
              <option value="">Juntar itens com |</option>
              {info.jsonArrays.map((field) => (
                <option key={field} value={field}>
                  Uma linha por item de {field}
                </option>
              ))}
            </select>
          </label>
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
            onChange={(e) => props.onSetHeader(e.target.checked)}
          />
          Primeira linha é cabeçalho
        </label>
      </div>
    </section>
  );
}
