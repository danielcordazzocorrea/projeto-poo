import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularResultadoInvestimento, perguntaSobreResultado, resumirResultado } from '../supabase/functions/_shared/resultado-investimento.js';
import type { ContaInvestimento } from '../supabase/functions/_shared/investimentos.js';

const base: ContaInvestimento = { saldo: '20.00', moeda: 'BRL', acoes_investidas: '50.00',
  posicoes: [{ codigo_ativo: 'PETR4', quantidade: '2.000000', preco_medio_compra: '25.00' }], transferencias: [] };
const agora = () => new Date('2026-11-22T12:00:00Z');
function cotador(preco: string) {
  return { cotar: async (codigo: string) => ({ codigo, nome: 'Petrobras', tipo: 'ACAO' as const,
    preco_brl: preco, cotacao_em: '2026-11-22T11:00:00Z', consultado_em: agora().toISOString(), fonte: 'brapi' as const }) };
}

test('calcula valor atual, lucro, percentual e total com saldo disponível', async () => {
  const resultado = await calcularResultadoInvestimento(base, cotador('30.00'), agora);
  assert.equal(resultado.investido, '50.00');
  assert.equal(resultado.valor_atual, '60.00');
  assert.equal(resultado.resultado, '10.00');
  assert.equal(resultado.percentual, '20.00');
  assert.equal(resultado.patrimonio_atual, '80.00');
  assert.match(resumirResultado(resultado), /R\$ 80,00/);
});

test('calcula perda e quantidade fracionária sem ponto flutuante', async () => {
  const perda = await calcularResultadoInvestimento(base, cotador('20.00'), agora);
  assert.equal(perda.resultado, '-10.00');
  assert.equal(perda.percentual, '-20.00');
  const fracao = await calcularResultadoInvestimento({ ...base, acoes_investidas: '4.00',
    posicoes: [{ codigo_ativo: 'PETR4', quantidade: '0.500000' }] }, cotador('10.01'), agora);
  assert.equal(fracao.valor_atual, '5.01');
  assert.equal(fracao.resultado, '1.01');
});

test('sem posições mostra apenas saldo; cotação ausente não gera total parcial', async () => {
  const vazia = await calcularResultadoInvestimento({ ...base, acoes_investidas: '0.00', posicoes: [] },
    { cotar: async () => { throw new Error('não deve consultar'); } }, agora);
  assert.equal(vazia.valor_atual, '0.00');
  assert.equal(vazia.patrimonio_atual, '20.00');
  const indisponivel = await calcularResultadoInvestimento(base,
    { cotar: async () => { throw new Error('provedor indisponível'); } }, agora);
  assert.equal(indisponivel.valor_atual, null);
  assert.deepEqual(indisponivel.ativos_sem_cotacao, ['PETR4']);
  assert.match(resumirResultado(indisponivel), /indisponíveis/);
});

test('identifica perguntas de resultado para enriquecer a resposta da IA', () => {
  assert.equal(perguntaSobreResultado('Qual meu rendimento?'), true);
  assert.equal(perguntaSobreResultado('Quanto que eu investi e quanto que eu tenho atualmente?'), true);
  assert.equal(perguntaSobreResultado('Me mostre meu histórico de Pix'), false);
});
