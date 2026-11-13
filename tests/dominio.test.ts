import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Ativo, Conta, Dinheiro, FalhaDePersistencia, Quantidade, RegraDeNegocio,
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
});
