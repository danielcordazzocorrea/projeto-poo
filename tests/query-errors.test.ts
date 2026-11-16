import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryError, queryErrorNotice, readQueryResponse } from '../frontend/query-errors.ts';

test('consultas bem-sucedidas mantêm os dados, incluindo busca vazia', async () => {
  const body = { ativos: [], pagina: 1, tem_proxima: false };
  assert.deepEqual(await readQueryResponse(Response.json(body), 'market'), body);
  const account = { id: 'account-test', saldo: '100.00', moeda_saldo: 'BRL', movimentacoes: [] };
  assert.deepEqual(await readQueryResponse(Response.json(account), 'account'), account);
});

test('códigos de mercado definem a ação sem depender do texto do provedor', async () => {
  for (const [codigo, action] of [['ATIVO_NAO_ENCONTRADO', 'edit-search'], ['BUSCA_INVALIDA', 'edit-search'],
    ['LIMITE_BRAPI', 'close'], ['FALHA_BRAPI', 'reload'], ['TIMEOUT_BRAPI', 'reload']]) {
    await assert.rejects(readQueryResponse(Response.json({ codigo, erro: 'detalhe interno' }, { status: 503 }), 'market'), (error: unknown) => {
      assert.ok(error instanceof QueryError);
      assert.equal(error.notice.action, action);
      assert.ok(!JSON.stringify(error.notice).includes('detalhe interno'));
      return true;
    });
  }
});

test('sessão expirada não é confundida com credencial do provedor', async () => {
  await assert.rejects(readQueryResponse(new Response('Unauthorized', { status: 401 }), 'account'), (error: unknown) => {
    assert.ok(error instanceof QueryError);
    assert.equal(error.notice.action, 'sign-in');
    return true;
  });
  await assert.rejects(readQueryResponse(Response.json({ codigo: 'TOKEN_INVALIDO' }, { status: 503 }), 'market'), (error: unknown) => {
    assert.ok(error instanceof QueryError);
    assert.notEqual(error.notice.action, 'sign-in');
    return true;
  });
});

test('respostas ilegíveis ou falhas da conta orientam recarregar sem expor detalhes', async () => {
  for (const response of [new Response('server stack trace', { status: 500 }), Response.json(null),
    Response.json('invalid data'), Response.json({ erro: 'database credentials' }, { status: 503 })]) {
    await assert.rejects(readQueryResponse(response, 'account'), (error: unknown) => {
      assert.ok(error instanceof QueryError);
      assert.equal(error.notice.action, 'reload');
      assert.equal(error.notice.title, 'Não conseguimos carregar os dados');
      assert.ok(!JSON.stringify(error.notice).includes('database credentials'));
      return true;
    });
  }
});

test('falhas de rede e erros já traduzidos preservam a ação adequada', () => {
  assert.equal(queryErrorNotice(new TypeError('Failed to fetch'), 'account').action, 'reload');
  assert.equal(queryErrorNotice(new TypeError('Failed to fetch'), 'market').action, 'reload');
  const error = new QueryError({ codigo: 'LIMITE_BRAPI' }, 'market');
  assert.equal(queryErrorNotice(error, 'market'), error.notice);
});
