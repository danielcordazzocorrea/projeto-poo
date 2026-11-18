import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvestmentTransferError, requestInvestmentTransfer } from '../frontend/investment-transfer.ts';
import type { AccountErrorAction } from '../frontend/account-errors.ts';

const input = { url: 'https://investment.example', apiKey: 'test-key', token: 'test-token',
  direction: 'PARA_INVESTIMENTOS' as const, value: '25.00', requestId: 'existing-request-id' };
const result = {
  conta: { saldo: '25.00', moeda: 'BRL', acoes_investidas: '0.00', posicoes: [], transferencias: [] },
  comprovante: { id: 'receipt-id', direcao: 'PARA_INVESTIMENTOS', valor_origem: '25.00', moeda_origem: 'BRL', valor_destino: '25.00', moeda_destino: 'BRL', cotacao_em: null },
};

async function expectAction(fetcher: typeof fetch, action: AccountErrorAction) {
  await assert.rejects(requestInvestmentTransfer(input, fetcher), (error: unknown) => {
    assert.ok(error instanceof InvestmentTransferError);
    assert.equal(error.notice.action, action);
    return true;
  });
}

test('transferência mantém o identificador existente e o contrato nas duas direções', async () => {
  for (const direction of ['PARA_INVESTIMENTOS', 'PARA_PRINCIPAL'] as const) {
    const expected = { ...result, comprovante: { ...result.comprovante, direcao: direction } };
    const received = await requestInvestmentTransfer({ ...input, direction }, async (url, init) => {
      assert.equal(url, 'https://investment.example/functions/v1/corretora/investimentos/transferencias');
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
      assert.equal(new Headers(init?.headers).get('apikey'), 'test-key');
      assert.deepEqual(JSON.parse(String(init?.body)), { direcao: direction, valor: '25.00', requisicao_id: input.requestId });
      return Response.json(expected);
    });
    assert.deepEqual(received, expected);
  }
});

test('saldo insuficiente nas duas contas e valor inválido permitem corrigir o valor', async () => {
  for (const message of ['Saldo insuficiente na conta principal', 'Saldo insuficiente na conta de investimentos', 'Valor está fora do limite permitido.']) {
    await expectAction(async () => Response.json({ erro: message }, { status: 400 }), 'edit-value');
  }
});

test('erros de moeda, sessão e câmbio têm ações específicas', async () => {
  await expectAction(async () => Response.json({ erro: 'Moeda da conta mudou. Atualize e tente novamente' }, { status: 400 }), 'reload');
  await expectAction(async () => Response.json({ message: 'Invalid JWT' }, { status: 401 }), 'sign-in');
  await expectAction(async () => Response.json({ erro: 'Não foi possível consultar a API de câmbio.' }, { status: 503 }), 'close');
});

test('falha de rede ou servidor não gera nova tentativa de transferência', async () => {
  let calls = 0;
  await expectAction(async () => { calls++; throw new TypeError('Failed to fetch'); }, 'check-balances');
  assert.equal(calls, 1);
  for (const status of [500, 502, 503, 504, 408]) {
    await expectAction(async () => new Response('unknown upstream error', { status }), 'check-balances');
  }
});

test('confirmação inválida não exibe comprovante de sucesso', async () => {
  await expectAction(async () => new Response('invalid json'), 'check-balances');
  for (const body of [null, {}, { conta: result.conta }, { ...result, conta: { ...result.conta, saldo: 'invalid' } },
    { ...result, comprovante: { ...result.comprovante, direcao: 'PARA_PRINCIPAL' } }]) {
    await expectAction(async () => Response.json(body), 'check-balances');
  }
});

test('falha na atualização após a transferência tem prioridade sobre mensagens de recusa', () => {
  const error = new InvestmentTransferError(new Error('Saldo insuficiente na conta principal'), 'unconfirmed');
  assert.equal(error.notice.action, 'check-balances');
  assert.equal(error.notice.title, 'Não foi possível confirmar a transferência');
});

test('recusa desconhecida não expõe detalhes técnicos', async () => {
  await assert.rejects(requestInvestmentTransfer(input, async () => Response.json({ erro: 'internal database detail' }, { status: 400 })), (error: unknown) => {
    assert.ok(error instanceof InvestmentTransferError);
    assert.equal(error.notice.action, 'close');
    assert.ok(!JSON.stringify(error.notice).includes('internal database detail'));
    return true;
  });
});
