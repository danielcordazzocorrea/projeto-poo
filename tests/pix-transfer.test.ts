import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PixTransferError, requestPixTransfer } from '../frontend/pix-transfer.ts';
import type { AccountErrorAction } from '../frontend/account-errors.ts';

const input = { url: 'https://pix.example', apiKey: 'test-key', token: 'test-token', key: 'pessoa@example.com', value: '250.00' };
const account = { id: 'test-account', saldo: '100.00', saldo_brl: '100.00', moeda_saldo: 'BRL', movimentacoes: [] };

async function expectAction(fetcher: typeof fetch, action: AccountErrorAction) {
  await assert.rejects(requestPixTransfer(input, fetcher), (error: unknown) => {
    assert.ok(error instanceof PixTransferError);
    assert.equal(error.notice.action, action);
    return true;
  });
}

test('Pix mantém contrato da API e retorna conta e comprovante em caso de sucesso', async () => {
  let calls = 0;
  const expected = { ...account, comprovante: { moeda_recebida: 'USD', valor_recebido: '50.00' } };
  const result = await requestPixTransfer(input, async (url, init) => {
    calls++;
    assert.equal(url, 'https://pix.example/functions/v1/corretora/pix/transferencias');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-token');
    assert.equal(headers.get('apikey'), 'test-key');
    assert.deepEqual(JSON.parse(String(init?.body)), { chave_destino: input.key, valor: input.value });
    return Response.json(expected);
  });
  assert.deepEqual(result, expected);
  assert.equal(calls, 1);
  // The existing API also allows a response without the optional receipt.
  assert.deepEqual(await requestPixTransfer(input, async () => Response.json(account)), account);
});

test('recusas de Pix escolhem a correção adequada', async () => {
  await expectAction(async () => Response.json({ erro: 'Saldo insuficiente' }, { status: 400 }), 'edit-value');
  await expectAction(async () => Response.json({ erro: 'Conta de destino não encontrada.' }, { status: 404 }), 'edit-key');
  await expectAction(async () => Response.json({ erro: 'Valor aceita até 2 casas decimais.' }, { status: 400 }), 'edit-value');
});

test('sessão recusada pelo gateway leva ao login sem expor erro técnico', async () => {
  await expectAction(async () => Response.json({ message: 'Invalid JWT' }, { status: 401 }), 'sign-in');
});

test('falha de rede não reenvia o Pix e orienta conferir saldos', async () => {
  let calls = 0;
  await expectAction(async () => { calls++; throw new TypeError('Failed to fetch'); }, 'check-balances');
  assert.equal(calls, 1);
});

test('falhas de servidor desconhecidas e timeout não são tratadas como recusa confirmada', async () => {
  for (const status of [500, 502, 503, 504, 408]) {
    await expectAction(async () => new Response('upstream connection failed', { status }), 'check-balances');
  }
  await expectAction(async () => Response.json({ erro: 'Erro interno.' }, { status: 500 }), 'check-balances');
});

test('falha conhecida de câmbio antes da transferência mantém mensagem específica', async () => {
  await assert.rejects(requestPixTransfer(input, async () => Response.json(
    { erro: 'Não foi possível consultar a API de câmbio.' }, { status: 503 },
  )), (error: unknown) => {
    assert.ok(error instanceof PixTransferError);
    assert.equal(error.notice.title, 'Cotação indisponível');
    assert.equal(error.notice.action, 'close');
    return true;
  });
});

test('resposta de sucesso ilegível ou incompleta não vira confirmação nem nova tentativa', async () => {
  await expectAction(async () => new Response('invalid json', { status: 200 }), 'check-balances');
  for (const body of [null, {}, { ...account, saldo: 'invalid' }, { ...account, moeda_saldo: 'XXX' },
    { ...account, comprovante: { moeda_recebida: 'USD' } }]) {
    await expectAction(async () => Response.json(body), 'check-balances');
  }
});

test('recusa desconhecida apresenta mensagem genérica sem dados internos', async () => {
  await assert.rejects(requestPixTransfer(input, async () => Response.json(
    { erro: 'Detalhes internos do banco' }, { status: 400 },
  )), (error: unknown) => {
    assert.ok(error instanceof PixTransferError);
    assert.equal(error.notice.action, 'close');
    assert.ok(!JSON.stringify(error.notice).includes('Detalhes internos'));
    return true;
  });
});
