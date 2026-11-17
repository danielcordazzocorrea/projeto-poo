import assert from 'node:assert/strict';
import test from 'node:test';
import { aceitaEntradaDecimal } from '../frontend/moeda.ts';

test('valores permitem edição e decimais em reais, sem letras ou símbolos colados', () => {
  for (const valor of ['', '0', '123', '1,', '1.', '0,01', '12.34']) {
    assert.equal(aceitaEntradaDecimal(valor, 2), true, valor);
  }
  for (const valor of ['abc', '12a34', 'R$ 10,00', '-1', '+1', '1e3', '1,2.3', '1..2', '0.001', '1 000', '12\n']) {
    assert.equal(aceitaEntradaDecimal(valor, 2), false, valor);
  }
});

test('quantidades permitem até seis casas e rejeitam separadores repetidos', () => {
  for (const valor of ['1', '0,123456', '0.000001', '']) assert.equal(aceitaEntradaDecimal(valor, 6), true);
  for (const valor of ['0.1234567', '1a', '1,,2', '1.2,3', '-0.5']) assert.equal(aceitaEntradaDecimal(valor, 6), false);
});
