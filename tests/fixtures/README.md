# Arquivos de exemplo

Arquivos para testar o Ajeita CSV à mão e nos testes automáticos. Cada um cobre um caso específico; **o encoding, o BOM e a quebra de linha de cada arquivo são propositais**, não "corrija" ao editar.

Todos os dados são fictícios. Os CPFs e CNPJs foram gerados com dígitos verificadores calculados; os marcados como válidos passam na validação, mas não pertencem a ninguém.

## Abrir e detectar

| Arquivo | Encoding | Delimitador | O que testa |
|---|---|---|---|
| `clientes-utf8-virgula.csv` | UTF-8 | `,` | Caso básico; valores com vírgula decimal entre aspas |
| `clientes-windows1252-ponto-virgula.csv` | Windows-1252, CRLF | `;` | Arquivo salvo pelo Excel antigo; acentos precisam aparecer certos |
| `clientes-utf8-bom.csv` | UTF-8 com BOM, CRLF | `;` | Formato Excel BR; o BOM não pode aparecer no nome da 1ª coluna |
| `produtos.tsv` | UTF-8 | tab | Detecção de tab; códigos com zeros à esquerda (`0001`) |
| `produtos-pipe.txt` | UTF-8 | `\|` | Detecção de pipe em arquivo `.txt` |
| `sem-cabecalho.csv` | UTF-8 | `;` | Primeira linha já é dado (números e datas) |
| `somente-texto.csv` | UTF-8 | `,` | Tem cabeçalho, mas todas as colunas são texto |

## Corrigir

| Arquivo | O que testa |
|---|---|
| `mojibake.csv` | Acentos quebrados (`JoÃ£o`, `SÃ£o Paulo`, `â€™`, `â€œ`). A última linha já está correta e não pode ser alterada |
| `linhas-quebradas.csv` | Linha 2: quebra de linha dentro de campo (válido). Linha 3: colunas a mais. Linha 4: colunas a menos. Linha 5: aspas não fechadas |

## Formatar, limpar e validar

| Arquivo | O que testa |
|---|---|
| `sujeira.csv` | Espaços extras, maiúsculas/minúsculas misturadas, duplicadas, linha vazia, linha só com delimitadores, coluna vazia, e-mail inválido |
| `documentos-cpf-cnpj.csv` | CPF e CNPJ válidos e inválidos, com e sem máscara, zeros perdidos, notação científica, CNPJ alfanumérico (maiúsculas, minúsculas e DV errado) |
| `telefones.csv` | Todos os casos de normalização de telefone: `+55`, `55`, DDD 55, prefixo `0` + operadora, sem 9º dígito, fixo, sem DDD, `0800`, `190`, DDD inexistente |
| `datas-numeros.csv` | Datas BR, ISO e EUA, com hora; números BR e EUA; `R$`; CEPs com e sem hífen. A última linha tem valores inválidos de propósito (`29/02/2025`, `2025-02-30`) |

## Criar

| Arquivo | O que testa |
|---|---|
| `clientes-aninhado.json` | Objetos aninhados (`endereco.geo.lat`), arrays de texto, arrays de objetos, `null` e campos ausentes |
| `tabela-colspan-rowspan.html` | Abra no Chrome e use "Criar CSV desta tabela": cabeçalho em duas linhas, `rowspan` na região e `colspan` numa célula |

## Exportar e arquivos

| Arquivo | O que testa |
|---|---|
| `fora-windows-1252.csv` | Emoji, `₹` e `✓` não existem em Windows-1252 e devem ser avisados na exportação; `€` existe e deve passar |
| `juntar-parte-1.csv`, `juntar-parte-2.csv`, `juntar-parte-3.tsv` | Juntar arquivos com encodings (UTF-8 e Windows-1252), delimitadores, ordem e maiúsculas de colunas diferentes, coluna extra (`UF`) e coluna faltando (`cidade`) |
