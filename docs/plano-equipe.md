# Próximas tarefas para cinco pessoas

Trabalhem em branches por tarefa, abrindo pull requests para `qa`. Depois dos testes em `qa`, integrem em `main`.

| Pessoa | Branch sugerida | Entrega | Critério de conclusão |
| --- | --- | --- | --- |
| 1 — Banco | `feature/banco-validacao` | Aplicar as migrações e validar as RPCs e RLS com dois usuários | Saldo, posição e histórico mudam juntos; outro usuário não lê seus dados |
| 2 — Auth | `feature/auth-contas` | Login/cadastro com Supabase Auth e abertura de conta pela Edge Function | Usuário autenticado abre/consulta sua conta; sessão expirada é rejeitada |
| 3 — Edge Functions | `feature/edge-validacao` | Executar e ajustar a Edge Function no projeto Supabase | Rotas e erros funcionam com JWT real; nenhuma operação aceita conta de outro usuário |
| 4 — Frontend | `feature/frontend-carteira` | Telas de login, saldo, ativos, carteira e histórico | Usuário consegue navegar e consultar seus dados no navegador |
| 5 — Qualidade e integração | `feature/testes-integracao` | Testes de API, RLS, operações e documentação de execução | Cenários de dois usuários e saldo insuficiente passam; README permite reproduzir |

Ordem de integração: banco e Auth estabelecem a base; Edge Functions e frontend usam seus contratos; testes de integração validam o conjunto. As pessoas podem começar em paralelo, combinando nomes de tabelas e formato das respostas antes de integrar.
