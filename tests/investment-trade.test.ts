import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvestmentTradeError, requestInvestmentTrade, type TradeOperation } from '../frontend/investment-trade.ts';
import { mapAccountError } from '../frontend/account-errors.ts';

const input = { url: 'https://trade.example', apiKey: 'test-key', token: 'test-token', ticker: 'PETR4', quantity: '2', requestId: 'existing-request-id' };
const account = { saldo: '0.00', moeda: 'BRL', acoes_investidas: '50.00', posicoes: [{ codigo_ativo: 'PETR4', quantidade: '2' }], transferencias: [] };

const receipt = { id: 'receipt-1', codigo_ativo: 'PETR4', quantidade: '2', preco_unitario: '25.00', total_pago: '50.00', cotacao_em: null, criada_em: '2026-11-16T12:00:00Z' };
const purchase = { conta: account, comprovante: receipt };

test('compra e venda preservam contrato e identificador existente, sem repetir a operação', async () => {
  for (const operation of ['purchase', 'sale'] as const) {
    let calls = 0;
    const result = await requestInvestmentTrade({ ...input, operation }, async (url, init) => {
      calls++;
      assert.equal(url, `https://trade.example/functions/v1/corretora/investimentos/${operation === 'purchase' ? 'compras' : 'vendas'}`);
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
      assert.equal(new Headers(init?.headers).get('apikey'), 'test-key');
      assert.deepEqual(JSON.parse(String(init?.body)), { codigo_ativo: 'PETR4', quantidade: '2', requisicao_id: input.requestId });
      return Response.json(operation === 'purchase' ? purchase : account);
    });
    assert.deepEqual(result, operation === 'purchase' ? purchase : account);
    assert.equal(calls, 1);
  }
});

test('compra confirmada envia o preço revisado e a venda não envia preço confirmado', async () => {
  for (const operation of ['purchase', 'sale'] as const) {
    await requestInvestmentTrade({ ...input, operation, confirmedPrice: '25.00' }, async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.preco_confirmado, operation === 'purchase' ? '25.00' : undefined);
      return Response.json(operation === 'purchase' ? purchase : account);
    });
  }
  assert.equal(mapAccountError('A cotação mudou. Confira o preço atualizado antes de confirmar a compra.',
    { operation: 'purchase', outcome: 'rejected' }).title, 'Preço atualizado');
});

test('saldo insuficiente na compra e quantidade indisponível na venda permitem correção', async () => {
  const scenarios: [TradeOperation, string, string][] = [
    ['purchase', 'Saldo insuficiente na conta de investimentos', 'Saldo insuficiente para comprar'],
    ['sale', 'Quantidade indisponível para venda', 'Quantidade indisponível'],
    ['purchase', 'Quantidade está fora do limite permitido.', 'Confira a quantidade'],
    ['sale', 'Quantidade aceita até 6 casas decimais.', 'Confira a quantidade'],
    ['sale', 'Valor mínimo da venda é R$ 0,01', 'Revise a quantidade'],
  ];
  for (const [operation, message, title] of scenarios) {
    await assert.rejects(requestInvestmentTrade({ ...input, operation }, async () => Response.json({ erro: message }, { status: 400 })), (error: unknown) => {
      assert.ok(error instanceof InvestmentTradeError);
      assert.equal(error.notice.title, title);
      assert.equal(error.notice.action, 'edit-quantity');
      return true;
    });
  }
});

test('saldo em outra moeda orienta conversão sem converter automaticamente', () => {
  for (const [operation, verb] of [['purchase', 'comprar'], ['sale', 'vender']] as const) {
    assert.equal(mapAccountError(`Converta o saldo principal para BRL antes de ${verb} ações`, { operation }).action, 'open-currencies');
  }
});

test('falha de rede e servidor mantém incerteza e não repete compra ou venda', async () => {
  for (const operation of ['purchase', 'sale'] as const) {
    let calls = 0;
    const fetchers: Array<typeof fetch> = [
      async () => { calls++; throw new TypeError('Failed to fetch'); },
      async () => Response.json({ erro: 'Erro interno.' }, { status: 500 }),
      async () => new Response('timeout', { status: 504 }),
    ];
    for (const fetcher of fetchers) {
      await assert.rejects(requestInvestmentTrade({ ...input, operation }, fetcher), (error: unknown) => {
        assert.ok(error instanceof InvestmentTradeError);
        assert.equal(error.notice.action, 'check-balances');
        assert.equal(error.notice.title, operation === 'purchase' ? 'Não foi possível confirmar a compra' : 'Não foi possível confirmar a venda');
        assert.ok(error.notice.description.includes('carteira'));
        return true;
      });
    }
    assert.equal(calls, 1);
  }
});

test('falha após execução não se transforma em recusa, mesmo com mensagem reconhecida', () => {
  for (const operation of ['purchase', 'sale'] as const) {
    const error = new InvestmentTradeError(new Error('Quantidade indisponível para venda'), operation, 'unconfirmed');
    assert.equal(error.notice.action, 'check-balances');
  }
});

test('resposta de sucesso inválida permanece sem confirmação', async () => {
  for (const body of [null, {}, account, { conta: account }, { ...purchase, comprovante: { ...receipt, criada_em: 'invalid' } }, { ...account, saldo: 'invalid' }, { ...account, posicoes: [null] }]) {
    await assert.rejects(requestInvestmentTrade({ ...input, operation: 'purchase' }, async () => Response.json(body)), (error: unknown) => {
      assert.ok(error instanceof InvestmentTradeError);
      assert.equal(error.notice.action, 'check-balances');
      return true;
    });
  }
});

test('recusas desconhecidas e sessão inválida não expõem detalhes internos', async () => {
  for (const status of [400, 401]) {
    await assert.rejects(requestInvestmentTrade({ ...input, operation: 'sale' }, async () => Response.json({ message: 'private details' }, { status })), (error: unknown) => {
      assert.ok(error instanceof InvestmentTradeError);
      assert.equal(error.notice.action, status === 401 ? 'sign-in' : 'close');
      assert.ok(!JSON.stringify(error.notice).includes('private details'));
      return true;
    });
  }
});
