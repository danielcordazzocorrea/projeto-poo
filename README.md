# tivvo

Site de corretora simulada. O frontend React é publicado na Vercel; autenticação, dados e operações ficam no Supabase. Os saldos e as negociações são simulados, sem movimentação de dinheiro real.

## O que o site oferece

- Cadastro e login com Supabase Auth.
- Conta principal com depósito simulado, histórico, Pix entre usuários e conversão de saldo entre BRL, USD e EUR.
- Conta de investimentos com saldo próprio em BRL. Transferências entre as contas convertem a moeda automaticamente quando necessário.
- Busca, cotação e histórico de preços de ativos pela brapi. Compras e vendas simuladas usam o saldo da conta de investimentos.
- Assistente visual na interface.

As cotações de mercado são referências e podem chegar com atraso. O depósito e o Pix do site não acessam bancos ou redes de pagamento.

## Onde fica cada parte

- `frontend/`: páginas e componentes React.
- `supabase/functions/corretora/`: API publicada como Supabase Edge Function.
- `supabase/functions/_shared/`: regras de negócio, acesso aos dados e integração com as APIs de cotação.
- `supabase/migrations/`: estrutura do banco, políticas de acesso e operações transacionais.

O navegador usa apenas a chave **publicável** do Supabase. A chave da brapi fica como segredo da Edge Function e não deve ser incluída no frontend nem no Git. A Vercel recebe suas variáveis de ambiente nas configurações do projeto; arquivos `.env` locais não são publicados pelo Git.

## Desenvolvimento do frontend

Crie `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, usando os valores publicáveis do projeto hospedado. Depois execute:

```powershell
npm install
npm run dev
```

`npm run build:front` gera o frontend em `web-dist/`. `npm test` executa os testes de TypeScript.

## Publicação

O projeto Supabase hospedado é `pzaakefnbhwlhatgzgea`. A Edge Function é `corretora`. Alterações nas funções são publicadas com a CLI do Supabase vinculada a esse projeto; alterações no frontend são publicadas pela Vercel.

As tabelas iniciais do projeto hospedado foram criadas antes do registro de migrações. **Não execute `supabase db push` nesse projeto** sem reconciliar o histórico: ele pode tentar recriar tabelas existentes. Para uma correção de banco, revise e aplique apenas o SQL necessário no projeto hospedado.
