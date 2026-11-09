# Corretora POO — Supabase

Backend de demonstração em TypeScript para Supabase Edge Functions. Usa Supabase Auth para identificar usuários, Postgres para guardar contas e operações, e classes de domínio para validar e apresentar os dados. **Dinheiro e cotações são simulados.**

## Estrutura

- `supabase/functions/corretora/index.ts`: entrada HTTP da Edge Function, com autenticação obrigatória.
- `supabase/functions/_shared/dominio.ts`: classes `Conta`, `Ativo`, `Posicao`, `Movimentacao`, `Dinheiro` e `Quantidade`.
- `supabase/functions/_shared/servico.ts`: classe `Corretora` e contrato do repositório.
- `supabase/functions/_shared/repositorio-supabase.ts`: consultas e chamadas RPC com o cliente Supabase do usuário.
- `supabase/migrations/`: tabelas, RLS e operações transacionais de abertura de conta, depósito, compra e venda.

Não há mais servidor Node local nem cadastro de usuário próprio. Cadastro e login são responsabilidade do Supabase Auth. A Edge Function aceita apenas usuário autenticado; as operações SQL identificam a conta por `auth.uid()` e não recebem um `conta_id` escolhido pelo cliente.

## Preparar e executar

Instale a [CLI do Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started) e tenha Docker disponível para usar a pilha local. Este repositório já contém `supabase/config.toml` e as migrações.

```powershell
npm install
npx supabase start
npx supabase db reset
npx supabase functions serve corretora
```

Para conectar a um projeto hospedado, primeiro faça login na CLI e vincule o *project ref*:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase functions deploy corretora
```

`db push` aplica as migrações no projeto vinculado; `functions deploy` publica a Edge Function. Revise o projeto de destino antes de executar esses comandos. O `project_id` em `config.toml` é apenas o nome da pilha local, não o *project ref* hospedado.

Este repositório ainda não está vinculado a um projeto hospedado; nenhuma migração ou função foi implantada no Supabase remoto.

## API

O caminho base é `/functions/v1/corretora`. Envie o JWT de sessão do Supabase Auth no cabeçalho `Authorization: Bearer <token>` e a chave publicável no cabeçalho `apikey` (o SDK `supabase.functions.invoke` cuida disso).

| Método | Caminho | JSON de entrada |
| --- | --- | --- |
| `GET` | `/ativos` | — |
| `POST` | `/conta` | `{}` |
| `GET` | `/conta` | — |
| `POST` | `/depositos` | `{"valor":"100.00"}` |
| `POST` | `/compras` | `{"codigo_ativo":"ACAO1","quantidade":"2"}` |
| `POST` | `/vendas` | `{"codigo_ativo":"ACAO1","quantidade":"1"}` |

Valores monetários e quantidades são texto decimal. A resposta da conta traz saldo, posições e as 100 movimentações mais recentes. Os preços `ACAO1` e `USD` são fixos e fictícios. O depósito adiciona saldo **simulado**, sem integração de pagamentos.

## Testes

```powershell
npm test
```

Os testes do Node verificam as classes de domínio e o serviço. Um teste completo das Edge Functions, RLS e transações SQL exige a pilha Supabase local ou um projeto de testes.

## Equipe

As tarefas sugeridas para cinco pessoas estão em `docs/plano-equipe.md`.
