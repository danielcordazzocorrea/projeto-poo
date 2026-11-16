# Integração de ativos com a brapi

Este arquivo é para quem vai implementar a **busca e a consulta de ativos da B3** na tivvo. A conta, o saldo, as compras e as vendas simuladas ficam com outra pessoa.

## Objetivo

Permitir que o usuário pesquise ações, ETFs e FIIs por nome ou ticker e veja os dados disponíveis na [brapi](https://brapi.dev/docs), incluindo preço em BRL e horário da cotação. No plano gratuito, a cotação de ações tem [atraso aproximado de 30 minutos](https://brapi.dev/faq/qual-a-diferenca-real-no-atraso-delay-dos-dados-entre-os-planos). Mostre o horário e não apresente esse preço como cotação em tempo real.

## Onde começar no projeto

- A API existente está em `supabase/functions/corretora/index.ts` e exige usuário autenticado.
- `GET /functions/v1/corretora/ativos` hoje lê `public.ativos`, que contém apenas ativos de demonstração com preços fixos.
- A tela de investimentos em `frontend/account-home.tsx` ainda mostra “Em breve”.
- `supabase/functions/_shared/servico.ts` contém o serviço da corretora. Crie o adaptador da brapi em um módulo próprio dentro de `_shared`, sem misturar busca de mercado com regras de saldo.

## Sua entrega

1. Crie uma chave gratuita da brapi e guarde-a como **segredo da Edge Function**. Nunca coloque a chave no frontend, em variável `VITE_*`, na URL, no Git ou nos logs.
2. Implemente a busca por nome/ticker usando a [API de listagem](https://brapi.dev/docs/acoes/list). Adicione debounce na interface de busca e um tamanho mínimo para evitar uma chamada a cada tecla.
3. Implemente a consulta de um ticker usando a [API de cotação](https://brapi.dev/docs/acoes/cotacao). Confirme com a chave real quais tickers, tipos de ativo e campos o plano gratuito libera. Não dependa de campos que não estejam disponíveis nesse plano.
4. Normalize a resposta no backend. Combine com quem cuida da conta o contrato abaixo antes de integrar compra ou venda:

   ```ts
   type CotacaoAtivo = {
     codigo: string;
     nome: string;
     tipo: 'ACAO' | 'ETF' | 'FII';
     preco_brl: string;          // Ex.: "32.50"
     cotacao_em: string | null;  // Horário informado pelo provedor, se existir
     consultado_em: string;      // Horário em que nosso backend obteve o dado
     fonte: 'brapi';
   };
   ```

5. Proponha as rotas `GET /mercado/ativos?busca=PETR` e `GET /mercado/ativos/PETR4` na Edge Function. A primeira devolve resultados resumidos e paginados; a segunda, detalhes e cotação normalizados. **Essas rotas ainda não existem.**
6. Faça cache no backend por busca/ticker. Trate ticker inexistente, preço ausente, timeout, falha da brapi, token inválido e `429` por limite. Não invente preço nem transforme o horário da consulta no horário da cotação.
7. Registre os headers `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset` quando presentes, sem registrar o token. O plano gratuito tem [15.000 requisições por ciclo](https://brapi.dev/pricing); o [painel da brapi](https://brapi.dev/dashboard/billing) mostra consumo e data de renovação. Confiram a cota antes da apresentação. Evitem consultar a mesma cotação a cada segundo, pois isso não elimina o atraso dos dados.
8. Entregue testes do adaptador com respostas simuladas e valide manualmente a busca e a cotação com uma chave real em ambiente de teste.

## Limites da sua parte

Não altere `public.contas`, `public.posicoes`, `public.movimentacoes` nem as RPCs de compra/venda. Não substitua `public.ativos.preco_centavos` por um valor recebido do navegador. O preço usado em uma operação simulada deverá ser validado **no backend**, com o horário e a fonte registrados; essa integração será feita junto com quem implementa a conta.

Trabalhe em uma branch criada a partir de `qa`, por exemplo `feature/mercado-brapi`, e abra um PR para `qa`. Se a implementação exigir alteração em `index.ts` ou em tipos compartilhados, combine a mudança com a outra pessoa antes de editar. O projeto Supabase hospedado tem histórico de migrações diferente do local; consulte o `README.md` antes de qualquer publicação ou `db push`.
