import assert from 'node:assert/strict';
import { test } from 'node:test';

test('API cadastra cliente, abre conta e registra depósito', async () => {
  process.env.NODE_ENV = 'test';
  const { servidor } = await import('../src/server.js');
  await new Promise<void>(resolve => servidor.listen(0, '127.0.0.1', resolve));
  try {
    const endereco = servidor.address();
    assert.ok(endereco && typeof endereco !== 'string');
    const base = `http://127.0.0.1:${endereco.port}`;
    const postar = async (rota: string, dados: object) => {
      const resposta = await fetch(base + rota, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      return { status: resposta.status, dados: await resposta.json() as Record<string, unknown> };
    };
    const cliente = await postar('/clientes', { nome: 'Ana' });
    assert.equal(cliente.status, 201);
    const conta = await postar('/contas', { cliente_id: cliente.dados.id });
    assert.equal(conta.status, 201);
    const deposito = await postar(`/contas/${conta.dados.id}/depositos`, { valor: '100.00' });
    assert.equal(deposito.status, 200);
    assert.equal(deposito.dados.saldo_brl, '100.00');
    const consulta = await fetch(`${base}/contas/${conta.dados.id}`);
    assert.equal((await consulta.json() as Record<string, unknown>).saldo_brl, '100.00');
  } finally {
    await new Promise<void>((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
  }
});
