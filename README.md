# Ajeita CSV

Extensão para Google Chrome que **abre, corrige, formata, limpa e cria arquivos CSV**, pensada para times de operações e backoffice no Brasil.

Resolve os problemas mais comuns de quem lida com planilhas no dia a dia: acentos quebrados (`JoÃ£o`), CPFs que perderam o zero à esquerda depois de passar pelo Excel, arquivo com `;` que abre tudo numa coluna só, datas e números em formatos misturados, linhas quebradas e por aí vai.

> **Privacidade em primeiro lugar:** todo o processamento acontece no seu navegador. Nenhum dado é enviado para servidores, e a extensão não faz nenhuma requisição de rede.

## Status

🚧 Em desenvolvimento. A extensão ainda não está publicada na Chrome Web Store.

| Fase | Conteúdo | Status |
|---|---|---|
| 1. Base | Projeto WXT + React + TypeScript, side panel, worker, testes | ✅ Concluída |
| 2. Parse e grade | Detecção de encoding/delimitador/cabeçalho, leitura de `.xlsx`, grade virtualizada, ordenar/filtrar/buscar, resumo por coluna, exportação CSV e Excel BR | ✅ Concluída |
| 3. Corrigir | Acentos quebrados, painel de problemas, edição de células, desfazer/refazer, sessão salva | ⏳ |
| 4. Formatar e limpar | Limpeza, conversões (datas, números, CPF/CNPJ, telefone, CEP), colunas, validação, localizar e substituir | ⏳ |
| 5. Criar | Grade vazia, CSV a partir da página (seleção e tabela), JSON, geração de SQL | ⏳ |
| 6. Exportações e arquivos | `.xlsx`, TSV, área de transferência, dividir e juntar arquivos | ⏳ |
| 7. Publicação | Ícones, textos, política de privacidade, pacote para a loja | ⏳ |

## Como usar

1. Clique no ícone do Ajeita CSV na barra do Chrome para abrir o painel lateral.
2. Arraste um arquivo para o painel ou clique em **Abrir arquivo** (`.csv`, `.txt`, `.tsv` ou `.xlsx`). Se a planilha tiver várias abas, escolha qual abrir.
3. Confira o que foi detectado logo abaixo do nome do arquivo (**encoding**, **separador** e **primeira linha é cabeçalho**) e corrija, se precisar: o arquivo é relido na hora.
4. Na grade:
   - **Ordenar:** clique no nome da coluna (crescente → decrescente → sem ordem). Com **Shift + clique**, ordena por mais de uma coluna.
   - **Filtrar:** clique em ⏷ no cabeçalho e escolha a condição (contém, é igual a, começa com, está vazio, não está vazio). Os filtros ativos aparecem acima da grade.
   - **Buscar:** digite no campo de busca; use Enter (ou ↓) para ir à próxima ocorrência e Shift + Enter (ou ↑) para a anterior.
   - **Resumo:** clique em Σ no cabeçalho para ver tipo, vazios, valores únicos, mínimo/máximo e os valores mais frequentes. Clicar num valor filtra por ele.
5. Clique em **Exportar**, escolha o formato (**Excel em português** ou **CSV padrão**) e salve. Em "Opções avançadas" dá para trocar encoding (inclusive Windows-1252), separador, quebra de linha e aspas. Com filtro ou ordenação ativos, você escolhe se exporta o arquivo inteiro ou só o que está na tela.

A extensão lembra a última escolha de exportação.

## Funcionalidades

### Abrir e navegar ✅
- Abrir `.csv`, `.txt`, `.tsv` e `.xlsx` arrastando para o painel ou pelo botão "Abrir arquivo".
- Detecção automática de **encoding** (UTF-8 ou Windows-1252), **delimitador** (`,` `;` tab `|`) e **cabeçalho**, sempre com opção de ajuste manual.
- Detecção do **tipo de cada coluna**: texto, número (formato brasileiro `1.234,56` ou americano `1,234.56`), data (`dd/mm/aaaa`, `mm/dd/aaaa` ou ISO) e sim/não.
- Grade virtualizada: abre arquivos de 1 milhão de linhas sem travar.
- Ordenar (por tipo: números e datas em ordem numérica, texto sem diferenciar acentos), filtrar e buscar; resumo estatístico por coluna.
- Arquivos `.xlsx` são lidos como o texto exibido no Excel: zeros à esquerda e datas são preservados.

### Corrigir
- Correção de **acentos quebrados** (mojibake), com prévia antes de aplicar.
- Painel de **problemas**: aspas não fechadas, quebras de linha dentro de campo e linhas com número errado de colunas.
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
- ✅ **CSV Excel BR** (padrão): UTF-8 com BOM, `;`, vírgula decimal e quebra de linha CRLF — abre certinho no Excel em português.
- ✅ **CSV padrão**: UTF-8, vírgula, LF.
- ✅ Opções avançadas: **Windows-1252** para sistemas legados (avisa antes quais caracteres não existem nesse encoding), separador, quebra de linha e aspas em todos os campos.
- `.xlsx`, SQL e cópia para colar no Excel/Google Sheets.
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
| `pnpm gen:fixtures` | Gera o arquivo de referência de desempenho (1 milhão de linhas, ~150 MB) |
| `pnpm bench` | Mede o desempenho com o arquivo de referência e falha se alguma meta for ultrapassada |

## Arquitetura

```
src/
  entrypoints/
    background.ts      # service worker: abre o side panel ao clicar no ícone
    sidepanel/         # interface React do painel lateral
  core/                # funções puras, sem DOM nem API do Chrome
    dataset.ts         # modelo de dados: colunas, linhas e metadados do arquivo
    parse/             # detecção de encoding, delimitador, cabeçalho e tipos; leitura de CSV e .xlsx
    inspect/           # ordenação, filtro, busca e resumo por coluna (retornam índices de linhas)
    export/            # serialização CSV e encoder Windows-1252
  workers/
    csv.worker.ts      # Web Worker que executa o processamento pesado
    protocol.ts        # contrato tipado das mensagens UI ↔ worker
    session.ts         # estado do arquivo aberto, que vive dentro do worker
    handlers.ts        # liga cada operação do protocolo à sessão
    client.ts          # cliente usado pela UI para chamar o worker
  ui/
    components/        # grade, barra do arquivo, busca, filtros, resumo, exportação
    hooks/             # cache das linhas visíveis
scripts/
  generate-fixtures.ts # gera o arquivo de referência de desempenho
tests/                 # testes Vitest
  fixtures/            # arquivos de exemplo (ver tests/fixtures/README.md)
```

Princípios que guiam o código:

- **A interface nunca trava.** Leitura, transformações e exportação rodam num Web Worker. A UI conversa com ele por um protocolo tipado: cada operação declara seus parâmetros, seu resultado e seu progresso em `src/workers/protocol.ts`, e o TypeScript garante que UI e worker estejam sempre de acordo.
- **Os dados ficam no worker.** O arquivo aberto vive inteiro dentro do worker; a grade pede só os blocos de linhas visíveis. Ordenar e filtrar produzem uma lista de índices, sem copiar as linhas. Os bytes exportados são transferidos para a UI sem cópia.
- **Transformações são funções puras** em `src/core/`, testadas isoladamente. Isso permite desfazer/refazer qualquer passo e, no futuro, salvar sequências de passos como "receitas" reaplicáveis.
- **Permissões mínimas.** O manifest pede apenas `sidePanel`, `storage`, `contextMenus`, `activeTab` e `scripting`. Nada de acesso amplo a sites.
- **Nada de código remoto.** Todas as bibliotecas vão no pacote da extensão, como exige o Manifest V3.

### Stack

- [WXT](https://wxt.dev/) — framework para extensões Manifest V3
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (modo `strict`)
- [PapaParse](https://www.papaparse.com/) — leitura e escrita de CSV
- [SheetJS](https://sheetjs.com/) — leitura de `.xlsx`
- [TanStack Virtual](https://tanstack.com/virtual) — grade virtualizada em linhas e colunas
- [Vitest](https://vitest.dev/) — testes unitários e de desempenho

## Testes

- `pnpm test` roda os testes unitários: detecção de encoding, delimitador, cabeçalho e tipos com os [arquivos de exemplo](tests/fixtures/README.md), ordenação, filtros, busca, resumo, encoder Windows-1252 e **ida e volta** (exportar em cada formato e abrir de novo devolve os mesmos dados).
- `pnpm gen:fixtures && pnpm bench` mede o desempenho com 1 milhão de linhas. Medições num Mac com Apple Silicon:

| Operação | Tempo | Meta |
|---|---|---|
| Abrir (parse completo, ~150 MB) | 1,2 s | 15 s |
| Primeiras linhas na tela | 0,4 s | 2 s |
| Ordenar texto / número / data | 1,1 / 0,6 / 0,7 s | 2 s |
| Filtrar / buscar em todas as colunas | 0,3 / 1,2 s | 2 s |
| Resumo de uma coluna | 0,7 s | 2 s |
| Exportar Excel BR / Windows-1252 | 4,1 / 5,0 s | 10 s |

## Contribuindo

- Cada funcionalidade é desenvolvida numa branch própria (`feat/...`, `fix/...`, `docs/...`) e entra na `main` por pull request.
- Mensagens de commit seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português: `feat(parse): detecta delimitador automaticamente`.
- O CI (GitHub Actions) roda verificação de tipos, testes e build em todo pull request; o PR só entra com tudo passando.

## Licença

[MIT](LICENSE) © 2026 Cosme Sousa
