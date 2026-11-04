import { useRef } from "react";

export const ACCEPTED_EXTENSIONS = [".csv", ".txt", ".tsv", ".xlsx", ".json"];

export function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

type OpenFileButtonProps = { onFile: (file: File) => void; label?: string; primary?: boolean };

export function OpenFileButton({ onFile, label = "Abrir arquivo", primary = true }: OpenFileButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={primary ? "button primary" : "button"} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </>
  );
}

type EmptyStateProps = {
  onFile: (file: File) => void;
  onBlank: () => void;
  onPaste: () => void;
  onMerge: () => void;
  onCompare: () => void;
};

export function EmptyState({ onFile, onBlank, onPaste, onMerge, onCompare }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <p className="empty-title">Arraste um arquivo para cá</p>
      <p className="muted">CSV, TXT, TSV, Excel (.xlsx) ou JSON</p>
      <OpenFileButton onFile={onFile} />
      <p className="muted small">
        Encoding, separador e cabeçalho são detectados automaticamente, e você pode ajustar depois.
      </p>
      <div className="create-actions">
        <span className="muted small">ou</span>
        <button type="button" className="button" onClick={onBlank}>
          Criar planilha em branco
        </button>
        <button type="button" className="button" onClick={onPaste}>
          Colar dados ou JSON
        </button>
        <button type="button" className="button" onClick={onMerge}>
          Juntar vários arquivos
        </button>
        <button type="button" className="button" onClick={onCompare}>
          Comparar duas planilhas
        </button>
      </div>
      <p className="muted small">
        Em qualquer site, clique com o botão direito numa tabela ou num texto selecionado e escolha{" "}
        <strong>Criar CSV desta tabela</strong> ou <strong>Criar CSV a partir da seleção</strong>.
      </p>
    </section>
  );
}
