import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularCustoPosicoes, type OperacaoPosicao } from '../supabase/functions/_shared/custo-posicoes.js';

const operacao = (id: string, tipo: OperacaoPosicao['tipo'], quantidade: number, custo?: number): OperacaoPosicao => ({
  id, tipo, codigo: 'PETR4', quantidade_micros: quantidade, custo_centavos: custo,
  criada_em: `2026-11-22T12:00:0${id}Z`,
});

test('venda parcial reduz o custo proporcionalmente', () => {
  const custo = calcularCustoPosicoes([operacao('1', 'COMPRA', 2000000, 5000), operacao('2', 'VENDA', 1000000)]);
  assert.deepEqual(custo.get('PETR4'), { quantidade: 1000000n, custo: 2500n });
});

test('venda total e recompra não carregam o custo antigo', () => {
  const custo = calcularCustoPosicoes([operacao('1', 'COMPRA', 1000000, 1000),
    operacao('2', 'VENDA', 1000000), operacao('3', 'COMPRA', 1000000, 2000)]);
  assert.deepEqual(custo.get('PETR4'), { quantidade: 1000000n, custo: 2000n });
});
