// Gera o arquivo de referência de desempenho: 1.000.000 linhas × 12 colunas (~100 MB).
// Uso: pnpm gen:fixtures [linhas]
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROWS = Number(process.argv[2] ?? 1_000_000);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "generated", "referencia.csv");

// Gerador pseudoaleatório com semente fixa: o arquivo é sempre o mesmo.
let seed = 42;
function random(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pad = (n: number, size: number) => String(n).padStart(size, "0");

const FIRST = ["Maria", "José", "Ana", "João", "Antônio", "Francisca", "Carlos", "Lúcia", "Paulo", "Conceição", "Pedro", "Júlia"];
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Araújo", "Conceição"];
const CITIES: readonly [string, string, number][] = [
  ["São Paulo", "SP", 11], ["Rio de Janeiro", "RJ", 21], ["Belo Horizonte", "MG", 31], ["Salvador", "BA", 71],
  ["Fortaleza", "CE", 85], ["Curitiba", "PR", 41], ["Recife", "PE", 81], ["Porto Alegre", "RS", 51],
  ["Goiânia", "GO", 62], ["Belém", "PA", 91], ["Florianópolis", "SC", 48], ["Maceió", "AL", 82],
];
const STATUS = ["ativo", "inativo", "pendente", "bloqueado"];
const NOTES = ["", "", "", "Cliente preferencial", "Ligar após às 18h", "Pagamento em débito", "Endereço, com vírgula"];

function cpf(): string {
  const d = Array.from({ length: 9 }, () => int(0, 9));
  for (const len of [9, 10]) {
    const sum = d.reduce((s, x, i) => s + x * (len + 1 - i), 0);
    d.push(((sum * 10) % 11) % 10);
  }
  const s = d.join("");
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

function money(): string {
  const cents = int(0, 5_000_000);
  const reais = Math.floor(cents / 100).toLocaleString("pt-BR");
  return `${reais},${pad(cents % 100, 2)}`;
}

const quote = (v: string) => (/[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

mkdirSync(dirname(OUT), { recursive: true });
const out = createWriteStream(OUT);
out.write("id;nome;cpf;email;cidade;uf;data_nascimento;valor;telefone;cep;status;observacao\n");

let buffer = "";
for (let i = 1; i <= ROWS; i++) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const [city, uf, ddd] = pick(CITIES);
  const row = [
    String(i),
    `${first} ${pick(LAST)} ${last}`,
    cpf(),
    `${first}.${last}${i}@example.com`.toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""),
    city,
    uf,
    `${pad(int(1, 28), 2)}/${pad(int(1, 12), 2)}/${int(1940, 2006)}`,
    money(),
    `(${ddd}) 9${int(1000, 9999)}-${int(1000, 9999)}`,
    `${pad(int(1000, 99999), 5)}-${pad(int(0, 999), 3)}`,
    pick(STATUS),
    pick(NOTES),
  ];
  buffer += row.map(quote).join(";") + "\n";
  if (buffer.length > 1 << 20) {
    out.write(buffer);
    buffer = "";
  }
}
out.end(buffer, () => console.log(`Gerado ${OUT} (${ROWS} linhas)`));
