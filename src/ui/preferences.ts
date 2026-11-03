import { browser } from "wxt/browser";
import { EXPORT_PRESETS, type CsvExportOptions, type ExportPreset } from "../core/export/csv";

export type ExportPreferences = { preset: ExportPreset; options: CsvExportOptions };

const KEY = "exportPreferences";

export const DEFAULT_EXPORT: ExportPreferences = { preset: "excel-br", options: EXPORT_PRESETS["excel-br"] };

// Última escolha de exportação, lembrada entre sessões.
export async function loadExportPreferences(): Promise<ExportPreferences> {
  try {
    const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<ExportPreferences> | undefined;
    if (!stored?.preset || !(stored.preset in EXPORT_PRESETS)) return DEFAULT_EXPORT;
    return { preset: stored.preset, options: { ...EXPORT_PRESETS[stored.preset], ...stored.options } };
  } catch {
    return DEFAULT_EXPORT;
  }
}

export async function saveExportPreferences(preferences: ExportPreferences): Promise<void> {
  try {
    await browser.storage.local.set({ [KEY]: preferences });
  } catch {
    // Não lembrar a escolha não impede a exportação.
  }
}
