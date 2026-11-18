import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapAccountError, type AccountErrorOperation } from '../frontend/account-errors.ts';

test('reconhece a mensagem atual de destinatário inexistente e formatos de entrada', () => {
  for (const error of ['Conta de destino não encontrada.', new Error('Conta de destino não encontrada.'),
    { erro: 'Conta de destino não encontrada.' }, { message: '  CONTA DE DESTINO NAO ENCONTRADA! ' }]) {
    const result = mapAccountError(error, { operation: 'pix' });
    assert.equal(result.title, 'Destinatário não encontrado');
    assert.equal(result.action, 'edit-key');
    assert.equal(result.variant, 'error');
  }
});

test('não confunde falha da conta de origem com destinatário inexistente', () => {
  for (const message of ['Conta não encontrada.', 'Chave Pix não encontrada para esta conta.']) {
    assert.notEqual(mapAccountError(message, { operation: 'pix' }).action, 'edit-key');
  }
  assert.equal(mapAccountError('Chave Pix não encontrada', { operation: 'account' }).action, 'reload');
});

test('orienta correção de chave inválida e Pix para a própria conta', () => {
  for (const message of ['Chave Pix inválida.', 'Chave de destino inválida', 'Não é possível transferir para a própria conta']) {
    assert.equal(mapAccountError(message, { operation: 'pix' }).action, 'edit-key');
  }
});

test('identifica o saldo de origem em transferências para investimentos', () => {
  for (const source of ['conta principal', 'conta de investimentos']) {
    const result = mapAccountError(`Saldo insuficiente na ${source}`, { operation: 'investment-transfer' });
    assert.equal(result.action, 'edit-value');
    assert.ok(result.description.includes(source));
  }
  assert.equal(mapAccountError('Saldo insuficiente', { operation: 'pix' }).action, 'edit-value');
});

test('mapeia validações de valor sem confundir falhas de persistência', () => {
  for (const message of ['Valor inválido', 'Valor deve ser um decimal positivo em texto.',
    'Valor aceita até 2 casas decimais.', 'Valor está fora do limite permitido.', 'Valor inferior a um centavo na moeda de destino']) {
    assert.equal(mapAccountError(message, { operation: 'pix' }).action, 'edit-value');
  }
  assert.equal(mapAccountError('Valor inválido recebido do banco: saldo.', { operation: 'pix' }).action, 'check-balances');
});

test('conversão pede seleção de moeda e atualização de dados conforme a regra', () => {
  assert.equal(mapAccountError('O saldo já está nesta moeda.', { operation: 'conversion' }).action, 'select-currency');
  assert.equal(mapAccountError('Moeda da conta mudou. Atualize e tente novamente', { operation: 'conversion' }).action, 'reload');
});

test('falhas conhecidas de câmbio usam aviso sem reenviar a operação', () => {
  for (const message of ['Não foi possível consultar a API de câmbio.', 'API de câmbio indisponível (HTTP 503).',
    'Cotação de USD inválida.', 'Cotação inválida ou desatualizada']) {
    const result = mapAccountError(message, { operation: 'conversion' });
    assert.equal(result.title, 'Cotação indisponível');
    assert.equal(result.variant, 'warning');
    assert.equal(result.action, 'close');
  }
});

test('resultado incerto tem prioridade até sobre uma mensagem de erro reconhecida', () => {
  for (const operation of ['pix', 'conversion', 'investment-transfer'] as const) {
    for (const error of [new TypeError('Failed to fetch'), new Error('Erro interno.'), null, undefined, 42,
      { message: 'detalhe técnico privado' }, new Error('Conversão sem comprovante.')]) {
      const result = mapAccountError(error, { operation });
      assert.equal(result.action, 'check-balances');
      assert.equal(result.variant, 'warning');
      assert.ok(result.description.includes('antes de tentar novamente'));
      assert.ok(!JSON.stringify(result).includes('detalhe técnico privado'));
    }
    const afterWrite = mapAccountError('Saldo insuficiente', { operation, outcome: 'unconfirmed' });
    assert.equal(afterWrite.action, 'check-balances');
    const rejected = mapAccountError('Regra ainda não mapeada', { operation, outcome: 'rejected' });
    assert.equal(rejected.action, 'close');
    assert.equal(rejected.variant, 'error');
  }
});

test('consultas podem ser recuperadas sem tratar o resultado como transferência incerta', () => {
  assert.equal(mapAccountError(new TypeError('Failed to fetch'), { operation: 'account' }).action, 'reload');
  assert.equal(mapAccountError(new TypeError('Failed to fetch'), { operation: 'market' }).title, 'Consulta indisponível');
});

test('mercado usa códigos existentes e mensagens, sem confundir credencial do provedor com sessão', () => {
  for (const error of [{ codigo: 'ATIVO_NAO_ENCONTRADO' }, new Error('Ativo não encontrado.')]) {
    assert.equal(mapAccountError(error, { operation: 'market' }).action, 'edit-search');
  }
  assert.equal(mapAccountError({ codigo: 'BUSCA_INVALIDA' }, { operation: 'market' }).action, 'edit-search');
  const limited = mapAccountError({ codigo: 'LIMITE_BRAPI' }, { operation: 'market' });
  assert.equal(limited.title, 'Limite de consultas atingido');
  assert.equal(limited.action, 'close');
  assert.notEqual(mapAccountError({ codigo: 'TOKEN_INVALIDO' }, { operation: 'market' }).action, 'sign-in');
});

test('sessão indisponível nas áreas internas tem ação própria', () => {
  for (const operation of ['pix', 'conversion', 'investment-transfer', 'account', 'market'] satisfies AccountErrorOperation[]) {
    assert.equal(mapAccountError('Sessão inválida. Entre novamente.', { operation }).action, 'sign-in');
  }
});
