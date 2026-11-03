export type ReplaceOptions = {
  find: string;
  replace: string;
  matchCase: boolean;
  wholeCell: boolean;
  regex: boolean;
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Erro da expressão regular, para mostrar ao lado do campo (undefined se válida).
export function regexError(pattern: string): string | undefined {
  try {
    new RegExp(pattern, "u");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// Função de substituição. Com expressão regular, a substituição aceita $1, $2…
export function replacer(options: ReplaceOptions): (value: string) => string {
  if (options.find === "") throw new Error("Informe o texto a procurar");
  if (options.regex) {
    const error = regexError(options.find);
    if (error) throw new Error(`Expressão regular inválida: ${error}`);
  }
  const source = options.regex ? options.find : escapeRegex(options.find);
  const flags = `gu${options.matchCase ? "" : "i"}`;
  const pattern = new RegExp(options.wholeCell ? `^(?:${source})$` : source, flags);
  // Sem expressão regular, "$" na substituição é texto comum.
  if (!options.regex) return (value) => value.replace(pattern, () => options.replace);
  return (value) => value.replace(pattern, options.replace);
}
