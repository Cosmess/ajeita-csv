import type { OpenProgress } from "../../workers/protocol";

export function ProgressBar({ fraction }: { fraction: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

// Primeiras linhas mostradas enquanto o arquivo ainda está sendo lido.
export function LoadingView({ fileName, progress }: { fileName: string; progress: OpenProgress }) {
  const percent = Math.round(progress.fraction * 100);
  return (
    <section className="loading">
      <p>
        Lendo <strong>{fileName}</strong>… {percent}%
      </p>
      <ProgressBar fraction={progress.fraction} />
      {progress.preview && (
        <div className="preview-scroll">
          <table className="preview-table">
            <thead>
              <tr>
                {progress.preview.columns.map((name, i) => (
                  <th key={i}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {progress.preview.rows.slice(0, 50).map((row, r) => (
                <tr key={r}>
                  {progress.preview!.columns.map((_, c) => (
                    <td key={c}>{row[c] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
