# Saldo em BRL, USD e EUR

Esta é uma conta de demonstração: o saldo é simulado, sem dinheiro real ou Pix do sistema bancário. Cada conta tem um único saldo e uma moeda atual (`BRL`, `USD` ou `EUR`), ambos persistidos em `contas`. Contas antigas começam em BRL. A coluna histórica `saldo_centavos` passa a representar centavos da moeda atual.

## Cotações

A Edge Function consulta `https://api.coinbase.com/v2/exchange-rates?currency=USD` em cada conversão com saldo positivo e em cada Pix entre moedas diferentes, com cache de até 30 segundos por instância. A [documentação oficial da Coinbase](https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates) descreve o endpoint público sem autenticação e as taxas atuais por unidade da moeda base. Não há cotação fixa no banco ou no frontend.

O backend rejeita resposta incompleta, cotação não positiva, falha ou limite da API; nesse caso, nenhum saldo é alterado. A resposta da Coinbase não informa o horário de atualização da própria taxa. O horário registrado é o da consulta, não o da última negociação. A API publica cotações atuais, mas a documentação não promete atualizações a cada segundo nem uso ilimitado.

A Coinbase informa BRL e EUR por USD. O sistema deriva EUR/BRL dessas duas taxas e usa a mesma taxa de referência nos dois sentidos, sem spread da aplicação. BRL vale 1 na fórmula. O cálculo é feito com `numeric` no PostgreSQL, sem ponto flutuante e com truncamento para centavos. USD para EUR passa por BRL usando as duas taxas da mesma resposta da API.

## Operações

- `GET /conta` devolve `saldo`, `moeda_saldo` e `saldo_brl` (nulo se a conta estiver em USD ou EUR).
- `POST /conta/converter` com `{ "moeda": "EUR" }` converte **todo** o saldo para a moeda selecionada e a salva na conta. Saldo zero pode mudar de moeda sem cotação.
- `POST /pix/transferencias` com `{ "chave_destino": "pessoa@exemplo.com", "valor": "10.00" }` interpreta o valor na moeda atual do remetente. O destinatário recebe na moeda atual da própria conta. A resposta inclui `comprovante` com o valor recebido, a moeda e o horário da consulta.

O frontend mostra a moeda atual junto ao saldo e no formulário de Pix. Depósitos e operações de investimento existentes usam BRL e exigem converter o saldo de volta para BRL antes. O Pix entre contas na mesma moeda continua funcionando sem depender da API de câmbio.

A Edge Function verifica o usuário autenticado, busca as cotações e chama as novas RPCs com o cliente administrativo. As RPCs que aceitam cotações não são executáveis por `authenticated`; assim, o usuário não pode inventar uma taxa. A conversão e cada Pix bloqueiam as contas, conferem se as moedas não mudaram durante a consulta e alteram saldo e histórico na mesma transação. Se houver falha, o banco desfaz a operação.

## Publicação

A migração `20261115100000_saldo_moeda_cotacao_api.sql` deve ser aplicada **antes** da nova Edge Function e do frontend. O projeto hospedado contém migrações antigas com versões diferentes das locais, portanto `db push` na raiz do repositório pode tentar reconciliar um histórico que não corresponde aos arquivos. Confira a lista remota e faça um dry run que mostre apenas esta migração antes de publicar.

`npm test` verifica a integração da camada de serviço, validação da resposta da API e apresentação dos valores. `tests/sql/cotacoes.test.sql` verifica os cálculos e permissões no PostgreSQL. Para o teste SQL completo, use uma pilha Supabase de teste; nunca aplique o teste à produção como migração.
