# Próximas tarefas para cinco pessoas

Trabalhem em branches por tarefa, abrindo pull requests para `qa`. Depois dos testes em `qa`, integrem em `main`.

| Pessoa | Branch sugerida | Entrega | Critério de conclusão |
| --- | --- | --- | --- |
| 1 — Banco | `feature/banco-operacoes` | Migrações para depósito, compra e venda como operações atômicas no Postgres | Saldo, posição e histórico mudam juntos; erros não deixam alterações parciais |
| 2 — Auth | `feature/auth-contas` | Login/cadastro com Supabase Auth e fluxo de abertura de conta | Usuário autenticado abre/consulta sua conta; outro usuário não vê seus dados |
| 3 — Edge Functions | `feature/edge-api` | Rotas TypeScript para conta, ativos e operações, reutilizando as regras de domínio | Requisições autenticadas funcionam; entradas inválidas retornam erro claro |
| 4 — Frontend | `feature/frontend-carteira` | Telas de login, saldo, ativos, carteira e histórico | Usuário consegue navegar e consultar seus dados no navegador |
| 5 — Qualidade e integração | `feature/testes-integracao` | Testes de API, RLS, operações e documentação de execução | Cenários de dois usuários e saldo insuficiente passam; README permite reproduzir |

Ordem de integração: banco e Auth estabelecem a base; Edge Functions e frontend usam seus contratos; testes de integração validam o conjunto. As pessoas podem começar em paralelo, combinando nomes de tabelas e formato das respostas antes de integrar.
