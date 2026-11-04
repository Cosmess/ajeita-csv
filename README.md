<p align="center"><img src="public/icon/128.png" alt="Logo do Ajeita CSV" width="96" height="96"></p>

# Ajeita CSV

Extensão para Google Chrome que **abre, corrige, formata, limpa e cria arquivos CSV**, pensada para times de operações e backoffice no Brasil.

Resolve os problemas mais comuns de quem lida com planilhas no dia a dia: acentos quebrados (`JoÃ£o`), CPFs que perderam o zero à esquerda depois de passar pelo Excel, arquivo com `;` que abre tudo numa coluna só, datas e números em formatos misturados, linhas quebradas e por aí vai.

> **Privacidade em primeiro lugar:** todo o processamento acontece no seu navegador. Nenhum dado é enviado para servidores, e a extensão não faz nenhuma requisição de rede. Veja a [política de privacidade](PRIVACY.md).

## Status

Versão 1.0.1, publicada na Chrome Web Store.

![Ajeita CSV corrigindo acentos quebrados](assets/screenshot.png)

| Fase | Conteúdo | Status |
|---|---|---|
| 1. Base | Projeto WXT + React + TypeScript, side panel, worker, testes | ✅ Concluída |
| 2. Parse e grade | Detecção de encoding/delimitador/cabeçalho, leitura de `.xlsx`, grade virtualizada, ordenar/filtrar/buscar, resumo por coluna, exportação CSV e Excel BR | ✅ Concluída |
| 3. Corrigir | Acentos quebrados, painel de problemas, edição de células, desfazer/refazer, sessão salva | ✅ Concluída |
| 4. Formatar e limpar | Limpeza, conversões (datas, números, CPF/CNPJ, telefone, CEP), colunas, validação, localizar e substituir | ✅ Concluída |
| 5. Criar | Grade vazia, CSV a partir da página (seleção e tabela), JSON, geração de SQL | ✅ Concluída |
| 6. Exportações e arquivos | `.xlsx`, TSV, área de transferência, dividir e juntar arquivos | ✅ Concluída |
| 7. Publicação | Ícones, textos, política de privacidade, pacote para a loja | ✅ Concluída |

## Como usar

1. Clique no ícone do Ajeita CSV na barra do Chrome para abrir o painel lateral.
2. Arraste um arquivo para o painel ou clique em **Abrir arquivo** (`.csv`, `.txt`, `.tsv`, `.xlsx` ou `.json`). Se a planilha tiver várias abas, escolha qual abrir. Também dá para **criar uma planilha em branco** ou **colar dados** (do Excel, do Google Sheets, texto em colunas ou JSON).
   - **De qualquer site:** clique com o botão direito numa tabela e escolha **Criar CSV desta tabela**, ou selecione um texto e escolha **Criar CSV a partir da seleção**. Se a página tiver várias tabelas e nada estiver selecionado, clique na tabela que você quer (Esc cancela).
3. Confira o que foi detectado logo abaixo do nome do arquivo (**encoding**, **separador** e **primeira linha é cabeçalho**) e corrija, se precisar: o arquivo é relido na hora.
4. Na grade:
   - **Ordenar:** clique no nome da coluna (crescente → decrescente → sem ordem). Com **Shift + clique**, ordena por mais de uma coluna.
   - **Filtrar:** clique em ⏷ no cabeçalho e escolha a condição (contém, é igual a, começa com, está vazio, não está vazio). Os filtros ativos aparecem acima da grade.
   - **Buscar:** digite no campo de busca; use Enter (ou ↓) para ir à próxima ocorrência e Shift + Enter (ou ↑) para a anterior.
   - **Resumo:** clique em Σ no cabeçalho para ver tipo, vazios, valores únicos, mínimo/máximo e os valores mais frequentes. Clicar num valor filtra por ele.
5. Para corrigir:
   - **Acentos quebrados** (`JoÃ£o`): quando o arquivo tem esse problema, aparece um aviso amarelo. Clique em **Corrigir…**, confira a prévia (antes → depois) e aplique.
   - **Problemas de estrutura** (aspas não fechadas, colunas a mais ou a menos, quebras de linha dentro de campo): clique no aviso ⚠ no rodapé. Para cada linha dá para ir até ela, corrigir automaticamente, editar o texto da linha ou excluí-la, ou corrigir todas de uma vez.
   - **Editar uma célula:** clique duas vezes (ou selecione e aperte Enter), digite e confirme com Enter (Esc cancela). Com uma célula selecionada: setas movem, Delete apaga e ⌘V / Ctrl+V cola células copiadas de uma planilha.
   - **Linhas e colunas:** o × no número da linha a exclui; **Ajeitar → Adicionar linha/coluna no fim** e **⋯ → Inserir coluna à direita** acrescentam.
   - **Aplicar ordenação:** a ordenação da grade é só visual; o link **Aplicar aos dados** grava a nova ordem.
   - **Desfazer e refazer:** botões ↶ ↷ ou ⌘Z / ⌘⇧Z (Ctrl+Z / Ctrl+Y no Windows). Toda alteração pode ser desfeita.
6. Para formatar e limpar:
   - **Menu Ajeitar ▾** (ao lado da busca): limpeza (espaços extras, maiúsculas/minúsculas, acentos, linhas duplicadas, linhas e colunas vazias), conversões (datas, números, CPF/CNPJ, telefones, CEP), dividir e juntar colunas, e localizar e substituir. Escolha as colunas, ajuste as opções e confira a **prévia** antes de aplicar; o que não for reconhecido fica como está e aparece listado.
   - **Menu ⋯ de cada coluna:** renomear, resumo, filtrar, formatar, **validar como** (CPF, CNPJ, e-mail, CEP, telefone, obrigatório), dividir, duplicar, mover e excluir.
   - **Validação:** as células inválidas ficam sublinhadas em vermelho e o cabeçalho mostra quantas são (✗ 12). Clique no contador para ver só as inválidas.
   - **Reordenar colunas:** arraste o cabeçalho.
7. Clique em **Exportar**, escolha o formato (**Excel em português**, **CSV padrão**, **TSV**, **planilha do Excel (.xlsx)** ou **SQL**) e salve. **Copiar para colar no Excel/Sheets** leva as linhas para a área de transferência.
8. **Ajeitar → Privacidade → Anonimizar dados (LGPD):** as colunas com dados pessoais (CPF/CNPJ, e-mail, telefone, CEP, nome, data de nascimento) já vêm marcadas. Para cada coluna, escolha **mascarar**, **pseudônimo**, **dado falso** ou **apagar**, confira a prévia e aplique. Também aparece no menu ⋯ → Formatar de cada coluna.
9. **Ajeitar → Arquivos:** **Dividir arquivo** (a cada N linhas ou um arquivo por valor de uma coluna, num `.zip`) e **Juntar arquivos** (vários CSV, TSV, XLSX ou JSON, com as colunas alinhadas pelo nome). "Juntar vários arquivos" também aparece na tela inicial. Em "Opções avançadas" dá para trocar encoding (inclusive Windows-1252), separador, quebra de linha e aspas. Com filtro ou ordenação ativos, você escolhe se exporta o arquivo inteiro ou só o que está na tela.

A extensão lembra a última escolha de exportação. O arquivo aberto e o histórico de alterações ficam salvos neste navegador: ao abrir o painel de novo, você pode **continuar de onde parou**. Para apagar, use ⚙ → **Limpar dados salvos**. Para fechar o arquivo e começar do zero, use o botão **⌂ Início** ao lado do nome do arquivo (se houver alterações, ele pede confirmação e apaga a sessão salva).

## Funcionalidades

### Abrir e navegar ✅
- Abrir `.csv`, `.txt`, `.tsv` e `.xlsx` arrastando para o painel ou pelo botão "Abrir arquivo".
- Detecção automática de **encoding** (UTF-8 ou Windows-1252), **delimitador** (`,` `;` tab `|`) e **cabeçalho**, sempre com opção de ajuste manual.
- Detecção do **tipo de cada coluna**: texto, número (formato brasileiro `1.234,56` ou americano `1,234.56`), data (`dd/mm/aaaa`, `mm/dd/aaaa` ou ISO) e sim/não.
- Grade virtualizada: abre arquivos de 1 milhão de linhas sem travar.
- Ordenar (por tipo: números e datas em ordem numérica, texto sem diferenciar acentos), filtrar e buscar; resumo estatístico por coluna.
- Arquivos `.xlsx` são lidos como o texto exibido no Excel: zeros à esquerda e datas são preservados.

### Corrigir ✅
- Correção de **acentos quebrados** (mojibake: `JoÃ£o`, `SÃ£o Paulo`, `â€™`), com prévia antes de aplicar.
- Painel de **problemas**: aspas não fechadas, quebras de linha dentro de campo e linhas com número errado de colunas, com correção automática, edição manual ou exclusão.
- Edição de células, "primeira linha é cabeçalho" sem perder edições, e ordenação aplicada aos dados.
- **Desfazer/refazer** qualquer alteração (até 100 passos).
- **Sessão salva** no navegador para retomar o trabalho depois de fechar o painel.

### Formatar e limpar ✅
- Remover espaços extras, linhas duplicadas (inteiras ou por colunas-chave), linhas e colunas vazias, acentos; trocar maiúsculas/minúsculas (com "da", "de", "dos" em minúsculas nos nomes).
- Converter **datas** (`dd/mm/aaaa`, ISO, `mm/dd/aaaa`, com ou sem hora) e **números** (`1.234,56` ↔ `1234.56`, com ou sem `R$`).
- **CPF e CNPJ** (incluindo o **CNPJ alfanumérico**): colocar ou tirar máscara, recuperar zeros à esquerda perdidos no Excel (decidindo entre CPF e CNPJ pelo dígito verificador) e apontar valores em notação científica, que não têm conserto.
- **Telefone**: normalizar para `(11) 91234-5678`, só dígitos ou `+5511912345678`, tratando `+55`, prefixo `0` com operadora, 9º dígito, DDD padrão e números como `0800` e `190`.
- **CEP**: `01310100` ↔ `01310-100`, recuperando o zero perdido.
- **Validação** de CPF, CNPJ, e-mail, CEP, telefone e campos obrigatórios, com destaque e filtro dos inválidos.
- Renomear, reordenar (arrastando), duplicar, excluir, dividir e juntar colunas.
- **Localizar e substituir**, com expressões regulares (`$1`, `$2`). Uma expressão que demore mais de 10 segundos é interrompida e o arquivo volta ao estado anterior.

### Privacidade (LGPD) ✅
- **Anonimizar** colunas antes de mandar a planilha para um fornecedor, para o suporte ou para uma base de testes. As colunas pessoais são sugeridas pelo conteúdo (CPF/CNPJ válidos, e-mails, telefones, CEPs) e pelo nome ("nome", "nascimento", "endereço").
- **Mascarar:** esconde parte do valor conforme o tipo: `***.982.247-**`, `j***@gmail.com`, `(11) 9****-5678`, `01310-***`, `**/**/1987`, `J*** d*** S***`. Valores fora do formato da coluna recebem a máscara genérica: nada passa sem alteração.
- **Pseudônimo:** troca por um código (`nome 0001`); o mesmo valor vira sempre o mesmo código, com ou sem máscara (`529.982.247-25` e `52998224725` são a mesma pessoa), então contagens e cruzamentos continuam batendo.
- **Dado falso:** troca por um valor inventado e válido, no mesmo formato do original: CPF e CNPJ com dígito verificador certo, e-mail em `example.com`, telefone com o mesmo DDD, data no mesmo ano. Dois CPFs, e-mails ou telefones diferentes nunca viram o mesmo valor falso.
- **Apagar:** deixa a célula vazia.
- Pseudônimos e dados falsos usam **HMAC-SHA256 com uma chave aleatória** a cada execução, então não dá para descobrir o original testando todos os CPFs possíveis. Com a opção **"usar uma senha"**, a mesma senha gera os mesmos códigos em outros arquivos (para cruzar bases anonimizadas separadamente); a senha não é guardada.
- Aviso no próprio diálogo: mascarar e pseudonimizar reduzem o risco, mas a LGPD (art. 12) só considera anônimo o dado que não permite reidentificar a pessoa.

### Criar ✅
- **Planilha em branco** editável, com colar do Excel/Google Sheets (criando linhas e colunas que faltarem).
- CSV a partir de **texto selecionado** (tabulação, `;` ou espaços como separador) ou de uma **tabela da página** (com `colspan` e `rowspan`), pelo menu do botão direito.
- CSV a partir de **JSON** (arquivo ou colado), achatando objetos aninhados (`endereco.cidade`); arrays juntados com `|` ou uma linha por item.
- **SQL** para PostgreSQL, SQL Server e MySQL: `CREATE TABLE` com tipos detectados pelos dados (inteiro, decimal, data, data e hora, booleano, texto com tamanho) e `INSERT` em lotes, com escape correto de cada banco; `COPY` (PostgreSQL) e `BULK INSERT` (SQL Server).

### Exportar
- ✅ **CSV Excel BR** (padrão): UTF-8 com BOM, `;`, vírgula decimal e quebra de linha CRLF — abre certinho no Excel em português.
- ✅ **CSV padrão**: UTF-8, vírgula, LF.
- ✅ Opções avançadas: **Windows-1252** para sistemas legados (avisa antes quais caracteres não existem nesse encoding), separador, quebra de linha e aspas em todos os campos.
- ✅ **SQL** (ver acima), com prévia.
- ✅ **TSV** e **planilha do Excel (.xlsx)**: números e datas viram células de verdade (o Excel soma e ordena), enquanto CPFs, telefones e códigos com zero à esquerda ficam como texto, sem notação científica. Gera 1 milhão de linhas em ~20 s.
- ✅ **Copiar para colar** no Excel ou no Google Sheets.

### Arquivos ✅
- **Dividir** um arquivo grande em partes de N linhas ou um arquivo por valor de coluna (ex.: por UF), com o cabeçalho em cada parte, num único `.zip`.
- **Juntar** vários arquivos num só: cada um com seu encoding e separador detectados, colunas alinhadas pelo nome do cabeçalho e coluna opcional `arquivo_origem`.

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
    background.ts      # service worker: abre o side panel e cuida do menu do botão direito
    sidepanel/         # interface React do painel lateral
  core/                # funções puras, sem DOM nem API do Chrome
    dataset.ts         # modelo de dados: colunas, linhas e metadados do arquivo
    patch.ts           # alterações reversíveis (cada uma devolve o seu inverso)
    ops.ts             # operações { op, params } que viram patches
    history.ts         # pilha de desfazer/refazer
    preview.ts         # prévia padrão: totais, antes → depois, não reconhecidos
    fix/               # acentos quebrados e problemas de estrutura
    transform/         # limpeza, conversões, colunas, localizar e substituir, anonimizar (LGPD) e SHA-256
    validate/          # CPF, CNPJ (inclusive alfanumérico), e-mail, CEP, telefone, DDDs
    create/            # texto selecionado, tabela da página, JSON e geração de SQL
    parse/             # detecção de encoding, delimitador, cabeçalho e tipos; leitura de CSV e .xlsx
    inspect/           # ordenação, filtro, busca e resumo por coluna (retornam índices de linhas)
    export/            # CSV, encoder Windows-1252, .xlsx (gerador próprio em fluxo) e área de transferência
    files/             # dividir e juntar arquivos
  workers/
    csv.worker.ts      # Web Worker que executa o processamento pesado
    protocol.ts        # contrato tipado das mensagens UI ↔ worker
    session.ts         # estado do arquivo aberto, que vive dentro do worker
    handlers.ts        # liga cada operação do protocolo à sessão
    client.ts          # cliente usado pela UI para chamar o worker
  storage/
    session.ts         # sessão salva no IndexedDB (linhas em blocos)
  ui/
    components/        # grade, barra do arquivo, busca, filtros, resumo, problemas, prévia, exportação
    hooks/             # cache das linhas visíveis
scripts/
  generate-fixtures.ts # gera o arquivo de referência de desempenho
tests/                 # testes Vitest
  fixtures/            # arquivos de exemplo (ver tests/fixtures/README.md)
```

Princípios que guiam o código:

- **A interface nunca trava.** Leitura, transformações e exportação rodam num Web Worker. A UI conversa com ele por um protocolo tipado: cada operação declara seus parâmetros, seu resultado e seu progresso em `src/workers/protocol.ts`, e o TypeScript garante que UI e worker estejam sempre de acordo.
- **Os dados ficam no worker.** O arquivo aberto vive inteiro dentro do worker; a grade pede só os blocos de linhas visíveis. Ordenar e filtrar produzem uma lista de índices, sem copiar as linhas. Os bytes exportados são transferidos para a UI sem cópia.
- **Transformações são funções puras** em `src/core/`, testadas isoladamente. Cada operação é um objeto serializável `{ op, params }` que vira um *patch*; aplicar um patch devolve os dados novos e o patch inverso. O histórico guarda só o que mudou (nunca cópias do arquivo inteiro), e as mesmas operações vão servir de base para as "receitas" reaplicáveis.
- **Permissões mínimas.** O manifest pede apenas `sidePanel`, `storage`, `contextMenus`, `activeTab` e `scripting`. Nada de acesso amplo a sites: a extensão só lê uma página quando você usa o menu do botão direito nela, e só naquele momento.
- **Nada de código remoto.** Todas as bibliotecas vão no pacote da extensão, como exige o Manifest V3.

### Stack

- [WXT](https://wxt.dev/) — framework para extensões Manifest V3
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (modo `strict`)
- [PapaParse](https://www.papaparse.com/) — leitura e escrita de CSV
- [SheetJS](https://sheetjs.com/) — leitura de `.xlsx`
- [fflate](https://github.com/101arrowz/fflate) — `.zip` das partes e do `.xlsx` gerado
- [TanStack Virtual](https://tanstack.com/virtual) — grade virtualizada em linhas e colunas
- [Vitest](https://vitest.dev/) — testes unitários e de desempenho

## Testes

- `pnpm test` roda os testes unitários: detecção de encoding, delimitador, cabeçalho e tipos com os [arquivos de exemplo](tests/fixtures/README.md), ordenação, filtros, busca, resumo, encoder Windows-1252, **ida e volta** (exportar em cada formato e abrir de novo devolve os mesmos dados), correção de acentos e de problemas, anonimização (máscaras, pseudônimos com e sem senha, dados falsos válidos e sem repetição; SHA-256/HMAC conferidos com o `node:crypto`), **50 passos aleatórios desfeitos** que voltam exatamente ao original, e sessão salva no IndexedDB.
- `pnpm gen:fixtures && pnpm bench` mede o desempenho com 1 milhão de linhas. Medições num Mac com Apple Silicon:

| Operação | Tempo | Meta |
|---|---|---|
| Abrir (parse completo, ~150 MB) | 1,2 s | 15 s |
| Primeiras linhas na tela | 0,4 s | 2 s |
| Ordenar texto / número / data | 1,1 / 0,6 / 0,7 s | 2 s |
| Filtrar / buscar em todas as colunas | 0,3 / 1,2 s | 2 s |
| Resumo de uma coluna | 0,7 s | 2 s |
| Exportar Excel BR / Windows-1252 | 4,1 / 5,0 s | 10 s |
| Prévia de uma transformação numa coluna (espaços, CPF, telefone, data, número) | 0,4 a 0,7 s | 1 s |
| Aplicar a transformação | 0,5 a 1,6 s | 3 s |
| Dividir uma coluna | 0,7 s | 3 s |
| Anonimizar: prévia de mascarar CPF | 0,9 s | 1 s |
| Anonimizar: dado falso em 6 colunas pessoais (~6 milhões de valores) | 13,8 s | — |
| Dividir o arquivo em 10 partes num `.zip` | 7,4 s | — |
| Gerar `.xlsx` com 100 mil / 1 milhão de linhas | 2,3 / 21,6 s | — |

Na interface (Chrome, 1 milhão de linhas): editar uma célula leva ~0,5 s, desfazer ~0,45 s e restaurar a sessão salva ~1,3 s.

## Publicação

- `pnpm zip` gera `.output/ajeita-csv-<versão>-chrome.zip`, o pacote enviado à Chrome Web Store.
- O logo está em [assets/logo.svg](assets/logo.svg) (e `assets/logo-small.svg`, simplificado para 16 e 32 px). Os PNGs de `public/icon/` são gerados a partir deles.

## Contribuindo

- Cada funcionalidade é desenvolvida numa branch própria (`feat/...`, `fix/...`, `docs/...`) e entra na `main` por pull request.
- Mensagens de commit seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português: `feat(parse): detecta delimitador automaticamente`.
- O CI (GitHub Actions) roda verificação de tipos, testes e build em todo pull request; o PR só entra com tudo passando.

## Licença

[MIT](LICENSE) © 2026 Cosme Sousa
