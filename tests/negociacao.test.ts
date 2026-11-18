import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ativo, Conta, Dinheiro, Posicao, Quantidade, RegraDeNegocio } from '../supabase/functions/_shared/dominio.ts';
import { CarteiraInvestimentos, OrdemNegociacao } from '../supabase/functions/_shared/negociacao.ts';

const id = '11111111-1111-4111-8111-111111111111';
const ordem = (tipo: 'COMPRA' | 'VENDA', quantidade = '1', preco = '10.00') => new OrdemNegociacao(tipo, 'PETR4', quantidade, preco, id);

test('dinheiro calcula sem ponto flutuante, preserva origem e impede saldo negativo e overflow', () => {
  const a = Dinheiro.positivo('0.10');
  assert.equal(a.somar(Dinheiro.positivo('0.20')).formatar(), '0.30');
  assert.equal(a.formatar(), '0.10');
  assert.equal(a.subtrair(a).formatar(), '0.00');
  assert.throws(() => a.subtrair(Dinheiro.positivo('1')), RegraDeNegocio);
  assert.throws(() => Dinheiro.doBanco(Number.MAX_SAFE_INTEGER).somar(a), /Limite/);
});

test('compra arredonda custo para cima e venda para baixo inclusive frações mínimas', () => {
  assert.equal(ordem('COMPRA', '0.5', '44.43').total.formatar(), '22.22');
  assert.equal(ordem('VENDA', '0.5', '44.43').total.formatar(), '22.21');
  assert.equal(ordem('COMPRA', '0.000001', '0.01').total.formatar(), '0.01');
  assert.throws(() => ordem('VENDA', '0.000001', '0.01'), /maior que zero/);
  assert.throws(() => ordem('COMPRA', '999999999', '999999999'), /Limite/);
});

test('posição impede vender três unidades quando possui duas e preserva o estado original', () => {
  const posicao = new Posicao(new Ativo('PETR4', 'Petrobras', 'ACAO', Dinheiro.positivo('10')), Quantidade.positiva('2'));
  assert.throws(() => posicao.vender(Quantidade.positiva('3')), /Quantidade indisponível/);
  assert.equal(posicao.quantidade.formatar(), '2.000000');
  assert.equal(posicao.comprar(Quantidade.positiva('0.5')).quantidade.formatar(), '2.500000');
  assert.equal(posicao.vender(Quantidade.positiva('2')).quantidade.formatar(), '0.000000');
  assert.throws(() => posicao.vender(Quantidade.zero()), /positiva/);
});

test('carteira compra, vende parcialmente e encerra posição com saldos consistentes', () => {
  const inicial = new CarteiraInvestimentos(Dinheiro.positivo('100'));
  const comprada = inicial.executar(ordem('COMPRA', '2'));
  assert.equal(comprada.saldo.formatar(), '80.00');
  const parcial = comprada.executar(ordem('VENDA', '0.5', '12'));
  assert.equal(parcial.saldo.formatar(), '86.00');
  assert.equal(parcial.quantidade('PETR4').formatar(), '1.500000');
  const encerrada = parcial.executar(ordem('VENDA', '1.5', '12'));
  assert.equal(encerrada.saldo.formatar(), '104.00');
  assert.equal(encerrada.quantidade('PETR4').micros, 0n);
  assert.equal(inicial.saldo.formatar(), '100.00');
  assert.equal(inicial.quantidade('PETR4').micros, 0n);
});

test('carteira recusa compra sem saldo e venda sem posição sem alteração parcial', () => {
  const carteira = new CarteiraInvestimentos(Dinheiro.positivo('5'));
  assert.throws(() => carteira.executar(ordem('COMPRA')), /Saldo insuficiente/);
  assert.throws(() => carteira.executar(ordem('VENDA')), /Quantidade indisponível/);
  assert.equal(carteira.saldo.formatar(), '5.00');
  assert.equal(carteira.quantidade('PETR4').micros, 0n);
  assert.equal(carteira.aportar(Dinheiro.positivo('5')).retirar(Dinheiro.positivo('10')).saldo.centavos, 0n);
  assert.throws(() => carteira.retirar(Dinheiro.positivo('6')), /Saldo insuficiente/);
});

test('ordem identifica repetição e rejeita reutilização com dados diferentes', () => {
  ordem('COMPRA').validarRepeticao(ordem('COMPRA'));
  assert.throws(() => ordem('COMPRA').validarRepeticao(ordem('VENDA')), /já utilizado/);
  assert.throws(() => ordem('COMPRA').validarRepeticao(ordem('COMPRA', '2')), /já utilizado/);
  assert.throws(() => ordem('COMPRA').validarRepeticao(ordem('COMPRA', '1', '11')), /já utilizado/);
  assert.throws(() => new OrdemNegociacao('COMPRA', 'PETR4', '1', '10', 'id-invalido'), /inválidos/);
});

test('conta modela Pix para própria chave, saldo insuficiente, crédito e débito', () => {
  const conta = new Conta('id', 'usuario', Dinheiro.positivo('50'), 'a@example.com', [], []);
  assert.throws(() => conta.prepararPix(' A@EXAMPLE.COM ', Dinheiro.positivo('1')), /própria chave/);
  assert.throws(() => conta.prepararPix('b@example.com', Dinheiro.positivo('51')), /Saldo insuficiente/);
  const nova = conta.prepararPix('b@example.com', Dinheiro.positivo('10'));
  assert.equal(nova.saldo.formatar(), '40.00');
  assert.equal(conta.saldo.formatar(), '50.00');
  assert.equal(nova.creditar(Dinheiro.positivo('10')).saldo.formatar(), '50.00');
  assert.throws(() => conta.debitar(Dinheiro.zero()), /maior que zero/);
});
