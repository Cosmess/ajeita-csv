# Ficha da Chrome Web Store

Textos e respostas para preencher o painel de desenvolvedor da Chrome Web Store. As imagens estão nesta pasta.

## Pacote

1. `pnpm install && pnpm zip`
2. Enviar `.output/ajeita-csv-1.0.0-chrome.zip` em **Pacote → Fazer upload de nova versão**.

## Página na loja

**Nome:** Ajeita CSV

**Resumo** (até 132 caracteres; o mesmo do manifest):
> Ferramenta para abrir, corrigir, limpar e criar arquivos CSV, com foco no Brasil. Tudo é processado no seu navegador.

**Categoria:** Produtividade → Ferramentas

**Idioma:** Português (Brasil)

**Descrição:**

> Abra, corrija e limpe arquivos CSV direto no Chrome, sem instalar programas e sem enviar seus dados para lugar nenhum.
>
> O Ajeita CSV resolve os problemas mais comuns de quem trabalha com planilhas no Brasil:
>
> ✓ Acentos quebrados (JoÃ£o → João), com prévia antes de aplicar
> ✓ Arquivo com ";" que abre tudo numa coluna só: encoding, separador e cabeçalho detectados sozinhos
> ✓ CPF e CNPJ que perderam o zero à esquerda no Excel, com máscara ou sem, e validação do dígito verificador (inclusive o novo CNPJ alfanumérico)
> ✓ Telefones no padrão (11) 91234-5678 ou +5511912345678, tratando +55, 0 + operadora e o 9º dígito
> ✓ Datas e números em formatos misturados: dd/mm/aaaa ↔ ISO, 1.234,56 ↔ 1234.56, com ou sem R$
> ✓ CEP com ou sem hífen
> ✓ Linhas quebradas: aspas não fechadas, colunas a mais ou a menos, quebras de linha dentro de campo
> ✓ Espaços extras, linhas duplicadas, linhas e colunas vazias, maiúsculas e minúsculas, acentos
> ✓ Localizar e substituir, inclusive com expressões regulares
>
> Também dá para:
> • Ordenar, filtrar, buscar e ver o resumo de cada coluna
> • Editar células, dividir e juntar colunas, desfazer e refazer qualquer alteração
> • Criar CSV a partir de uma tabela ou de um texto selecionado em qualquer site (botão direito)
> • Converter JSON em CSV, achatando objetos aninhados
> • Exportar em CSV que abre certinho no Excel em português, CSV padrão, TSV, planilha do Excel (.xlsx) ou SQL (PostgreSQL, SQL Server e MySQL)
> • Dividir um arquivo grande em partes ou juntar vários arquivos num só
> • Abrir arquivos com 1 milhão de linhas sem travar
>
> Privacidade: todo o processamento acontece no seu navegador. A extensão não tem servidor, não faz requisições de rede e não coleta dados. O trabalho em andamento fica salvo só no seu navegador, para você continuar depois.

**Imagens:**

| Campo | Arquivo |
|---|---|
| Ícone da loja (128×128) | `public/icon/128.png` |
| Capturas de tela (1280×800) | `1-acentos.png`, `2-documentos.png`, `3-problemas.png`, `4-exportar.png` |
| Bloco promocional pequeno (440×280) | `banner-440x280.png` |

**Site:** https://github.com/Cosmess/ajeita-csv

**Política de privacidade:** https://github.com/Cosmess/ajeita-csv/blob/main/PRIVACY.md

## Práticas de privacidade

**Propósito único:**
> Ferramenta para abrir, corrigir, limpar e criar arquivos CSV no navegador.

**Justificativa das permissões:**

| Permissão | Justificativa |
|---|---|
| `sidePanel` | A interface da extensão fica no painel lateral do Chrome, ao lado da página, para o usuário trabalhar com a planilha sem trocar de aba. |
| `storage` | Guarda a última escolha de exportação do usuário (`chrome.storage.local`) e passa a tabela ou o texto lido da página para o painel lateral (`chrome.storage.session`). |
| `contextMenus` | Cria os itens "Criar CSV desta tabela" e "Criar CSV a partir da seleção" no menu do botão direito. |
| `activeTab` | Dá acesso à aba atual somente quando o usuário clica num desses itens do menu, para ler a tabela ou o texto escolhido. A extensão não pede acesso permanente a nenhum site. |
| `scripting` | Executa, na aba e no momento em que o usuário usa o menu, a função que lê a tabela (tratando células mescladas) ou o texto selecionado. |

**Código remoto:** Não. Todas as bibliotecas estão no pacote da extensão.

**Uso de dados:** marcar que a extensão **não coleta** nenhuma das categorias (informações de identificação, saúde, financeiras, autenticação, comunicações pessoais, localização, histórico da web, atividade do usuário, conteúdo do site). Os arquivos e tabelas abertos são processados localmente e nunca são transmitidos.

Declarações (marcar as três):
- Não vendo nem transfiro dados de usuários a terceiros fora dos casos de uso aprovados.
- Não uso nem transfiro dados de usuários para fins não relacionados ao propósito único do item.
- Não uso nem transfiro dados de usuários para determinar capacidade de crédito ou para fins de empréstimo.

## Antes de enviar

- [ ] Recarregar o build (`pnpm build`) e testar os menus do botão direito numa página real.
- [ ] Abrir um `.xlsx` exportado no Excel.
- [ ] Conferir que a política de privacidade abre pela URL acima.
