# Mercado B3 com brapi

A área Investimentos consulta ações, ETFs e FIIs. O adaptador fica em
`supabase/functions/_shared/mercado-brapi.ts`, separado do serviço da conta.
Não há alteração de tabelas, RPCs ou preços usados nas compras e vendas simuladas.

## Contrato e rotas

Base: `/functions/v1/corretora`. As duas rotas exigem a sessão Supabase
(`Authorization: Bearer <JWT>` e `apikey` publicável), como a API existente.

- `GET /mercado/ativos?busca=PETR&pagina=1` retorna
  `{ ativos: [{ codigo, nome, tipo }], pagina, tem_proxima }`.
  Busca entre 2 e 80 caracteres; página inteira entre 1 e 1000.
- `GET /mercado/ativos/PETR4` retorna
  `{ codigo, nome, tipo, preco_brl, cotacao_em, consultado_em, fonte: "brapi" }`.
  `preco_brl` é texto decimal com duas casas; `cotacao_em` pode ser null.
  `consultado_em` registra a obtenção no backend e permanece igual no cache.

A listagem usa páginas de 20 do provedor e filtra tipos fora do escopo.
Por isso uma página pode ter menos de 20 itens, inclusive zero, e ainda permitir
avançar. Fundos sem subtipo informado não são classificados por suposição.
Tipos aceitos: stock/unit → ACAO, etf → ETF, fii → FII.
O detalhe confirma o tipo na listagem, procurando até 10 páginas para o ticker.

A documentação consultada em 15/11/2026 aponta a cotação atual para
`/api/v2/stocks/quote?symbols=PETR4`, com campos em `results[].data`.
A busca usa `/api/quote/list`. Apenas campos básicos são solicitados.
Referências: [listagem](https://brapi.dev/docs/acoes/list),
[cotação](https://brapi.dev/docs/acoes/cotacao).

## Segredo e ambiente de teste

1. Crie sua conta e chave gratuita no [painel brapi](https://brapi.dev/dashboard).
2. Para a pilha local, crie `supabase/.env.local` contendo `BRAPI_TOKEN=<sua-chave>`.
   Esse nome é ignorado pelo Git. Nunca use variável VITE, URL ou código-fonte
   para armazenar a chave.
3. Com Docker e a pilha Supabase local configurados, sirva a função:
   `npx supabase functions serve corretora --env-file supabase/.env.local`.
   Configure o frontend com URL e chave publicável desse mesmo ambiente.
4. Em um projeto hospedado de TESTE, cadastre `BRAPI_TOKEN` em
   Edge Functions → Secrets no painel Supabase. Alternativamente use
   `npx supabase secrets set --env-file supabase/.env.local --project-ref REF_DE_TESTE`.
   Revise o projeto antes de executar. A publicação da função é uma etapa separada:
   `npx supabase functions deploy corretora --project-ref REF_DE_TESTE`.

Não há migração nova. Leia o aviso do README sobre o histórico divergente do
projeto hospedado antes de qualquer operação de banco. Esta atividade não precisa de db push.

## Cache e falhas

Cache em memória por instância da Edge Function, limitado a 200 entradas:
5 minutos por busca/página e 1 minuto por ticker. Requisições simultâneas
iguais compartilham a chamada. Reinícios e instâncias distintas não compartilham
cache; ele não representa uma cota global. Erros não são armazenados.
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

A chave real ainda não foi fornecida/configurada; cobertura do plano gratuito
e interação no navegador permanecem pendentes de validação em ambiente de teste:

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
Os dados de mercado ainda não alimentam compra/venda: essa integração exige
validação de preço no servidor e registro de horário e fonte com a pessoa da conta.

Resultado nesta implementação: 25 testes passaram; build do frontend concluído.
Listagem pública de BOVA11 consultada sem token: type=fund e subType=etf confirmados.
A cotação autenticada e a cobertura da chave gratuita continuam pendentes.
