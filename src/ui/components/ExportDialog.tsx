import { useEffect, useState } from "react";
import { DELIMITERS, type Delimiter } from "../../core/dataset";
import { EXPORT_PRESETS, type CsvExportOptions, type ExportEncoding, type ExportPreset, type LineEnding } from "../../core/export/csv";
import type { UnencodablePolicy } from "../../core/export/windows1252";
import { SQL_DIALECT_LABELS, sqlName, type SqlDialect, type SqlMode, type SqlOptions } from "../../core/create/sql";
import type { ExportScope } from "../../workers/protocol";
import { DELIMITER_LABELS, EXPORT_ENCODING_LABELS, LINE_ENDING_LABELS, formatCount } from "../labels";
import { loadExportPreferences, saveExportPreferences } from "../preferences";
import { pickSaveTarget, writeToTarget } from "../save";
import { getWorkerClient } from "../worker";

const PRESET_SUFFIX: Record<ExportPreset, string> = { "excel-br": "_excel-br", csv: "_padrao" };

function suggestName(fileName: string, preset: ExportPreset, delimiter: Delimiter): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "dados";
  return `${base}${PRESET_SUFFIX[preset]}${delimiter === "\t" ? ".tsv" : ".csv"}`;
}

type Step =
  | { kind: "form" }
  | { kind: "working"; message: string }
  | { kind: "unencodable"; chars: { char: string; count: number }[] }
  | { kind: "error"; message: string };

type Props = {
  fileName: string;
  rowCount: number;
  viewCount: number;
  viewChanged: boolean;
  onClose: () => void;
  onSaved: (fileName: string) => void;
};

const SQL_MODES: [SqlMode, string, SqlDialect | undefined][] = [
  ["insert", "CREATE TABLE + INSERTs", undefined],
  ["copy", "COPY (psql, mais rápido para muitos dados)", "postgres"],
  ["bulk", "BULK INSERT (lê um CSV no servidor)", "sqlserver"],
];

export function ExportDialog({ fileName, rowCount, viewCount, viewChanged, onClose, onSaved }: Props) {
  const [format, setFormat] = useState<"csv" | "sql">("csv");
  const [sql, setSql] = useState<SqlOptions>(() => ({
    dialect: "postgres",
    mode: "insert",
    table: sqlName(fileName.replace(/\.[^.]+$/, ""), "dados"),
    createTable: true,
    normalizeNames: true,
  }));
  const [sqlPreview, setSqlPreview] = useState<{ text: string; columns: { name: string; type: string }[] }>();
  const [preset, setPreset] = useState<ExportPreset>("excel-br");
  const [options, setOptions] = useState<CsvExportOptions>(EXPORT_PRESETS["excel-br"]);
  const [scope, setScope] = useState<ExportScope>("all");
  const [name, setName] = useState(() => suggestName(fileName, "excel-br", ";"));
  const [step, setStep] = useState<Step>({ kind: "form" });

  useEffect(() => {
    void loadExportPreferences().then((prefs) => {
      setPreset(prefs.preset);
      setOptions(prefs.options);
      setName(suggestName(fileName, prefs.preset, prefs.options.delimiter));
    });
  }, [fileName]);

  const updateSql = (patch: Partial<SqlOptions>) => {
    setSqlPreview(undefined);
    setSql((current) => {
      const next = { ...current, ...patch };
      // Modos específicos de um banco voltam para INSERTs quando o banco muda.
      const mode = SQL_MODES.find(([m]) => m === next.mode);
      if (mode?.[2] && mode[2] !== next.dialect) next.mode = "insert";
      return next;
    });
  };
  const sqlName_ = `${fileName.replace(/\.[^.]+$/, "") || "dados"}.sql`;

  async function loadSqlPreview() {
    try {
      setSqlPreview(await getWorkerClient().request("previewSql", { options: sql, scope }));
    } catch (error) {
      setStep({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function saveSql() {
    const target = await pickSaveTarget(sqlName_);
    if (target === "cancelled") return;
    setStep({ kind: "working", message: "Gerando o SQL…" });
    try {
      const { bytes } = await getWorkerClient().request("exportSql", { options: sql, scope });
      await writeToTarget(target, bytes as Uint8Array<ArrayBuffer>, sqlName_);
      onSaved(sqlName_);
    } catch (error) {
      setStep({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const choosePreset = (next: ExportPreset) => {
    setFormat("csv");
    setPreset(next);
    setOptions(EXPORT_PRESETS[next]);
    setName(suggestName(fileName, next, EXPORT_PRESETS[next].delimiter));
  };
  const update = (patch: Partial<CsvExportOptions>) => setOptions((current) => ({ ...current, ...patch }));

  async function save(policy: UnencodablePolicy) {
    const target = await pickSaveTarget(name);
    if (target === "cancelled") {
      setStep({ kind: "form" });
      return;
    }
    setStep({ kind: "working", message: "Gerando o arquivo…" });
    try {
      const { bytes } = await getWorkerClient().request("exportFile", { options, scope, policy });
      await writeToTarget(target, bytes as Uint8Array<ArrayBuffer>, name);
      await saveExportPreferences({ preset, options });
      onSaved(name);
    } catch (error) {
      setStep({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function start() {
    if (options.encoding === "windows-1252") {
      setStep({ kind: "working", message: "Verificando caracteres…" });
      try {
        const { unencodable } = await getWorkerClient().request("checkExport", { options, scope });
        if (unencodable.length > 0) {
          setStep({ kind: "unencodable", chars: unencodable });
          return;
        }
      } catch (error) {
        setStep({ kind: "error", message: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    await save("replace");
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <h2 id="export-title">Exportar</h2>

        {step.kind === "unencodable" ? (
          <>
            <p>Estes caracteres não existem em Windows-1252:</p>
            <ul className="unencodable">
              {step.chars.slice(0, 20).map(({ char, count }) => (
                <li key={char}>
                  <span className="char">{char}</span> {formatCount(count)}×
                </li>
              ))}
            </ul>
            {step.chars.length > 20 && <p className="muted small">e mais {step.chars.length - 20}.</p>}
            <p>O que fazer com eles?</p>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setStep({ kind: "form" })}>
                Voltar
              </button>
              <button type="button" className="button" onClick={() => void save("remove")}>
                Remover
              </button>
              <button type="button" className="button primary" onClick={() => void save("replace")}>
                Trocar por ?
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (format === "sql" ? saveSql() : start());
            }}
          >
            <fieldset className="presets">
              <legend>Formato</legend>
              <label className="radio">
                <input type="radio" checked={format === "csv" && preset === "excel-br"} onChange={() => choosePreset("excel-br")} />
                <span>
                  <strong>Excel em português</strong>
                  <span className="muted small"> — ponto e vírgula, vírgula decimal, UTF-8 com BOM</span>
                </span>
              </label>
              <label className="radio">
                <input type="radio" checked={format === "csv" && preset === "csv"} onChange={() => choosePreset("csv")} />
                <span>
                  <strong>CSV padrão</strong>
                  <span className="muted small"> — vírgula, UTF-8 sem BOM, para sistemas e bancos de dados</span>
                </span>
              </label>
              <label className="radio">
                <input type="radio" checked={format === "sql"} onChange={() => setFormat("sql")} />
                <span>
                  <strong>SQL</strong>
                  <span className="muted small"> — script para criar a tabela e inserir os dados</span>
                </span>
              </label>
            </fieldset>

            {format === "sql" && (
              <fieldset className="sql-options">
                <legend>SQL</legend>
                <label>
                  Banco de dados
                  <select value={sql.dialect} onChange={(e) => updateSql({ dialect: e.target.value as SqlDialect })}>
                    {Object.entries(SQL_DIALECT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Como inserir
                  <select value={sql.mode} onChange={(e) => updateSql({ mode: e.target.value as SqlMode })}>
                    {SQL_MODES.filter(([, , only]) => !only || only === sql.dialect).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome da tabela
                  <input value={sql.table} onChange={(e) => updateSql({ table: e.target.value })} required />
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={sql.createTable} onChange={(e) => updateSql({ createTable: e.target.checked })} />
                  Incluir CREATE TABLE (tipos detectados pelos dados)
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={sql.normalizeNames}
                    onChange={(e) => updateSql({ normalizeNames: e.target.checked })}
                  />
                  Nomes sem acentos e espaços (data_de_cadastro)
                </label>
                <button type="button" className="button" onClick={() => void loadSqlPreview()}>
                  Ver prévia do SQL
                </button>
                {sqlPreview && (
                  <>
                    <ul className="sql-columns small">
                      {sqlPreview.columns.map((c) => (
                        <li key={c.name}>
                          <code>{c.name}</code> <span className="muted">{c.type}</span>
                        </li>
                      ))}
                    </ul>
                    <pre className="sql-preview">{sqlPreview.text}</pre>
                    <p className="muted small">Prévia com as 5 primeiras linhas.</p>
                  </>
                )}
              </fieldset>
            )}

            {format === "csv" && (
            <details className="advanced">
              <summary>Opções avançadas</summary>
              <label>
                Encoding
                <select value={options.encoding} onChange={(e) => update({ encoding: e.target.value as ExportEncoding })}>
                  {Object.entries(EXPORT_ENCODING_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Separador
                <select
                  value={options.delimiter}
                  onChange={(e) => {
                    const delimiter = e.target.value as Delimiter;
                    update({ delimiter });
                    setName((current) => current.replace(/\.(csv|tsv)$/i, delimiter === "\t" ? ".tsv" : ".csv"));
                  }}
                >
                  {DELIMITERS.map((d) => (
                    <option key={d} value={d}>
                      {DELIMITER_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quebra de linha
                <select value={options.lineEnding} onChange={(e) => update({ lineEnding: e.target.value as LineEnding })}>
                  {Object.entries(LINE_ENDING_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Aspas
                <select value={options.quoteAll ? "all" : "minimal"} onChange={(e) => update({ quoteAll: e.target.value === "all" })}>
                  <option value="minimal">Só quando necessário</option>
                  <option value="all">Em todos os campos</option>
                </select>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={options.decimalComma} onChange={(e) => update({ decimalComma: e.target.checked })} />
                Converter números 1234.56 para 1234,56
              </label>
            </details>
            )}

            {viewChanged && (
              <fieldset>
                <legend>Linhas</legend>
                <label className="radio">
                  <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
                  Arquivo inteiro ({formatCount(rowCount)} linhas, na ordem original)
                </label>
                <label className="radio">
                  <input type="radio" checked={scope === "view"} onChange={() => setScope("view")} />
                  Só o que está na tela ({formatCount(viewCount)} linhas, com filtros e ordenação)
                </label>
              </fieldset>
            )}

            {format === "csv" && (
              <label>
                Nome do arquivo
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
            )}

            {step.kind === "working" && <p className="muted">{step.message}</p>}
            {step.kind === "error" && <p className="error">Não foi possível exportar: {step.message}</p>}

            <div className="modal-actions">
              <button type="button" className="button" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="button primary" disabled={step.kind === "working"}>
                Salvar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
