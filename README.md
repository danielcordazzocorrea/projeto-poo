# Corretora POO — Supabase

Projeto de demonstração em TypeScript com frontend básico e Supabase Edge Functions. Usa Supabase Auth para identificar usuários, Postgres para guardar contas e operações, e classes de domínio para validar e apresentar os dados. **Dinheiro e cotações são simulados.**

## Estrutura

- `supabase/functions/corretora/index.ts`: entrada HTTP da Edge Function, com autenticação obrigatória.
- `supabase/functions/_shared/dominio.ts`: classes `Conta`, `Ativo`, `Posicao`, `Movimentacao`, `Dinheiro` e `Quantidade`.
- `supabase/functions/_shared/servico.ts`: classe `Corretora` e contrato do repositório.
- `supabase/functions/_shared/repositorio-supabase.ts`: consultas e chamadas RPC com o cliente Supabase do usuário.
- `supabase/migrations/`: tabelas, RLS, conta criada automaticamente no cadastro e operações transacionais.
- `frontend/`: tela de cadastro, login e consulta da conta.

O cadastro usa Supabase Auth e também cria a conta da corretora com saldo zero por um trigger do banco. A Edge Function aceita apenas usuário autenticado; as operações SQL identificam a conta por `auth.uid()` e não recebem um `conta_id` escolhido pelo cliente.

## Frontend básico

Crie `.env.local` a partir de `.env.example` e preencha `VITE_SUPABASE_PUBLISHABLE_KEY` com a chave **publicável** (`sb_publishable_...`) do projeto `pzaakefnbhwlhatgzgea`. O arquivo local não é incluído no Git: cada ambiente precisa da própria configuração. Nunca coloque uma chave `secret` ou `service_role` no frontend. Reinicie o Vite após configurar; no ambiente publicado, configure as variáveis antes de gerar um novo build.

```powershell
npm install
npm run dev
```

Abra o endereço informado pelo Vite. O cadastro usa e-mail e senha. Se a confirmação de e-mail estiver ativada, o usuário confirma o e-mail antes de entrar; configure a URL local do frontend em **Authentication → URL Configuration → Redirect URLs** no painel do Supabase. Após o login, a tela consulta a conta automaticamente.

Para permitir cadastro sem e-mail de confirmação no projeto hospedado, abra **Authentication → Sign In / Providers → Email** no painel do Supabase e desative **Confirm Email**. Essa é uma configuração do Supabase Auth, não uma migração SQL. Com ela desligada, o cadastro devolve uma sessão e o frontend abre a conta imediatamente. O endereço informado pelo usuário fica sem verificação.

## Preparar e executar

Instale a [CLI do Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started) e tenha Docker disponível para usar a pilha local. Este repositório já contém `supabase/config.toml` e as migrações.

```powershell
npm install
npx supabase start
npx supabase db reset
npm run dev:edge
```

Para conectar a um novo projeto hospedado, primeiro faça login na CLI e vincule o *project ref*:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase functions deploy corretora
```

`db push` aplica as migrações no projeto vinculado; `functions deploy` publica a Edge Function. Revise o projeto de destino antes de executar esses comandos. O `project_id` em `config.toml` é apenas o nome da pilha local, não o *project ref* hospedado.

O projeto hospedado `pzaakefnbhwlhatgzgea` já tem as tabelas iniciais, as operações, o gatilho de cadastro e a Edge Function `corretora` implantados. As tabelas iniciais foram criadas antes do registro de migrações no Supabase. Portanto, **não execute `db push` nesse projeto existente** sem antes reconciliar o histórico de migrações, pois a migração inicial tentará criar tabelas que já existem. A CLI local também não está vinculada a esse projeto.

## API

O caminho base é `/functions/v1/corretora`. Envie o JWT de sessão do Supabase Auth no cabeçalho `Authorization: Bearer <token>` e a chave publicável no cabeçalho `apikey` (o SDK `supabase.functions.invoke` cuida disso).

| Método | Caminho | JSON de entrada |
| --- | --- | --- |
| `GET` | `/ativos` | — |
| `POST` | `/conta` | `{}` (recuperação de usuário antigo sem conta) |
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

## Entender a POO

Leia `docs/guia-poo.md` na ordem indicada. Os arquivos `dominio.ts`,
`servico.ts` e `repositorio-supabase.ts` têm comentários explicando as linhas
de lógica e a relação entre classes, serviço e banco.
