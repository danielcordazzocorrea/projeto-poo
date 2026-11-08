# Corretora POO — backend em TypeScript

API local de demonstração com classes para cliente, conta, ativo, posição e movimentação. Preços e depósitos são simulados. Os dados ficam em memória e somem ao desligar o servidor.

## Executar

Requer Node.js 22 ou superior:

```powershell
npm install
npm run dev
```

A API fica em `http://127.0.0.1:8000`.

## Rotas

| Método | Rota | JSON de entrada |
| --- | --- | --- |
| `GET` | `/ativos` | — |
| `POST` | `/clientes` | `{"nome":"Ana"}` |
| `POST` | `/contas` | `{"cliente_id":"<id do cliente>"}` |
| `GET` | `/contas/<id>` | — |
| `POST` | `/contas/<id>/depositos` | `{"valor":"100.00"}` |
| `POST` | `/contas/<id>/compras` | `{"codigo_ativo":"ACAO1","quantidade":"2"}` |
| `POST` | `/contas/<id>/vendas` | `{"codigo_ativo":"ACAO1","quantidade":"1"}` |

Exemplo no PowerShell, com o servidor aberto em outro terminal:

```powershell
$cliente = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/clientes -ContentType 'application/json' -Body '{"nome":"Ana"}'
$conta = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/contas -ContentType 'application/json' -Body (ConvertTo-Json @{ cliente_id = $cliente.id })
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/contas/$($conta.id)/depositos" -ContentType 'application/json' -Body '{"valor":"100.00"}'
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/contas/$($conta.id)/compras" -ContentType 'application/json' -Body '{"codigo_ativo":"ACAO1","quantidade":"2"}'
Invoke-RestMethod -Uri "http://127.0.0.1:8000/contas/$($conta.id)"
```

Valores monetários e quantidades são enviados como texto decimal para preservar a precisão. Compras exigem saldo suficiente; vendas exigem posição suficiente.

## Testes

```powershell
npm test
```

## Próxima etapa

Substituir `RepositorioEmMemoria` por persistência no Supabase e adicionar autenticação antes de expor a API ou ligar um frontend. Compra e venda deverão persistir saldo, posição e movimentação em uma única transação no banco.

