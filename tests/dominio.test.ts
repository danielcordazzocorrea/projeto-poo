import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Ativo, Conta, Dinheiro, FalhaDePersistencia, Quantidade, RegraDeNegocio,
  Moeda, SaldoMoeda, ConversorMoeda, validarTipoMoeda,
} from '../supabase/functions/_shared/dominio.ts';
import { Corretora, type RepositorioCorretora } from '../supabase/functions/_shared/servico.ts';

test('valores monetários e quantidades conservam a precisão', () => {
  assert.equal(Dinheiro.positivo('10.05').centavos, 1005n);
  assert.equal(Quantidade.positiva('0.123456').micros, 123456n);
  assert.equal(Dinheiro.doBanco(1005).formatar(), '10.05');
  assert.equal(Quantidade.doBanco(123456).formatar(), '0.123456');
  assert.throws(() => Dinheiro.positivo('0.001'), RegraDeNegocio);
  assert.throws(() => Quantidade.positiva('0'), RegraDeNegocio);
  assert.throws(() => Dinheiro.doBanco(Number.MAX_SAFE_INTEGER + 1), FalhaDePersistencia);
});

test('serviço valida entradas e delega operações ao repositório', async () => {
  const chamadas: unknown[][] = [];
  const conta = new Conta('conta-1', 'usuario-1', Dinheiro.doBanco(5000), 'usuario@example.com', [], []);
  const repositorio: RepositorioCorretora = {
    listarAtivos: async () => [new Ativo('ACAO1', 'Ação', 'ACAO', Dinheiro.doBanco(2500))],
    abrirConta: async () => { chamadas.push(['abrir']); },
    consultarConta: async () => conta,
    depositar: async centavos => { chamadas.push(['depositar', centavos]); },
    comprar: async (codigo, micros) => { chamadas.push(['comprar', codigo, micros]); },
    vender: async (codigo, micros) => { chamadas.push(['vender', codigo, micros]); },
    transferirPix: async (chave, centavos) => { chamadas.push(['pix', chave, centavos]); },
    listarMoedas: async () => [new Moeda('USD', 500n)],
    definirMoedaRecebimento: async tipo => { chamadas.push(['moeda', tipo]); },
    transferirComConversao: async (chave, centavos) => {
      chamadas.push(['conversao', chave, centavos]);
      return new SaldoMoeda(new Moeda('USD', 500n), 2000n);
    },
  };
  const corretora = new Corretora(repositorio);
  assert.equal((await corretora.consultarConta()).saldo_brl, '50.00');
  assert.equal((await corretora.listarAtivos())[0]?.preco_brl, '25.00');
  await corretora.abrirConta();
  await corretora.depositar('10.05');
  await corretora.comprar('ACAO1', '0.5');
  await corretora.vender('ACAO1', '0.25');
  await corretora.transferirPix(' Destinatario@Example.com ', '15.25');
  assert.deepEqual(chamadas, [
    ['abrir'], ['depositar', 1005n], ['comprar', 'ACAO1', 500000n],
    ['vender', 'ACAO1', 250000n],
    ['pix', 'destinatario@example.com', 1525n],
  ]);
  await assert.rejects(corretora.comprar('inválido', '1'), RegraDeNegocio);
  await assert.rejects(corretora.transferirPix('  ', '1'), RegraDeNegocio);
  assert.equal(chamadas.length, 5);
  await corretora.definirMoedaRecebimento('BTC');
  assert.equal((await corretora.listarMoedas())[0]?.tipo_moeda, 'USD');
  assert.deepEqual(await corretora.simularConversao('100.00', 'USD'),
    { tipo_moeda: 'USD', saldo: '20.00', simulada: true });
  await assert.rejects(corretora.simularConversao('100.00', 'BTC'), /Moeda indisponível/);
  const transferencia = await corretora.transferirComConversao(' Amigo@Example.com ', '100.00');
  assert.deepEqual(transferencia.recebimento, { tipo_moeda: 'USD', saldo: '20.00' });
  assert.deepEqual(chamadas.slice(5), [['moeda', 'BTC'], ['conversao', 'amigo@example.com', 10000n]]);
  await assert.rejects(corretora.definirMoedaRecebimento('EUR'), RegraDeNegocio);
  await assert.rejects(corretora.transferirComConversao('amigo@example.com', '0'), RegraDeNegocio);
  await assert.rejects(corretora.transferirComConversao(' ', '100'), RegraDeNegocio);
  assert.equal(chamadas.length, 7);
});

test('câmbio simulado converte reais para USD e BTC sem ponto flutuante', () => {
  const conversor = new ConversorMoeda();
  const reais = Dinheiro.positivo('100.00');
  assert.deepEqual(conversor.converterReais(reais, new Moeda('USD', 500n)).paraJson(),
    { tipo_moeda: 'USD', saldo: '20.00' });
  assert.deepEqual(conversor.converterReais(reais, new Moeda('BTC', 30000000n)).paraJson(),
    { tipo_moeda: 'BTC', saldo: '0.00033333' });
  assert.equal(conversor.converterReais(reais, new Moeda('BRL', 100n)).unidades, 10000n);
  assert.throws(() => conversor.converterReais(Dinheiro.positivo('0.01'), new Moeda('USD', 500n)), RegraDeNegocio);
  assert.throws(() => conversor.converterReais(Dinheiro.doBanco('9007199254740991'), new Moeda('BTC', 1n)), RegraDeNegocio);
  assert.throws(() => validarTipoMoeda('EUR'), RegraDeNegocio);
  assert.throws(() => new Moeda('USD', 0n), RegraDeNegocio);
  assert.throws(() => new Moeda('BRL', 99n), RegraDeNegocio);
  assert.throws(() => new SaldoMoeda(new Moeda('BTC', 30000000n), -1n), RegraDeNegocio);
});

test('conta mantém saldo BRL e preferência independentes dos saldos estrangeiros', () => {
  const conta = new Conta('1', '2', Dinheiro.doBanco(1234), 'a@example.com', [], [], 'BTC',
    [new SaldoMoeda(new Moeda('BTC', 30000000n), 1n)]);
  assert.equal(conta.paraJson().saldo_brl, '12.34');
  assert.equal(conta.paraJson().tipo_moeda, 'BTC');
  assert.deepEqual(conta.paraJson().saldos_moedas, [{ tipo_moeda: 'BTC', saldo: '0.00000001' }]);
});
