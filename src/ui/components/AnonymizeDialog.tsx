import { useEffect, useState } from "react";
import type { Column } from "../../core/dataset";
import {
  DATA_KIND_LABELS,
  randomKey,
  type AnonymizeMethod,
  type ColumnSuggestion,
  type DataKind,
} from "../../core/transform/anonymize";
import type { Operation } from "../../workers/protocol";
import { getWorkerClient } from "../worker";

type Choice = AnonymizeMethod | "keep";

const METHODS: [Choice, string][] = [
  ["keep", "Manter"],
  ["mask", "Mascarar"],
  ["pseudonym", "Pseudônimo"],
  ["fake", "Dado falso"],
  ["clear", "Apagar"],
];

type Props = {
  columns: Column[];
  // Coluna escolhida pelo menu da coluna: já vem marcada para mascarar.
  column?: number;
  onSubmit: (op: Operation) => void;
  onClose: () => void;
};

// Anonimizar (LGPD): um método por coluna, com as colunas pessoais já sugeridas.
export function AnonymizeDialog({ columns, column, onSubmit, onClose }: Props) {
  const [kinds, setKinds] = useState<DataKind[]>();
  const [choices, setChoices] = useState<Choice[]>([]);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" } | { kind: "working" } | { kind: "error"; message: string }>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    getWorkerClient()
      .request("anonymizeSuggestions", {})
      .then((suggestions: ColumnSuggestion[]) => {
        if (cancelled) return;
        setKinds(suggestions.map((s) => s.kind));
        setChoices(
          suggestions.map((s) => (column !== undefined ? (s.column === column ? "mask" : "keep") : s.sensitive ? "mask" : "keep")),
        );
      })
      .catch((e: unknown) => !cancelled && setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [column]);

  const selected = choices.flatMap((choice, i) => (choice === "keep" ? [] : [{ column: i, method: choice, kind: kinds![i]! }]));
  const needsKey = selected.some((rule) => rule.method === "pseudonym" || rule.method === "fake");
  const missingPassword = needsKey && usePassword && password === "";

  async function submit() {
    if (selected.length === 0 || missingPassword) return;
    setStatus({ kind: "working" });
    try {
      const shared = needsKey && usePassword;
      const key = shared ? await getWorkerClient().request("anonymizeKey", { password }) : randomKey();
      onSubmit({ op: "anonymize", params: { rules: selected, key, shared } });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const update = <T,>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item));

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anonymize-title"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="anonymize-title">Anonimizar dados (LGPD)</h2>
        <p className="muted small">
          Escolha o que fazer com cada coluna. As que parecem ter dados pessoais já vêm marcadas para mascarar.
        </p>

        {!kinds && status.kind !== "error" && <p className="muted">Analisando as colunas…</p>}
        {kinds && (
          <div className="anonymize-list" role="table" aria-label="Colunas">
            <div className="anonymize-row anonymize-head" role="row">
              <span role="columnheader">Coluna</span>
              <span role="columnheader">Tipo de dado</span>
              <span role="columnheader">O que fazer</span>
            </div>
            {columns.map((c, i) => (
              <div key={i} className={`anonymize-row${choices[i] !== "keep" ? " active" : ""}`} role="row">
                <span className="anonymize-name" role="cell" title={c.name}>
                  {c.name}
                </span>
                <select
                  role="cell"
                  aria-label={`Tipo de dado de ${c.name}`}
                  value={kinds[i]}
                  onChange={(e) => setKinds(update(kinds, i, e.target.value as DataKind))}
                >
                  {Object.entries(DATA_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  role="cell"
                  aria-label={`O que fazer com ${c.name}`}
                  value={choices[i]}
                  onChange={(e) => setChoices(update(choices, i, e.target.value as Choice))}
                >
                  {METHODS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <details className="advanced">
          <summary>O que cada opção faz</summary>
          <ul className="anonymize-help small">
            <li>
              <strong>Mascarar:</strong> esconde parte do valor: <code>***.982.247-**</code>, <code>j***@gmail.com</code>,{" "}
              <code>(11) 9****-5678</code>, <code>**/**/1987</code>.
            </li>
            <li>
              <strong>Pseudônimo:</strong> troca por um código (<code>nome 0001</code>). O mesmo valor vira sempre o mesmo
              código, então contagens e cruzamentos continuam batendo.
            </li>
            <li>
              <strong>Dado falso:</strong> troca por um valor inventado e válido (CPF com dígito certo, e-mail em
              example.com, telefone com o mesmo DDD). Bom para bases de teste.
            </li>
            <li>
              <strong>Apagar:</strong> deixa a célula vazia.
            </li>
          </ul>
        </details>

        {needsKey && (
          <fieldset>
            <legend>Códigos entre arquivos</legend>
            <label className="checkbox">
              <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
              Usar uma senha para gerar os mesmos códigos em outros arquivos
            </label>
            {usePassword && (
              <label>
                Senha
                <input
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  aria-invalid={missingPassword}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span className="muted small">Use a mesma senha nos outros arquivos. Ela não é guardada.</span>
              </label>
            )}
          </fieldset>
        )}

        <div className="banner warn anonymize-warning" role="note">
          <span>
            Mascarar e pseudonimizar diminuem o risco, mas a LGPD só considera anônimo o dado que não permite identificar a
            pessoa, nem combinado com outras informações. Revise as colunas antes de compartilhar. O arquivo exportado sai sem
            os valores originais; eles ficam só no histórico de desfazer, neste navegador.
          </span>
        </div>

        {status.kind === "error" && <p className="field-error">{status.message}</p>}

        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!kinds || selected.length === 0 || missingPassword || status.kind === "working"}
          >
            {status.kind === "working" ? "Preparando…" : "Ver prévia"}
          </button>
        </div>
      </form>
    </div>
  );
}
