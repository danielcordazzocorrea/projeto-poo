# Conta de investimentos simulada

A conta principal mantém seu saldo e moeda (`BRL`, `USD` ou `EUR`). Cada conta principal possui uma conta de investimentos vinculada, com saldo próprio sempre em **BRL** e posições em `public.posicoes_investimento`. A migração `20261115110000_conta_investimentos.sql` cria a conta para usuários existentes e um trigger cria automaticamente a conta de investimentos para novas contas principais.

## Transferências

- `GET /functions/v1/corretora/investimentos/conta` consulta o saldo, as posições e até 50 transferências recentes.
- `POST /functions/v1/corretora/investimentos/transferencias` recebe `{ "direcao": "PARA_INVESTIMENTOS", "valor": "10.00", "requisicao_id": "UUID" }`. A direção inversa é `PARA_PRINCIPAL`.
- O valor é expresso **na moeda da conta de origem**. Para investimentos, a origem é a moeda atual da conta principal. Para a conta principal, a origem é BRL.
- Quando as moedas diferem, o backend consulta a API de câmbio já usada pelo Pix, converte somente o valor transferido e preserva a moeda de cada conta. O comprovante registra valor de origem, valor de destino e horário da consulta à cotação.
- A RPC `transferir_conta_investimento` confere saldo e moeda, bloqueia as contas, debita, credita e grava o comprovante em **uma transação**. Falhas deixam ambos os saldos intactos. Reenviar o mesmo `requisicao_id` com o mesmo valor e direção devolve o comprovante anterior sem transferir novamente.
- O cliente autenticado só pode ler seus dados pela RLS. Apenas a Edge Function com `service_role` executa a RPC com as cotações; o navegador nunca fornece uma taxa de câmbio.

A tela em `frontend/investment-account.tsx` apresenta os dois saldos, transferência nos dois sentidos e histórico. Busca de ativos, compras e vendas com dados da brapi fazem parte de outra entrega e ainda não usam este saldo.

## Publicação

Aplicar a migração **antes** de publicar a Edge Function e o frontend. O projeto hospedado tem histórico de migrações diferente do local; verifique e reconcilie as versões remotas e faça um dry run antes de qualquer `db push`, conforme o `README.md`. Depois valide transferências BRL→BRL, USD/EUR→BRL, BRL→USD/EUR, saldo insuficiente, repetição da requisição e RLS com dois usuários.
