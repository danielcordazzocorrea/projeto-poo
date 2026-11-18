import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digitosParaValor, exibirValorMonetario } from '../frontend/valor-monetario.ts';

test('digitação bancária desloca centavos e mantém texto decimal para a API', () => {
  let valor = '';
  const exibidos: string[] = [];
  for (const digito of '123456') {
    valor = digitosParaValor(exibirValorMonetario(valor) + digito)!;
    exibidos.push(exibirValorMonetario(valor));
  }
  assert.deepEqual(exibidos, ['0,01', '0,12', '1,23', '12,34', '123,45', '1.234,56']);
  assert.equal(valor, '1234.56');
});

test('apagar, limpar, colar valor formatado e zeros não alteram precisão', () => {
  assert.equal(digitosParaValor('1.234,5'), '123.45');
  assert.equal(digitosParaValor(''), '');
  assert.equal(digitosParaValor('0,001'), '0.01');
  assert.equal(digitosParaValor('0'), '0.00');
  assert.equal(digitosParaValor('1.234,56'), '1234.56');
  assert.equal(digitosParaValor('99999999999999'), '999999999999.99');
  assert.equal(exibirValorMonetario('999999999999.99'), '999.999.999.999,99');
});

test('rejeita negativos, notação científica, letras e valores acima do limite', () => {
  for (const entrada of ['-100', '1e3', 'abc', '999999999999999']) assert.equal(digitosParaValor(entrada), null);
});
