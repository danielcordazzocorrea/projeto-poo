import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CurrencyConversionError, requestCurrencyConversion } from '../frontend/currency-conversion.ts';
import type { AccountErrorAction } from '../frontend/account-errors.ts';

const input = { url: 'https://conversion.example', apiKey: 'test-key', token: 'test-token', currency: 'USD' as const };
const account = { id: 'account-test', saldo: '20.00', saldo_brl: '100.00', moeda_saldo: 'USD', movimentacoes: [] };

async function expectAction(fetcher: typeof fetch, action: AccountErrorAction, title?: string) {
  await assert.rejects(requestCurrencyConversion(input, fetcher), (error: unknown) => {
    assert.ok(error instanceof CurrencyConversionError);
    assert.equal(error.notice.action, action);
    if (title) assert.equal(error.notice.title, title);
    return true;
  });
}

test('conversão mantém contrato da API e retorna saldo e horário da cotação', async () => {
  const timestamp = '2026-11-16T15:00:00Z';
  let calls = 0;
  const result = await requestCurrencyConversion(input, async (url, init) => {
    calls++;
    assert.equal(url, 'https://conversion.example/functions/v1/corretora/conta/converter');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    assert.equal(new Headers(init?.headers).get('apikey'), 'test-key');
    assert.deepEqual(JSON.parse(String(init?.body)), { moeda: 'USD' });
    return Response.json({ ...account, comprovante: { cotacao_em: timestamp } });
  });
  assert.equal(result.conta.saldo, '20.00');
  assert.equal(result.conta.moeda_saldo, 'USD');
  assert.equal(result.cotacaoEm, timestamp);
  assert.equal(calls, 1);
});

test('conversão aceita saldo zero e horário ausente sem inventar cotação', async () => {
  for (const body of [{ ...account, saldo: '0.00' }, { ...account, comprovante: { cotacao_em: null } }]) {
    const result = await requestCurrencyConversion(input, async () => Response.json(body));
    assert.equal(result.cotacaoEm, null);
  }
});

test('conversão identifica moeda repetida, saldo pequeno e dados desatualizados', async () => {
  await expectAction(async () => Response.json({ erro: 'O saldo já está nesta moeda.' }, { status: 400 }), 'select-currency');
  await expectAction(async () => Response.json({ erro: 'Valor inferior a um centavo na moeda de destino' }, { status: 400 }), 'select-currency', 'Saldo muito baixo para converter');
  await expectAction(async () => Response.json({ erro: 'Moeda da conta mudou. Atualize e tente novamente' }, { status: 400 }), 'reload');
});

test('falha conhecida na API de câmbio apresenta cotação indisponível', async () => {
  await expectAction(async () => Response.json({ erro: 'API de câmbio indisponível (HTTP 503).' }, { status: 503 }), 'close', 'Cotação indisponível');
});

test('perda de conexão não repete a conversão nem afirma que ela foi recusada', async () => {
  let calls = 0;
  await expectAction(async () => { calls++; throw new TypeError('Failed to fetch'); }, 'check-balances', 'Não foi possível confirmar a conversão');
  assert.equal(calls, 1);
  for (const status of [500, 502, 503, 504, 408]) {
    await expectAction(async () => new Response('upstream error', { status }), 'check-balances');
  }
});

test('sucesso ilegível ou com moeda diferente permanece sem confirmação', async () => {
  await expectAction(async () => new Response('invalid json'), 'check-balances');
  for (const body of [null, {}, { ...account, saldo: 'invalid' }, { ...account, moeda_saldo: 'BRL' },
    { ...account, comprovante: { cotacao_em: 'invalid date' } }]) {
    await expectAction(async () => Response.json(body), 'check-balances');
  }
});

test('sessão inválida e recusa desconhecida possuem ações sem detalhes internos', async () => {
  await expectAction(async () => Response.json({ message: 'Invalid JWT' }, { status: 401 }), 'sign-in');
  await assert.rejects(requestCurrencyConversion(input, async () => Response.json({ erro: 'private database details' }, { status: 400 })), (error: unknown) => {
    assert.ok(error instanceof CurrencyConversionError);
    assert.equal(error.notice.action, 'close');
    assert.ok(!JSON.stringify(error.notice).includes('private database details'));
    return true;
  });
});
