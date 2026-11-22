import assert from 'node:assert/strict';
import test from 'node:test';
import { prepararRevisaoCompra } from '../frontend/purchase-review.ts';

test('revisão da compra calcula total e saldo com o mesmo arredondamento da ordem', () => {
  const revisao = prepararRevisaoCompra('PETR4', '1.5', '10.01', '20.00', null);
  assert.equal(revisao.total, '15.02');
  assert.equal(revisao.saldoDepois, '4.98');
  assert.equal(revisao.quantidade, '1.500000');
});

test('revisão bloqueia compra sem saldo antes de enviar a ordem', () => {
  assert.throws(() => prepararRevisaoCompra('PETR4', '3', '10.00', '20.00', null), /Saldo insuficiente/);
  assert.throws(() => prepararRevisaoCompra('PETR4', '0', '10.00', '20.00', null), /quantidade/i);
});
