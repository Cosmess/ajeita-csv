import { describe, expect, it } from "vitest";
import { generateSql, inferSqlColumns, sqlName, type SqlDialect } from "../../src/core/create/sql";
import { openFixture, parseText } from "../helpers";

// Valores difíceis: aspas simples e duplas, barra invertida, quebra de linha, acentos,
// zeros à esquerda (texto), números BR, datas com e sem hora, sim/não e vazios (NULL).
const tricky = () =>
  parseText(
    [
      "Código;Nome do Cliente;Observação;Valor;Quantidade;Data;Data e Hora;Ativo",
      `0001;D'Ávila;"diz ""oi"" \\ ok";1.234,56;10;15/03/2025;15/03/2025 14:30;sim`,
      `0002;João;"linha 1\nlinha 2";0,5;3000000000;01/12/2024;01/12/2024 08:05:10;não`,
      `0003;;;;;;;`,
    ].join("\n") + "\n",
  );

describe("geração de SQL", () => {
  it("infere tipos verificando todos os valores", () => {
    const columns = inferSqlColumns(tricky(), { normalizeNames: true });
    expect(columns.map((c) => [c.name, c.type])).toEqual([
      ["codigo", { kind: "text", length: 4 }],
      ["nome_do_cliente", { kind: "text", length: 7 }],
      ["observacao", { kind: "text", length: 15 }],
      ["valor", { kind: "decimal", precision: 6, scale: 2 }],
      ["quantidade", { kind: "bigint" }],
      ["data", { kind: "date" }],
      ["data_e_hora", { kind: "timestamp" }],
      ["ativo", { kind: "boolean" }],
    ]);
  });

  it("normaliza nomes sem perder a unicidade", () => {
    expect(sqlName("Data de Cadastro", "x")).toBe("data_de_cadastro");
    expect(sqlName("2025 1º semestre", "x")).toBe("c_2025_1o_semestre");
    expect(sqlName("!!!", "coluna_3")).toBe("coluna_3");
    const columns = inferSqlColumns(parseText("Nome;nome;NOME\n1;2;3\n"), { normalizeNames: true });
    expect(columns.map((c) => c.name)).toEqual(["nome", "nome_2", "nome_3"]);
  });

  for (const dialect of ["postgres", "sqlserver", "mysql"] as SqlDialect[]) {
    it(`INSERT em ${dialect}`, () => {
      const sql = generateSql(tricky(), { dialect, mode: "insert", table: "Clientes BR", createTable: true, normalizeNames: true });
      expect(sql).toMatchSnapshot();
    });
  }

  it("COPY do PostgreSQL", () => {
    const sql = generateSql(tricky(), { dialect: "postgres", mode: "copy", table: "clientes", createTable: true, normalizeNames: true });
    expect(sql).toMatchSnapshot();
  });

  it("BULK INSERT do SQL Server", () => {
    const sql = generateSql(tricky(), { dialect: "sqlserver", mode: "bulk", table: "clientes", createTable: true, normalizeNames: true }, undefined, "clientes.csv");
    expect(sql).toMatchSnapshot();
  });

  it("divide os INSERTs em lotes", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => `${i};nome ${i}`);
    const sql = generateSql(parseText(["id;nome", ...rows].join("\n")), {
      dialect: "postgres",
      mode: "insert",
      table: "t",
      createTable: false,
      normalizeNames: true,
    });
    expect(sql.match(/INSERT INTO/g)).toHaveLength(3);
    expect(sql).not.toContain("CREATE TABLE");
  });

  it("mantém os nomes originais quando pedido, com escape do identificador", () => {
    const sql = generateSql(parseText('a"b;c]d;e`f\n1;2;3\n'), { dialect: "sqlserver", mode: "insert", table: "x", createTable: true, normalizeNames: false });
    expect(sql).toContain("[c]]d]");
    const pg = generateSql(parseText('a"b\n1\n'), { dialect: "postgres", mode: "insert", table: "x", createTable: true, normalizeNames: false });
    expect(pg).toContain('"a""b"');
  });

  it("gera SQL para o arquivo de clientes com CPF como texto", () => {
    const sql = generateSql(openFixture("clientes-utf8-virgula.csv"), {
      dialect: "postgres",
      mode: "insert",
      table: "clientes",
      createTable: true,
      normalizeNames: true,
    });
    expect(sql).toContain('"cpf" VARCHAR(14)');
    expect(sql).toContain('"valor_compra" NUMERIC(7, 2)');
    expect(sql).toContain("'012.345.678-90'");
    expect(sql).toContain("'2025-03-15'");
    expect(sql).toContain("1234.56");
  });
});
