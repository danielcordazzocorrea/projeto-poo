import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Corretora } from '../src/servico.js';
import { RegraDeNegocio } from '../src/dominio.js';

test('depósito, compra e venda atualizam saldo, posição e histórico', () => {
  const corretora = new Corretora();
  const conta = corretora.abrirConta(corretora.cadastrarCliente('Ana').id);
  corretora.depositar(conta.id, '100.00');
  corretora.comprar(conta.id, 'ACAO1', '2');
  corretora.vender(conta.id, 'ACAO1', '1');
  assert.equal(conta.consultarSaldo(), 7500n);
  assert.equal(conta.consultarPosicoes()[0]?.quantidade, 1_000_000n);
  assert.deepEqual(conta.consultarMovimentacoes().map(m => m.tipo), ['DEPOSITO', 'COMPRA', 'VENDA']);
});

test('operações inválidas não alteram a conta', () => {
  const corretora = new Corretora();
  const conta = corretora.abrirConta(corretora.cadastrarCliente('Ana').id);
  corretora.depositar(conta.id, '10.00');
  assert.throws(() => corretora.comprar(conta.id, 'ACAO1', '1'), RegraDeNegocio);
  assert.throws(() => corretora.vender(conta.id, 'USD', '1'), RegraDeNegocio);
  assert.throws(() => corretora.depositar(conta.id, '0.001'), RegraDeNegocio);
  assert.equal(conta.consultarSaldo(), 1000n);
  assert.equal(conta.consultarMovimentacoes().length, 1);
});

test('cada cliente abre uma única conta', () => {
  const corretora = new Corretora();
  const cliente = corretora.cadastrarCliente('Ana');
  corretora.abrirConta(cliente.id);
  assert.throws(() => corretora.abrirConta(cliente.id), RegraDeNegocio);
});
