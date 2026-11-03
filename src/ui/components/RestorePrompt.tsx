import type { SessionSummary } from "../../storage/session";
import { formatCount } from "../labels";

const when = (time: number) =>
  new Date(time).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function RestorePrompt(props: { summary: SessionSummary; busy: boolean; onRestore: () => void; onDiscard: () => void }) {
  const { summary } = props;
  return (
    <section className="restore">
      <p>
        Você estava trabalhando em <strong>{summary.fileName}</strong> ({formatCount(summary.rowCount)} linhas
        {summary.steps > 0 ? `, ${formatCount(summary.steps)} ${summary.steps === 1 ? "alteração" : "alterações"}` : ""}),
        salvo em {when(summary.savedAt)}.
      </p>
      <div className="restore-actions">
        <button type="button" className="button primary" disabled={props.busy} onClick={props.onRestore}>
          Continuar de onde parei
        </button>
        <button type="button" className="button" disabled={props.busy} onClick={props.onDiscard}>
          Descartar
        </button>
      </div>
    </section>
  );
}
