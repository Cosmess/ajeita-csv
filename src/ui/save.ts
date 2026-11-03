// Salvar sem a permissão "downloads": seletor de arquivo do sistema quando
// disponível; senão, download comum por link.

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

export type SaveTarget = FileSystemFileHandle | "download";

// Precisa ser chamado logo após o clique do usuário (exigência do navegador).
export async function pickSaveTarget(suggestedName: string): Promise<SaveTarget | "cancelled"> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!picker) return "download";
  const extension = suggestedName.slice(suggestedName.lastIndexOf("."));
  try {
    return await picker({
      suggestedName,
      types: [{ description: "Arquivo de texto separado", accept: { "text/csv": [extension] } }],
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    // Ex.: o gesto do usuário expirou enquanto o arquivo era preparado.
    return "download";
  }
}

export async function writeToTarget(target: SaveTarget, bytes: Uint8Array<ArrayBuffer>, fileName: string): Promise<void> {
  if (target !== "download") {
    const writable = await target.createWritable();
    await writable.write(bytes);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
