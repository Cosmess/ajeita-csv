import { useEffect, useState } from "react";
import { getWorkerClient } from "../../ui/worker";

type WorkerStatus = "checking" | "ready" | "error";

const statusLabel: Record<WorkerStatus, string> = {
  checking: "Iniciando o processador…",
  ready: "Processador pronto",
  error: "Não foi possível iniciar o processador",
};

export function App() {
  const [status, setStatus] = useState<WorkerStatus>("checking");

  useEffect(() => {
    getWorkerClient()
      .request("ping", { sentAt: Date.now() })
      .then(() => setStatus("ready"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main className="app">
      <header>
        <h1>Ajeita CSV</h1>
        <p>Abra, corrija e limpe arquivos CSV. Tudo é processado no seu navegador: nenhum dado sai da sua máquina.</p>
      </header>
      <section className="placeholder">
        <p>Em breve: arraste um arquivo CSV para cá.</p>
      </section>
      <footer className={`status status-${status}`} role="status">
        {statusLabel[status]}
      </footer>
    </main>
  );
}
