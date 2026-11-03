import { regexError } from "../core/transform/replace";
import type { Operation } from "../workers/protocol";

export type Values = Record<string, unknown>;

export type Field =
  // `optional`: nenhuma coluna marcada tem um significado (ex.: linha inteira, todas as colunas).
  | { kind: "columns"; key: string; label: string; optional?: string }
  | { kind: "column"; key: string; label: string }
  | { kind: "select"; key: string; label: string; options: [string, string][]; initial: string }
  | { kind: "checkbox"; key: string; label: string; initial: boolean }
  | { kind: "text"; key: string; label: string; initial?: string; placeholder?: string; error?: (values: Values) => string | undefined }
  | { kind: "number"; key: string; label: string; initial: number; min: number; max: number };

export type ActionGroup = "Editar" | "Limpeza" | "Conversões" | "Colunas" | "Localizar";

// Tamanho atual dos dados, para ações que atuam no fim (ex.: adicionar linha).
export type ActionContext = { rowCount: number; columnCount: number };

export type ActionDef = {
  id: string;
  group: ActionGroup;
  label: string;
  hint?: string;
  fields: Field[];
  toOp: (values: Values, context: ActionContext) => Operation;
  // Aplicada direto, sem formulário nem prévia (o efeito é óbvio e pode ser desfeito).
  direct?: boolean;
};

const columns = (label = "Colunas"): Field => ({ kind: "columns", key: "columns", label });
const nums = (v: unknown) => (v as number[]) ?? [];
const str = (v: unknown) => String(v ?? "");

const DOCUMENT_MODE: [string, string][] = [
  ["mask", "Com máscara (000.000.000-00)"],
  ["unmask", "Só os números"],
];

export const ACTIONS: ActionDef[] = [
  // --- Editar ---
  {
    id: "addRow",
    group: "Editar",
    label: "Adicionar linha no fim",
    fields: [],
    direct: true,
    toOp: (_, { rowCount }) => ({ op: "insertRows", params: { index: rowCount, count: 1 } }),
  },
  {
    id: "addColumn",
    group: "Editar",
    label: "Adicionar coluna no fim",
    fields: [],
    direct: true,
    toOp: (_, { columnCount }) => ({ op: "addColumn", params: { index: columnCount } }),
  },

  // --- Limpeza ---
  {
    id: "trimSpaces",
    group: "Limpeza",
    label: "Remover espaços extras",
    hint: "Tira espaços do começo e do fim e troca espaços repetidos por um só.",
    fields: [columns()],
    toOp: (v) => ({ op: "trimSpaces", params: { columns: nums(v.columns) } }),
  },
  {
    id: "changeCase",
    group: "Limpeza",
    label: "Maiúsculas e minúsculas",
    fields: [
      columns(),
      {
        kind: "select",
        key: "mode",
        label: "Transformar em",
        options: [
          ["title", "Primeira Letra Maiúscula"],
          ["upper", "MAIÚSCULAS"],
          ["lower", "minúsculas"],
        ],
        initial: "title",
      },
    ],
    toOp: (v) => ({ op: "changeCase", params: { columns: nums(v.columns), mode: v.mode as "upper" | "lower" | "title" } }),
  },
  {
    id: "removeAccents",
    group: "Limpeza",
    label: "Remover acentos",
    hint: "Ex.: Conceição → Conceicao.",
    fields: [columns()],
    toOp: (v) => ({ op: "removeAccents", params: { columns: nums(v.columns) } }),
  },
  {
    id: "removeDuplicates",
    group: "Limpeza",
    label: "Remover linhas duplicadas",
    hint: "Mantém a primeira ocorrência de cada linha repetida.",
    fields: [{ kind: "columns", key: "columns", label: "Comparar pelas colunas", optional: "Nenhuma marcada: compara a linha inteira." }],
    toOp: (v) => ({ op: "removeDuplicates", params: { columns: nums(v.columns) } }),
  },
  {
    id: "removeEmptyRows",
    group: "Limpeza",
    label: "Remover linhas vazias",
    fields: [],
    toOp: () => ({ op: "removeEmptyRows", params: {} }),
  },
  {
    id: "removeEmptyColumns",
    group: "Limpeza",
    label: "Remover colunas vazias",
    fields: [],
    toOp: () => ({ op: "removeEmptyColumns", params: {} }),
  },

  // --- Conversões ---
  {
    id: "convertDates",
    group: "Conversões",
    label: "Datas",
    fields: [
      columns(),
      {
        kind: "select",
        key: "to",
        label: "Converter para",
        options: [
          ["dmy", "dd/mm/aaaa (brasileiro)"],
          ["ymd", "aaaa-mm-dd (ISO)"],
          ["mdy", "mm/dd/aaaa (americano)"],
        ],
        initial: "dmy",
      },
      {
        kind: "select",
        key: "from",
        label: "Formato atual",
        options: [
          ["auto", "Detectar automaticamente"],
          ["dmy", "dd/mm/aaaa"],
          ["mdy", "mm/dd/aaaa"],
          ["ymd", "aaaa-mm-dd"],
        ],
        initial: "auto",
      },
      { kind: "checkbox", key: "keepTime", label: "Manter a hora, quando houver", initial: true },
    ],
    toOp: (v) => ({
      op: "convertDates",
      params: {
        columns: nums(v.columns),
        to: v.to as "dmy" | "ymd" | "mdy",
        keepTime: Boolean(v.keepTime),
        from: v.from === "auto" ? undefined : (v.from as "dmy" | "ymd" | "mdy"),
      },
    }),
  },
  {
    id: "convertNumbers",
    group: "Conversões",
    label: "Números",
    fields: [
      columns(),
      {
        kind: "select",
        key: "to",
        label: "Converter para",
        options: [
          ["br", "1.234,56 (brasileiro)"],
          ["us", "1234.56 (sistemas e bancos de dados)"],
        ],
        initial: "br",
      },
      { kind: "checkbox", key: "keepCurrency", label: "Manter o R$", initial: false },
    ],
    toOp: (v) => ({
      op: "convertNumbers",
      params: { columns: nums(v.columns), to: v.to as "br" | "us", keepCurrency: Boolean(v.keepCurrency) },
    }),
  },
  {
    id: "formatDocuments",
    group: "Conversões",
    label: "CPF e CNPJ",
    hint: "Aceita o CNPJ alfanumérico. Valores em notação científica (1,23E+13) não têm conserto e são apontados.",
    fields: [
      columns(),
      { kind: "select", key: "mode", label: "Formato", options: DOCUMENT_MODE, initial: "mask" },
      {
        kind: "select",
        key: "kind",
        label: "Tipo",
        options: [
          ["auto", "Identificar automaticamente"],
          ["cpf", "Tudo é CPF"],
          ["cnpj", "Tudo é CNPJ"],
        ],
        initial: "auto",
      },
      { kind: "checkbox", key: "padZeros", label: "Completar zeros à esquerda perdidos no Excel", initial: true },
    ],
    toOp: (v) => ({
      op: "formatDocuments",
      params: {
        columns: nums(v.columns),
        mode: v.mode as "mask" | "unmask",
        kind: v.kind as "auto" | "cpf" | "cnpj",
        padZeros: Boolean(v.padZeros),
      },
    }),
  },
  {
    id: "formatPhones",
    group: "Conversões",
    label: "Telefones",
    hint: "Remove +55, 0 e código de operadora; números como 0800 e 190 ficam como estão.",
    fields: [
      columns(),
      {
        kind: "select",
        key: "format",
        label: "Formato",
        options: [
          ["national", "(11) 91234-5678"],
          ["digits", "11912345678"],
          ["e164", "+5511912345678 (E.164)"],
        ],
        initial: "national",
      },
      { kind: "checkbox", key: "addNinthDigit", label: "Acrescentar o 9 em celulares antigos (8 dígitos)", initial: true },
      {
        kind: "text",
        key: "defaultDdd",
        label: "DDD padrão para números sem DDD (opcional)",
        placeholder: "ex.: 11",
        error: (v) => (str(v.defaultDdd) && !/^\d{2}$/.test(str(v.defaultDdd)) ? "Use 2 dígitos" : undefined),
      },
    ],
    toOp: (v) => ({
      op: "formatPhones",
      params: {
        columns: nums(v.columns),
        format: v.format as "national" | "digits" | "e164",
        addNinthDigit: Boolean(v.addNinthDigit),
        defaultDdd: str(v.defaultDdd) || undefined,
      },
    }),
  },
  {
    id: "formatCeps",
    group: "Conversões",
    label: "CEP",
    fields: [
      columns(),
      {
        kind: "select",
        key: "mode",
        label: "Formato",
        options: [
          ["mask", "01310-100"],
          ["unmask", "01310100"],
        ],
        initial: "mask",
      },
    ],
    toOp: (v) => ({ op: "formatCeps", params: { columns: nums(v.columns), mode: v.mode as "mask" | "unmask" } }),
  },

  // --- Colunas ---
  {
    id: "splitColumn",
    group: "Colunas",
    label: "Dividir coluna",
    hint: 'Ex.: "Maria da Silva" com espaço em 2 partes → "Maria" e "da Silva".',
    fields: [
      { kind: "column", key: "column", label: "Coluna" },
      { kind: "text", key: "separator", label: "Separador", initial: " ", placeholder: "espaço, vírgula, - …" },
      { kind: "number", key: "parts", label: "Em quantas partes", initial: 2, min: 2, max: 20 },
      { kind: "text", key: "names", label: "Nomes das novas colunas (separados por vírgula, opcional)", placeholder: "Nome, Sobrenome" },
    ],
    toOp: (v) => ({
      op: "splitColumn",
      params: {
        column: Number(v.column),
        separator: str(v.separator),
        parts: Number(v.parts),
        names: str(v.names)
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
      },
    }),
  },
  {
    id: "mergeColumns",
    group: "Colunas",
    label: "Juntar colunas",
    hint: "Na ordem em que aparecem na grade; células vazias são ignoradas.",
    fields: [
      columns("Colunas a juntar"),
      { kind: "text", key: "separator", label: "Separador", initial: " " },
      { kind: "text", key: "name", label: "Nome da nova coluna", placeholder: "opcional" },
      { kind: "checkbox", key: "keepOriginals", label: "Manter as colunas originais", initial: false },
    ],
    toOp: (v) => ({
      op: "mergeColumns",
      params: {
        columns: nums(v.columns),
        separator: str(v.separator),
        name: str(v.name),
        keepOriginals: Boolean(v.keepOriginals),
      },
    }),
  },

  // --- Localizar e substituir ---
  {
    id: "replace",
    group: "Localizar",
    label: "Localizar e substituir",
    fields: [
      {
        kind: "text",
        key: "find",
        label: "Procurar",
        error: (v) => (v.regex && str(v.find) ? (regexError(str(v.find)) && `Expressão regular inválida: ${regexError(str(v.find))}`) : undefined),
      },
      { kind: "text", key: "replace", label: "Substituir por", placeholder: "vazio apaga o texto encontrado" },
      { kind: "columns", key: "columns", label: "Onde", optional: "Nenhuma marcada: em todas as colunas." },
      { kind: "checkbox", key: "matchCase", label: "Diferenciar maiúsculas e minúsculas", initial: false },
      { kind: "checkbox", key: "wholeCell", label: "Só células inteiras iguais", initial: false },
      { kind: "checkbox", key: "regex", label: "Expressão regular (use $1, $2 na substituição)", initial: false },
    ],
    toOp: (v) => ({
      op: "replace",
      params: {
        columns: nums(v.columns).length > 0 ? nums(v.columns) : "all",
        find: str(v.find),
        replace: str(v.replace),
        matchCase: Boolean(v.matchCase),
        wholeCell: Boolean(v.wholeCell),
        regex: Boolean(v.regex),
      },
    }),
  },
];

export const ACTION_GROUPS: { group: ActionGroup; label: string }[] = [
  { group: "Editar", label: "Editar" },
  { group: "Limpeza", label: "Limpeza" },
  { group: "Conversões", label: "Formatar e converter" },
  { group: "Colunas", label: "Colunas" },
  { group: "Localizar", label: "Localizar" },
];
