import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buscarCotacoes } from '../supabase/functions/_shared/cotacoes.ts';
import { Conta, Dinheiro, FalhaDePersistencia } from '../supabase/functions/_shared/dominio.ts';
import { Corretora, type RepositorioCorretora } from '../supabase/functions/_shared/servico.ts';
import { formatarSaldo } from '../frontend/moeda.ts';

const agora = Date.parse('2026-11-15T15:00:00Z');
const resposta = { data: { currency: 'USD', rates: { BRL: '5.20', EUR: '0.85' } } };

test('busca cotações atuais da Coinbase e deriva EUR/BRL sem ponto flutuante', async () => {
  let url = '';
  const cotacoes = await buscarCotacoes(async input => {
    url = String(input);
    return Response.json(resposta);
  }, agora);
  assert.equal(url, 'https://api.coinbase.com/v2/exchange-rates?currency=USD');
  assert.equal(cotacoes.USD.bid, '5.20000000');
  assert.equal(cotacoes.EUR.ask, '6.11764705');
  assert.equal(cotacoes.USD.timestamp, new Date(agora).toISOString());
});

test('não aceita cotação inválida ou resposta HTTP com falha', async () => {
  await assert.rejects(buscarCotacoes(async () => Response.json({ ...resposta,
    data: { currency: 'EUR', rates: resposta.data.rates },
  }), agora), FalhaDePersistencia);
  await assert.rejects(buscarCotacoes(async () => Response.json({ ...resposta,
    data: { currency: 'USD', rates: { BRL: '5.20', EUR: '0' } },
  }), agora), FalhaDePersistencia);
  await assert.rejects(buscarCotacoes(async () => Response.json({}, { status: 429 }), agora), FalhaDePersistencia);
});

test('conversão e Pix usam a moeda persistida de cada conta e buscam cotação quando necessário', async () => {
  const chamadas: unknown[][] = [];
  const conta = new Conta('id', 'usuario', Dinheiro.doBanco(5000), 'a@example.com', [], [], 'USD');
  const cotacoes = await buscarCotacoes(async () => Response.json(resposta), agora);
  let buscas = 0;
  const repositorio: RepositorioCorretora = {
    listarAtivos: async () => [], abrirConta: async () => {}, consultarConta: async () => conta,
    depositar: async () => {}, comprar: async () => {}, vender: async () => {},
    consultarMoedaDestinoPix: async () => 'EUR',
    converterSaldo: async (destino, origem, taxas) => { chamadas.push(['converter', origem, destino, taxas?.EUR.ask]); return { cotacao_em: cotacoes.EUR.timestamp }; },
    transferirPix: async (chave, centavos, origem, destino, taxas) => {
      chamadas.push(['pix', chave, centavos, origem, destino, taxas?.USD.bid]);
      return { moeda_recebida: 'EUR', valor_recebido: '42.27', cotacao_em: cotacoes.EUR.timestamp };
    },
  };
  const corretora = new Corretora(repositorio, async () => { buscas++; return cotacoes; });
  await corretora.converterSaldo('EUR');
  const pix = await corretora.transferirPix(' Destino@Example.com ', '50.00');
  assert.equal(pix.comprovante.moeda_recebida, 'EUR');
  assert.equal(buscas, 2);
  assert.deepEqual(chamadas, [
    ['converter', 'USD', 'EUR', '6.11764705'],
    ['pix', 'destino@example.com', 5000n, 'USD', 'EUR', '5.20000000'],
  ]);
  assert.equal(formatarSaldo('1234.56', 'EUR'), '€ 1.234,56');
});
