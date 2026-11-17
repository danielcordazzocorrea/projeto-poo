# Experimento Yahoo Finance

Implementação iniciada em `experiment/yahoo-finance` e integrada à `feature/mercado-brapi`.

## Integração publicada em 17/11/2026

O frontend normal agora consulta `GET /functions/v1/yahoo-historico?ticker=BBAS3&periodo=6mo`
no projeto definido por `VITE_SUPABASE_URL`, enviando `apikey` publicável e o JWT da sessão.
A função já publicada foi validada; não foi necessário republicá-la nesta etapa.
Busca, cotação e operações continuam na função `corretora` e na brapi.
O seletor normal libera os períodos longos do Yahoo e remove os cadeados do plano brapi.
`3 M` permanece fora da interface. Não há troca silenciosa para brapi em caso de erro.

Para testar esse fluxo, rode `npm.cmd run dev` e faça login no endereço do Vite.
O build normal também usa a função Yahoo; a publicação do frontend é uma etapa separada.
Não é necessário secret ou chave Yahoo. A função exige uma sessão válida.

## Executar

Com Node 22 ou superior, instale as dependências com `npm.cmd ci` e configure
`.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto
usado para login. Não é necessária uma chave Yahoo nem BRAPI_TOKEN para o histórico.

```powershell
npm.cmd run dev:yahoo
```

Abra http://127.0.0.1:5174 e entre na conta. Em Investimentos, busque um ativo e
selecione o período. O seletor experimental libera períodos longos para todos os
ativos, sem os cadeados específicos do plano da brapi. A opção 3 M continua fora
da interface, conforme a decisão anterior. O Yahoo ainda pode negar dados ou não
ter cobertura para um ticker/período; nesses casos o gráfico exibe erro e permite
tentar novamente. Não há troca silenciosa de provedor.

## Fontes e isolamento

- Busca e cotação: brapi, pela função `corretora` que já está publicada.
- Histórico: Yahoo Finance, por `yahoo-finance2@4.0.6` no servidor local.
- Operações financeiras: integração existente, sem alteração de regras ou preços.
- A nota do gráfico identifica a fonte efetivamente recebida.

O modo `yahoo-test` habilita `/api/yahoo-history` no Vite. O navegador envia a sessão
ao servidor local, que verifica o JWT no Supabase antes de consultar o histórico.
O token Supabase não é enviado ao Yahoo. Os símbolos B3 viram `TICKER.SA`; são
aceitos apenas preços BRL. Cache em memória por ticker/período, de cinco minutos
para intradiário e uma hora para os demais; fila de consultas, limite de entradas
e compartilhamento de chamadas simultâneas reduzem requisições repetidas.

`npm.cmd run dev:yahoo` continua usando o middleware local, como alternativa para diagnóstico.
O middleware local não existe no site hospedado após um build comum.
A biblioteca Yahoo fica no servidor, fora do bundle do navegador.

## Edge Function independente

Há uma função independente `yahoo-historico`, autenticada com `withSupabase`,
reutilizando o mesmo adaptador. Ela não substitui `corretora`. O usuário publicou
a versão 1, confirmada como ACTIVE em 17/11/2026. A validação autenticada via
cliente HTTP do frontend retornou 128 pontos de seis meses para BBAS3, BOVA11 e
HGLG11. A conta temporária usada no teste foi removida sem envio de e-mail ou
operações financeiras. Sem sessão, a função retornou 401; o preflight CORS retornou
204 com origem permitida. A tela após login ainda deve ser conferida pelo usuário.

## Verificação

```powershell
npm.cmd test
npm.cmd run build:front
node scripts/verificar-yahoo.mjs
```

O último comando exige `npm.cmd test` ou build TypeScript prévio e consulta dados
reais, sem fazer operações financeiras. Em 17/11/2026, a verificação de seis meses
retornou 128 pontos para BBAS3, BOVA11 e HGLG11, entre 18/05 e 17/11/2026. BBAS3
falhou na primeira execução e funcionou na repetição. A rota local respondeu 401
sem sessão e o site respondeu 200. A navegação completa após login deve ser
conferida pelo usuário; não foram feitas compras, vendas ou transferências.

Yahoo Finance é acesso não oficial, sem garantia de estabilidade ou cobertura.
Referência da biblioteca: https://github.com/gadicc/yahoo-finance2
