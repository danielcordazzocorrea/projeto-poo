# Mercado B3 com brapi

A área Investimentos consulta ações, ETFs e FIIs. O adaptador fica em
`supabase/functions/_shared/mercado-brapi.ts`, separado do serviço da conta.
Não há alteração de tabelas, RPCs ou preços usados nas compras e vendas simuladas.

## Contrato e rotas

Base: `/functions/v1/corretora`. As rotas exigem a sessão Supabase
(`Authorization: Bearer <JWT>` e `apikey` publicável), como a API existente.

- `GET /mercado/ativos?busca=PETR&pagina=1` retorna
  `{ ativos: [{ codigo, nome, tipo }], pagina, tem_proxima }`.
  Busca entre 2 e 80 caracteres; página inteira entre 1 e 1000.
- `GET /mercado/ativos/PETR4` retorna
  `{ codigo, nome, tipo, preco_brl, cotacao_em, consultado_em, fonte: "brapi" }`.
  `preco_brl` é texto decimal com duas casas; `cotacao_em` pode ser null.
  `consultado_em` registra a obtenção no backend e permanece igual no cache.
- `GET /mercado/ativos/PETR4/historico?periodo=1mo` retorna
  `{ codigo, periodo: "1mo", intervalo: "1d", pontos: [{ data: "2026-11-13", preco_brl: "42.50" }], consultado_em, fonte: "brapi" }`.
  O período padrão é `1mo`. Aceita `1d`, `5d`, `1mo`, `6mo`, `ytd`, `1y`, `5y` e `max`.
  Os intervalos solicitados são, respectivamente, `5m`, `60m`, `1d`, `1d`, `1d`, `1d`, `1wk` e `1mo`.
  Se o plano recusar `5m` ou `60m`, a função tenta novamente com pontos diários (`1d`)
  e informa esse intervalo na resposta.
  Nos períodos intradiários, `data` é ISO UTC com horário; nos demais, `YYYY-MM-DD`.
  A interface exibe horários de Brasília. Datas ficam em ordem crescente, sem
  duplicatas; preços nulos são omitidos, sem interpolar lacunas. Uma série vazia
  representa ausência de dados. Formato inválido gera erro, sem inventar preços.

O histórico usa `/api/v2/stocks/historical` com `symbols`, `range` selecionado,
`interval` definido pelo período e `sortOrder=asc`. O endpoint geral atende ações, ETFs e FIIs,
conforme a cobertura da chave. A fonte do gráfico é `close`, que pode conter
ajustes do provedor; não é uma série de retorno calculada pela aplicação.
Referência: [histórico de preços](https://brapi.dev/docs/acoes/historico).

O frontend carrega o histórico de um mês ao selecionar um ativo, em requisição
separada da cotação, sem atualização automática. Uma falha exibe mensagem e
botão para tentar novamente. Trocar de ativo cancela a consulta anterior e
descarta respostas antigas. O gráfico SVG não adiciona dependências; permite
explorar preços por ponteiro ou controle de datas pelo teclado. Não há tabela de preços.
Na interface, apenas `1 M` aparece. A API ainda aceita os períodos listados acima.
Uma negativa HTTP 400 da brapi para período longo retorna 422
`PERIODO_INDISPONIVEL`, explicando a possível restrição do plano. Nos períodos
curtos, somente o intervalo pode cair para `1d`; a janela solicitada é preservada.
403 continua como `ACESSO_NEGADO`.
Respostas cujo período difere do solicitado ou cujo intervalo difere do efetivamente enviado são rejeitadas.

A listagem usa páginas de 20 do provedor e filtra tipos fora do escopo.
Por isso uma página pode ter menos de 20 itens, inclusive zero, e ainda permitir
avançar. Tickers fracionários com sufixo F são filtrados, pois o detalhe aceita apenas o ticker padrão. Fundos sem subtipo informado não são classificados por suposição.
Tipos aceitos: stock/unit → ACAO, etf → ETF, fii → FII.
O detalhe confirma o tipo na listagem, procurando até 10 páginas para o ticker.

A documentação consultada em 15/11/2026 aponta a cotação atual para
`/api/v2/stocks/quote?symbols=PETR4`, com campos em `results[].data`.
A busca usa `/api/quote/list`. Apenas campos básicos são solicitados.
Referências: [listagem](https://brapi.dev/docs/acoes/list),
[cotação](https://brapi.dev/docs/acoes/cotacao).

## Segredo e publicação

`BRAPI_TOKEN` fica em Edge Functions → Secrets no projeto Supabase hospedado.
Nunca use variável VITE, URL ou código-fonte para armazenar a chave. A função
`corretora` é publicada pela CLI com `--use-api`, sem infraestrutura local.

## Cache e falhas

Cache em memória por instância da Edge Function, limitado a 200 entradas:
5 minutos por busca/página, 1 minuto por cotação, 5 minutos por histórico intradiário
e 1 hora para os demais históricos. A chave inclui ticker, período e intervalo. Requisições simultâneas
iguais compartilham a chamada. Reinícios e instâncias distintas não compartilham
cache; ele não representa uma cota global. Erros não são armazenados.
As chamadas à brapi são serializadas por instância para respeitar planos que
permitem uma única requisição simultânea.
Um 429 suspende novas chamadas nessa instância pelo Retry-After em segundos
(até uma hora), ou por 60 segundos quando ausente/inválido.

Timeout de 8 segundos, incluindo a leitura do JSON.
Somente os headers RateLimit-Limit, RateLimit-Remaining e RateLimit-Reset são
registrados, quando presentes. O token é enviado no header Authorization
somente para brapi.dev; redirecionamentos são rejeitados.

Respostas: 400 entrada inválida; 404 ativo/cotação inexistente; 429 limite;
502 falha de rede/provedor, formato ou preço indisponível; 503 segredo ausente,
credencial inválida ou acesso negado pelo plano; 504 timeout.
O corpo contém `erro` e `codigo`, sem conteúdo bruto do provedor.

## Validação

Automatizada: `npm test` e `npm run build:front`.
Os testes usam respostas simuladas e não consomem a cota brapi.
Eles cobrem tipos, paginação, campos ausentes, horários, cache e concorrência,
erros HTTP, timeout, rede, entradas inválidas e o handler de rotas.
A autenticação completa exige a Edge Function em execução.

A chave real foi configurada e validada em 15/11/2026. A lista abaixo mantém o roteiro de verificação manual no navegador:

- Entre na aplicação e abra Investimentos; busque PETR e Petrobras.
- Teste PETR4 (ação), BOVA11 (ETF) e HGLG11 (FII), registrando quais o plano libera.
  Esses são casos de teste, não garantia de cobertura.
- Confira preço, tipo, moeda, horário da cotação e horário da consulta.
  Se o provedor omitir o horário, deve aparecer “Não informado pelo provedor”.
- Verifique busca rápida, paginação, ausência de resultados e troca rápida de ativo.
- Confira 401/403 e 429 em ambiente controlado, sem esgotar deliberadamente a cota.
- Confira que a chave brapi não aparece na rede do navegador, bundles ou logs.
- Verifique que as rotas rejeitam chamadas sem sessão válida.
- Consulte consumo e renovação no [painel de cobrança](https://brapi.dev/dashboard/billing)
  antes da apresentação. Confirme ali a cota e o atraso do seu plano.

Não há atualização automática por segundo. A tela informa que há atraso,
possivelmente de cerca de 30 minutos no plano gratuito, e exibe o horário da fonte.
O preço da cotação consultada no servidor é usado nas compras e vendas simuladas
da conta de investimentos.

O histórico acrescenta testes de ordenação, cache de uma hora, chamadas simultâneas,
ETF/FII, séries vazias, lacunas, dados inválidos, isolamento de falhas e rota HTTP.
Para verificar a interface, selecione um ativo e explore o gráfico de um mês pelo mouse
ou controle de datas; repita com janela estreita e tema escuro. Em uma
troca rápida de ativo, não devem aparecer preços do ativo anterior.

## Validação real em 15/11/2026

BRAPI_TOKEN foi cadastrado como segredo no projeto Supabase pzaakefnbhwlhatgzgea, e a função corretora foi publicada via API. O frontend local recebeu a chave publicável real do mesmo projeto. Os arquivos .env.local e supabase/.env.local permanecem ignorados pelo Git. O comando npm run dev:edge agora carrega o arquivo de segredo explicitamente.

| Consulta | API brapi direta | Edge Function com sessão |
| --- | --- | --- |
| Busca por PETR / Petrobras | 200 nas duas buscas | 200 para Petrobras |
| PETR4 — ação | 200 | 200 |
| BOVA11 — ETF | 200 | 200 |
| HGLG11 — FII | 200 | 200 |

As três cotações retornaram preço em BRL, tipo, fonte e horários. Isso confirma esses tickers com esta chave, sem garantir toda a cobertura do plano. Os headers de limites foram recebidos e registrados sem token. A busca hospedada omitiu corretamente os tickers fracionários.

A chamada sem sessão retornou 401. O teste autenticado usou um usuário temporário, removido ao terminar, sem envio de e-mail ou operações financeiras. Não foram aplicadas migrações de banco. A navegação visual no navegador ainda deve ser conferida pelo usuário.
