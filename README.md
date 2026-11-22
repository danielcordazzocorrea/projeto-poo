# tivvo

Site de corretora simulada. O frontend React é publicado na Vercel; autenticação, dados e operações ficam no Supabase. Os saldos e as negociações são simulados, sem movimentação de dinheiro real.

## O que o site oferece

- Cadastro e login com Supabase Auth.
- Conta principal com depósito simulado, histórico, Pix entre usuários e conversão de saldo entre BRL, USD e EUR.
- Conta de investimentos com saldo próprio em BRL. Transferências entre as contas convertem a moeda automaticamente quando necessário.
- Busca, cotação e histórico de preços de ativos pela brapi. Compras e vendas simuladas usam o saldo da conta de investimentos. Antes de uma compra, o usuário revisa quantidade, cotação, total e saldo e confirma a ordem; se a cotação mudar, precisa revisar novamente.
- Assistente com IA para consultar saldo, histórico e investimentos e preparar Pix com confirmação explícita no chat.

As cotações de mercado são referências e podem chegar com atraso. O depósito e o Pix do site não acessam bancos ou redes de pagamento.

## Onde fica cada parte

- `frontend/`: páginas e componentes React.
- `supabase/functions/corretora/`: API publicada como Supabase Edge Function.
- `supabase/functions/_shared/`: regras de negócio, acesso aos dados e integração com as APIs de cotação.
- `supabase/migrations/`: estrutura do banco, políticas de acesso e operações transacionais.

O navegador usa apenas a chave **publicável** do Supabase. A chave da brapi fica como segredo da Edge Function e não deve ser incluída no frontend nem no Git. A Vercel recebe suas variáveis de ambiente nas configurações do projeto; arquivos `.env` locais não são publicados pelo Git.

O assistente usa a chave `OPENAI_KEY` como segredo da Edge Function `corretora`, nunca como variável `VITE_`. A conta autenticada é consultada no servidor e o histórico recente é enviado à API da OpenAI para responder à pergunta. O modelo padrão é `gpt-5-mini` (opcionalmente `OPENAI_MODEL`). O chat não envia Pix por conta própria: ele prepara o valor e a chave, e o botão de confirmação chama a operação já existente. O assistente não faz simulações de operações.

As perguntas e respostas ficam na tabela `assistente_mensagens`, separadas por `usuario_id` e protegidas por RLS. O chat recupera até 100 mensagens ao abrir; a IA recebe somente as 12 mais recentes como contexto. O usuário pode apagar sua conversa pelo botão no chat. Rascunhos de Pix deixam de ficar ativos após recarregar a página.

O servidor recusa pedidos fora de assuntos bancários antes de consultar a conta. Pedidos ambíguos ou mistos passam por uma classificação de escopo e são recusados se incluírem outro assunto. A consulta da conta usa o JWT do usuário, as políticas RLS e uma conferência adicional do `usuario_id` retornado.

Na área de investimentos, o resultado das posições abertas compara seu custo médio remanescente com a cotação de referência consultada pela brapi. A tela mostra o valor aplicado, o valor estimado atual, a diferença e o total da conta incluindo saldo disponível. Vendas passadas, taxas e impostos não entram nesse resultado; se faltar cotação de algum ativo, o valor atual fica indisponível. A IA consulta o mesmo cálculo quando recebe perguntas sobre rendimento ou valor atual.

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
