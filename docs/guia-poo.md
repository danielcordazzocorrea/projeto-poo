# Guia de leitura da POO da corretora

Este guia mostra **em que ordem ler o código**. Os três arquivos da pasta
`supabase/functions/_shared/` agora têm comentários junto às linhas de lógica.
Leia um trecho por vez; não tente entender os arquivos inteiros de uma vez.

## 1. Antes da POO: siga uma compra

Imagine a entrada `{"codigo_ativo":"ACAO1","quantidade":"2"}`.

```text
Frontend ou cliente HTTP
  → Edge Function: escolhe a rota POST /compras
  → Corretora: valida código e quantidade
  → RepositorioSupabase: chama a função SQL comprar
  → Postgres: verifica saldo e grava saldo, posição e histórico
  → RepositorioSupabase: monta um objeto Conta atualizado
  → Conta.paraJson(): prepara a resposta da API
```

O frontend atual ainda não tem botão de compra. A rota da API já existe.
Depósito e venda seguem o mesmo desenho.

## 2. Leia `dominio.ts`: o vocabulário da corretora

Comece por `Dinheiro` e `Quantidade`. São **objetos de valor**: representam
valores e controlam quais valores são válidos.

| Entrada | Classe | Valor interno | Saída formatada |
| --- | --- | --- | --- |
| `"10.05"` | `Dinheiro.positivo` | `1005n` centavos | `"10.05"` |
| `"0.5"` | `Quantidade.positiva` | `500000n` micros | `"0.500000"` |

O `n` indica `bigint`. Guardar dinheiro em centavos inteiros evita erros de
arredondamento de números decimais. O construtor `private` obriga o restante
do código a usar `positivo()` ou `doBanco()`; assim, a classe controla como
nasce um objeto. Isso é **encapsulamento**.

Depois leia `Ativo`, `Posicao`, `Movimentacao` e `Conta`. Uma `Posicao` contém
um `Ativo` e uma `Quantidade`. Uma `Conta` contém um `Dinheiro`, várias
`Posicao` e várias `Movimentacao`. Objetos dentro de outros objetos são um
exemplo de **composição**. `paraJson()` transforma esses objetos na resposta
que a API envia.

As classes `RegraDeNegocio`, `NaoEncontrado` e `FalhaDePersistencia` dão nomes
a tipos diferentes de falha. Elas permitem que a Edge Function escolha a
resposta HTTP adequada.

## 3. Leia `servico.ts`: o que a corretora faz

`RepositorioCorretora` é uma **interface**. Ela diz quais operações de dados
uma implementação precisa oferecer, sem dizer como serão feitas.

`Corretora` é a classe de serviço. Ela recebe um repositório pelo construtor:

```ts
const corretora = new Corretora(repositorio);
```

Isso é **injeção de dependência**: quem cria `Corretora` escolhe o repositório.
No projeto publicado, ele é `RepositorioSupabase`. No teste, é um objeto
simples em memória. Por isso podemos testar as validações sem acessar a rede.

Leia `comprar()` em três perguntas:

1. O que chega? `codigo` e `quantidade` do tipo `unknown`: ainda não confiáveis.
2. O que é validado? `validarCodigo()` e `Quantidade.positiva()`.
3. O que acontece depois? O repositório faz a operação; o serviço consulta
   novamente a conta e devolve seu estado atualizado.

O serviço **não desconta saldo por conta própria**. A regra transacional fica
na função SQL `comprar`, porque saldo, posição e histórico precisam mudar
juntos no Postgres.

## 4. Leia `repositorio-supabase.ts`: a ponte com o banco

`RepositorioSupabase implements RepositorioCorretora` significa que a classe
cumpre as operações declaradas na interface. Esse arquivo é o **adaptador**
que traduz entre objetos POO e linhas do Postgres:

- `listarAtivos()` transforma linhas da tabela em objetos `Ativo`.
- `consultarConta()` lê conta, posições, movimentações e ativos; cria os
  objetos `Posicao`, `Movimentacao` e `Conta`.
- `depositar()`, `comprar()` e `vender()` chamam funções SQL por RPC.
- `verificarErro()` transforma erros do banco em erros do domínio.

As políticas RLS do banco limitam as leituras ao usuário autenticado. As
funções SQL usam `auth.uid()` para localizar a conta. O cliente não informa
qual conta de outro usuário deseja alterar.

## 5. Onde começa e onde termina a POO

| Arquivo | Responsabilidade |
| --- | --- |
| `frontend/main.ts` | Exibe a tela e envia cadastro, login e consulta. |
| `functions/corretora/index.ts` | Recebe HTTP, exige autenticação e chama `Corretora`. |
| `_shared/dominio.ts` | Define objetos, valores válidos e formato da resposta. |
| `_shared/servico.ts` | Coordena os casos de uso por uma interface. |
| `_shared/repositorio-supabase.ts` | Converte consultas e RPCs em objetos do domínio. |
| `migrations/*.sql` | Guarda dados, protege contas e executa operações atômicas. |

**Herança** é um recurso de POO que o projeto ainda não precisa. Aqui usamos
principalmente encapsulamento, composição, interface e injeção de dependência.

## 6. Exercícios curtos para conferir se entendeu

1. Em `Dinheiro.positivo('12.34')`, qual será o valor de `centavos`? Resposta:
   `1234n`.
2. Onde um código de ativo como `"acao1"` é recusado? Em
   `Corretora.validarCodigo()`.
3. Se trocarmos o Supabase por outro banco, qual arquivo é substituído?
   Principalmente a implementação do repositório; a interface e o serviço
   podem continuar iguais.
4. Onde a compra realmente desconta o saldo? Na função SQL `comprar`, na
   migração `20261109010000_operacoes_atomicas.sql`.

Se conseguir explicar essas quatro respostas sem olhar, você já entendeu o
fluxo central da POO deste projeto.
