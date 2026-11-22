import assert from 'node:assert/strict';
import test from 'node:test';
import { mensagemErroAssistente } from '../frontend/assistant-errors.js';

test('falhas internas e de rede do chat usam mensagem compreensível', () => {
  assert.equal(mensagemErroAssistente(500), 'Não consegui responder agora. Tente novamente em instantes.');
  assert.equal(mensagemErroAssistente(503), mensagemErroAssistente());
  assert.doesNotMatch(mensagemErroAssistente(500), /erro interno/i);
});

test('sessão expirada orienta o novo login', () => {
  assert.match(mensagemErroAssistente(401), /Entre novamente/);
});
