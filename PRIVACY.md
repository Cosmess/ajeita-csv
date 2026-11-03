# Política de privacidade do Ajeita CSV

_Última atualização: 3 de novembro de 2026_

O Ajeita CSV é uma extensão para o Google Chrome que abre, corrige, limpa e cria arquivos CSV. **Todo o processamento acontece no seu navegador. Nenhum dado é enviado para servidores** — nem para o desenvolvedor, nem para terceiros.

## O que a extensão faz com os seus dados

- **Arquivos que você abre** (CSV, TXT, TSV, XLSX, JSON) são lidos e processados apenas no seu computador, dentro do navegador.
- **A extensão não faz nenhuma requisição de rede.** Não há servidor, conta, login, anúncios, análise de uso (analytics) nem rastreamento.
- **Nada é vendido, compartilhado ou transferido** para outras pessoas ou empresas.

## O que fica guardado no seu navegador

Para você poder continuar o trabalho depois de fechar o painel, a extensão guarda, **só no seu navegador**:

| O quê | Onde | Por quanto tempo |
|---|---|---|
| A **sessão de trabalho**: o arquivo aberto, os dados com as alterações feitas e o histórico de desfazer | IndexedDB da extensão | Até você abrir outro arquivo, usar **⚙ → Limpar dados salvos** ou desinstalar a extensão |
| A **última escolha de exportação** (formato, separador, encoding) | `chrome.storage.local` | Até você desinstalar a extensão |
| Dados de uma **tabela ou texto da página**, entre o clique no menu e a abertura no painel | `chrome.storage.session` | Apagados assim que o painel recebe os dados (e sempre ao fechar o navegador) |

Esses dados não saem do seu computador e não são sincronizados com a sua conta Google.

## Leitura de páginas da web

A extensão só lê o conteúdo de uma página **quando você pede**, clicando com o botão direito e escolhendo **Criar CSV desta tabela** ou **Criar CSV a partir da seleção**. Nesse momento ela lê apenas a tabela ou o texto selecionado daquela aba. A extensão não tem acesso permanente a nenhum site e não lê páginas em segundo plano.

## Permissões

| Permissão | Para quê |
|---|---|
| `sidePanel` | Mostrar a extensão no painel lateral do Chrome |
| `storage` | Guardar a última escolha de exportação e passar os dados da página para o painel |
| `contextMenus` | Criar os itens "Criar CSV desta tabela" e "Criar CSV a partir da seleção" no menu do botão direito |
| `activeTab` | Ler a aba atual somente no momento em que você usa um desses itens do menu |
| `scripting` | Executar, nessa aba e nesse momento, o código que lê a tabela ou o texto selecionado |

## Como apagar os dados

- **⚙ → Limpar dados salvos**, no painel da extensão, apaga a sessão guardada.
- **Desinstalar a extensão** apaga tudo o que ela guardou no navegador.

## Mudanças nesta política

Se esta política mudar, a nova versão será publicada neste mesmo endereço, com a data de atualização.

## Contato

Dúvidas ou problemas: abra uma issue em <https://github.com/Cosmess/ajeita-csv/issues>.
