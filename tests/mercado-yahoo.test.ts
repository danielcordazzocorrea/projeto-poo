import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MercadoYahoo, type ConsultaYahoo } from '../supabase/functions/_shared/mercado-yahoo.ts';
import { ErroMercado } from '../supabase/functions/_shared/mercado-brapi.ts';

const agora = Date.parse('2026-11-17T18:00:00Z');
const resposta = (symbol = 'BBAS3.SA') => ({ meta: { symbol, currency: 'BRL' }, quotes: [
  { date: new Date('2026-11-16T13:00:00Z'), close: 22.35 },
  { date: new Date('2026-11-13T13:00:00Z'), close: 22.1 },
  { date: new Date('2026-11-12T13:00:00Z'), close: null },
] });

test('Yahoo mapeia B3 para .SA, normaliza a fonte, ordena e compartilha cache', async () => {
  let chamadas = 0, instante = agora;
  const mercado = new MercadoYahoo(async (codigo, opcoes) => {
    chamadas++; assert.equal(codigo, 'BBAS3.SA'); assert.equal(opcoes.interval, '1d');
    return resposta();
  }, () => instante);
  const [a, b] = await Promise.all([mercado.historico('bbas3', '6mo'), mercado.historico('BBAS3', '6mo')]);
  assert.deepEqual(a, b); assert.equal(chamadas, 1); assert.equal(a.fonte, 'yahoo');
  assert.deepEqual(a.pontos, [{ data: '2026-11-13', preco_brl: '22.10' }, { data: '2026-11-16', preco_brl: '22.35' }]);
  instante += 3_600_001;
  await mercado.historico('BBAS3', '6mo'); assert.equal(chamadas, 2);
});

test('Yahoo aceita ETF, FII e todos os períodos sem política Premium da brapi', async () => {
  const mercado = new MercadoYahoo(async codigo => resposta(codigo), () => agora);
  for (const ticker of ['BOVA11', 'HGLG11']) for (const periodo of ['1d', '5d', '1mo', '6mo', 'ytd', '1y', '5y', 'max']) {
    assert.equal((await mercado.historico(ticker, periodo)).codigo, ticker);
  }
});

test('Yahoo preserva horários intradiários e rejeita entradas sem consulta externa', async () => {
  let chamadas = 0;
  const mercado = new MercadoYahoo(async () => { chamadas++; return resposta(); }, () => agora);
  for (const executar of [() => mercado.historico('BBAS3/xx'), () => mercado.historico('BBAS3', '__proto__')]) {
    await assert.rejects(executar, ErroMercado);
  }
  assert.equal(chamadas, 0);
  assert.equal((await mercado.historico('BBAS3', '1d')).pontos[0]?.data, '2026-11-13T13:00:00.000Z');
});

test('Yahoo falhas não ficam no cache nem revelam mensagem do provedor', async () => {
  let chamadas = 0;
  const mercado = new MercadoYahoo(async () => { if (++chamadas === 1) throw new Error('segredo'); return resposta(); }, () => agora);
  await assert.rejects(mercado.historico('BBAS3'), (e: unknown) => e instanceof ErroMercado && e.codigo === 'YAHOO_INDISPONIVEL' && !e.message.includes('segredo'));
  await mercado.historico('BBAS3'); assert.equal(chamadas, 2);
});

test('Yahoo rejeita moeda, símbolo, preço e estrutura inesperados', async () => {
  for (const bruto of [{}, { ...resposta(), meta: { symbol: 'BBAS3.SA', currency: 'USD' } }, resposta('VALE3.SA'),
    { ...resposta(), quotes: [{ date: new Date('invalid'), close: 10 }] },
    { ...resposta(), quotes: [{ date: new Date('2026-11-16'), close: -1 }] }]) {
    await assert.rejects(new MercadoYahoo(async () => bruto, () => agora).historico('BBAS3'), ErroMercado);
  }
});

test('Yahoo limita concorrência e mantém datas no fim do mês', async () => {
  let ativas = 0;
  const consultar: ConsultaYahoo = async (codigo, opcoes) => {
    assert.equal(++ativas, 1);
    assert.equal(opcoes.period1.toISOString().slice(0, 10), '2026-02-28');
    await new Promise(resolve => setTimeout(resolve, 5)); ativas--;
    return { meta: { symbol: codigo, currency: 'BRL' }, quotes: [] };
  };
  const mercado = new MercadoYahoo(consultar, () => Date.parse('2026-03-31T18:00:00Z'));
  await Promise.all([mercado.historico('BBAS3'), mercado.historico('HGLG11')]);
});
