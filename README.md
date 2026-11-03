# Ajeita CSV

Extensão para Google Chrome que **abre, corrige, formata, limpa e cria arquivos CSV**, pensada para times de operações e backoffice no Brasil.

Resolve os problemas mais comuns de quem lida com planilhas no dia a dia: acentos quebrados (`JoÃ£o`), CPFs que perderam o zero à esquerda depois de passar pelo Excel, arquivo com `;` que abre tudo numa coluna só, datas e números em formatos misturados, linhas quebradas e por aí vai.

> **Privacidade em primeiro lugar:** todo o processamento acontece no seu navegador. Nenhum dado é enviado para servidores, e a extensão não faz nenhuma requisição de rede.

## Status

🚧 Em desenvolvimento. A extensão ainda não está publicada na Chrome Web Store.

| Fase | Conteúdo | Status |
|---|---|---|
| 1. Base | Projeto WXT + React + TypeScript, side panel, worker, testes | ✅ Concluída |
| 2. Parse e grade | Detecção de encoding/delimitador/cabeçalho, leitura de `.xlsx`, grade virtualizada, ordenar/filtrar/buscar, resumo por coluna, exportação CSV e Excel BR | ⏳ |
| 3. Corrigir | Acentos quebrados, painel de problemas, edição de células, desfazer/refazer, sessão salva | ⏳ |
| 4. Formatar e limpar | Limpeza, conversões (datas, números, CPF/CNPJ, telefone, CEP), colunas, validação, localizar e substituir | ⏳ |
| 5. Criar | Grade vazia, CSV a partir da página (seleção e tabela), JSON, geração de SQL | ⏳ |
| 6. Exportações e arquivos | `.xlsx`, TSV, área de transferência, dividir e juntar arquivos | ⏳ |
| 7. Publicação | Ícones, textos, política de privacidade, pacote para a loja | ⏳ |

## Funcionalidades planejadas

### Abrir e corrigir
- Abrir `.csv`, `.txt`, `.tsv` e `.xlsx` arrastando para o painel ou pelo botão "Abrir arquivo".
- Detecção automática de **encoding** (UTF-8 ou Windows-1252), **delimitador** (`,` `;` tab `|`) e **cabeçalho**, sempre com opção de ajuste manual.
- Correção de **acentos quebrados** (mojibake), com prévia antes de aplicar.
- Painel de **problemas**: aspas não fechadas, quebras de linha dentro de campo e linhas com número errado de colunas.
- Ordenar, filtrar e buscar na grade; resumo estatístico por coluna.
- Desfazer/refazer qualquer alteração, e retomar o trabalho depois de fechar o painel.

### Formatar e limpar
- Remover espaços extras, linhas duplicadas, linhas e colunas vazias, acentos; trocar maiúsculas/minúsculas.
- Converter **datas** (`dd/MM/yyyy`, ISO, `MM/dd/yyyy`) e **números** (`1.234,56` ↔ `1234.56`, sem `R$`).
- **CPF e CNPJ** (incluindo o novo CNPJ alfanumérico): colocar ou tirar máscara, recuperar zeros à esquerda e validar dígito verificador.
- **Telefone**: normalizar para `(11) 91234-5678`, só dígitos ou `+5511912345678`.
- **CEP**: `01310100` ↔ `01310-100`.
- Renomear, reordenar, dividir e juntar colunas; localizar e substituir (com expressões regulares).

### Criar
- Planilha em branco editável.
- CSV a partir de texto selecionado ou de uma tabela da página (menu do botão direito).
- CSV a partir de JSON, achatando objetos aninhados.
- Geração de SQL (`CREATE TABLE` + `INSERT`) para PostgreSQL, SQL Server e MySQL.

### Exportar
- **CSV Excel BR** (padrão): UTF-8 com BOM, `;` e vírgula decimal — abre certinho no Excel em português.
- CSV padrão, TSV, `.xlsx`, SQL, Windows-1252 para sistemas legados, e cópia para colar no Excel/Google Sheets.
- Dividir um arquivo grande em partes ou juntar vários arquivos num só.

## Instalação para desenvolvimento

### Requisitos
- [Node.js](https://nodejs.org/) 22 ou superior
- [pnpm](https://pnpm.io/) (a versão fica fixada em `package.json`; com o Corepack basta rodar `corepack enable pnpm`)
- Google Chrome 114 ou superior (versão mínima com suporte a side panel)

### Passo a passo

```bash
git clone https://github.com/Cosmess/ajeita-csv.git
cd ajeita-csv
pnpm install
pnpm dev
```

O `pnpm dev` abre uma janela do Chrome com a extensão já carregada e recarrega automaticamente a cada alteração no código. Clique no ícone da extensão na barra de ferramentas para abrir o painel lateral.

### Carregar o build no seu Chrome

1. Rode `pnpm build`. O resultado fica em `.output/chrome-mv3/`.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `.output/chrome-mv3`.
4. Fixe a extensão na barra de ferramentas e clique no ícone para abrir o painel.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Inicia o modo de desenvolvimento com recarga automática |
| `pnpm build` | Gera o build de produção em `.output/chrome-mv3/` |
| `pnpm zip` | Gera o `.zip` para enviar à Chrome Web Store |
| `pnpm compile` | Verifica os tipos do TypeScript |
| `pnpm test` | Roda os testes unitários |
| `pnpm test:watch` | Roda os testes em modo observação |

## Arquitetura

```
src/
  entrypoints/
    background.ts      # service worker: abre o side panel ao clicar no ícone
    sidepanel/         # interface React do painel lateral
  core/                # transformações puras (dados) => dados, sem DOM nem API do Chrome
  workers/
    csv.worker.ts      # Web Worker que executa o processamento pesado
    protocol.ts        # contrato tipado das mensagens UI ↔ worker
    handlers.ts        # implementação de cada operação do worker
    client.ts          # cliente usado pela UI para chamar o worker
  ui/                  # componentes e utilitários da interface
tests/                 # testes Vitest
  fixtures/            # arquivos de exemplo (ver tests/fixtures/README.md)
```

Princípios que guiam o código:

- **A interface nunca trava.** Leitura, transformações e exportação rodam num Web Worker. A UI conversa com ele por um protocolo tipado: cada operação declara seus parâmetros e seu resultado em `src/workers/protocol.ts`, e o TypeScript garante que UI e worker estejam sempre de acordo.
- **Transformações são funções puras** em `src/core/`, testadas isoladamente. Isso permite desfazer/refazer qualquer passo e, no futuro, salvar sequências de passos como "receitas" reaplicáveis.
- **Permissões mínimas.** O manifest pede apenas `sidePanel`, `storage`, `contextMenus`, `activeTab` e `scripting`. Nada de acesso amplo a sites.
- **Nada de código remoto.** Todas as bibliotecas vão no pacote da extensão, como exige o Manifest V3.

### Stack

- [WXT](https://wxt.dev/) — framework para extensões Manifest V3
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (modo `strict`)
- [Vitest](https://vitest.dev/) — testes unitários
- A partir das próximas fases: PapaParse (CSV), SheetJS (`.xlsx`), TanStack Table e TanStack Virtual (grade), fflate (`.zip`)

## Contribuindo

- Cada funcionalidade é desenvolvida numa branch própria (`feat/...`, `fix/...`, `docs/...`) e entra na `main` por pull request.
- Mensagens de commit seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português: `feat(parse): detecta delimitador automaticamente`.
- O CI (GitHub Actions) roda verificação de tipos, testes e build em todo pull request; o PR só entra com tudo passando.

## Licença

[MIT](LICENSE) © 2026 Cosme Sousa
