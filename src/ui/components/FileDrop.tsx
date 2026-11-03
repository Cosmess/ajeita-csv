import { useRef } from "react";

export const ACCEPTED_EXTENSIONS = [".csv", ".txt", ".tsv", ".xlsx"];

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

export function EmptyState({ onFile }: { onFile: (file: File) => void }) {
  return (
    <section className="empty-state">
      <p className="empty-title">Arraste um arquivo para cá</p>
      <p className="muted">CSV, TXT, TSV ou Excel (.xlsx)</p>
      <OpenFileButton onFile={onFile} />
      <p className="muted small">
        Encoding, separador e cabeçalho são detectados automaticamente, e você pode ajustar depois.
      </p>
    </section>
  );
}
