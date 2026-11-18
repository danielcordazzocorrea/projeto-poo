import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MercadoBrapi, ErroMercado } from '../supabase/functions/_shared/mercado-brapi.ts';
import { responderMercado } from '../supabase/functions/_shared/mercado-http.ts';
import { periodoPremium } from '../supabase/functions/_shared/mercado-periodos.ts';

const instante = Date.parse('2026-11-16T18:00:00Z');
const dia = (data: string) => Date.parse(`${data}T12:00:00Z`) / 1000;
const pontos = [{ date: dia('2026-11-13'), close: 42.5 }, { date: dia('2026-11-12'), close: 41.25 }];
const resposta = (historicalDataPrice: unknown = pontos, symbol = 'PETR4') => ({ results: [{ symbol,
  data: { usedInterval: '1d', usedRange: '1mo', historicalDataPrice } }] });
function criar(body: unknown = resposta(), ticker = 'PETR4', status = 200) {
  let agora = instante;
  const chamadas: URL[] = [];
  const mercado = new MercadoBrapi('segredo', { agora: () => agora, log: () => {}, fetch: async (input, init) => {
    const url = new URL(String(input)); chamadas.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer segredo');
    assert.equal(url.searchParams.has('token'), false);
    if (url.pathname === '/api/quote/list') return Response.json({ stocks: [{ stock: ticker, name: ticker,
      type: ticker === 'PETR4' ? 'stock' : 'fund', subType: ticker === 'HGLG11' ? 'fii' : ticker === 'BOVA11' ? 'etf' : 'stock' }], hasNextPage: false });
    return Response.json(body, { status });
  } });
  return { mercado, chamadas, avancar: (ms: number) => { agora += ms; } };
}

test('histórico normaliza, ordena, coalesce chamadas e expira após uma hora', async () => {
  const { mercado, chamadas, avancar } = criar();
  const [a, b] = await Promise.all([mercado.historico('petr4'), mercado.historico('PETR4')]);
  assert.deepEqual(a, b);
  assert.deepEqual(a.pontos, [{ data: '2026-11-12', preco_brl: '41.25' }, { data: '2026-11-13', preco_brl: '42.50' }]);
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[1]!.pathname, '/api/v2/stocks/historical');
  assert.equal(chamadas[1]!.searchParams.get('range'), '1mo');
  assert.equal(chamadas[1]!.searchParams.get('interval'), '1d');
  avancar(3_599_999);
  assert.equal((await mercado.historico('PETR4')).consultado_em, a.consultado_em);
  assert.equal(chamadas.length, 2);
  avancar(2);
  assert.notEqual((await mercado.historico('PETR4')).consultado_em, a.consultado_em);
  assert.equal(chamadas.length, 4);
});

test('histórico atende ETF e FII pelo endpoint geral sem adivinhar tipo', async () => {
  for (const ticker of ['BOVA11', 'HGLG11']) {
    const { mercado } = criar(resposta(pontos, ticker), ticker);
    assert.equal((await mercado.historico(ticker)).codigo, ticker);
  }
  await assert.rejects(criar().mercado.historico('ZZZZ3'), ErroMercado);
});

test('série vazia, ponto único, lacuna e duplicata idêntica não inventam preços', async () => {
  for (const entrada of [[], [{ date: dia('2026-11-12'), close: null }]]) {
    assert.deepEqual((await criar(resposta(entrada)).mercado.historico('PETR4')).pontos, []);
  }
  assert.equal((await criar(resposta([pontos[0], pontos[0]])).mercado.historico('PETR4')).pontos.length, 1);
});

test('rejeita histórico malformado, de outro ticker e pontos inválidos', async () => {
  for (const body of [{}, resposta(null), resposta(pontos, 'VALE3'),
    resposta([{ date: dia('2026-11-12'), close: -1 }]),
    resposta([{ date: dia('2026-11-12'), close: '42' }]),
    resposta([{ date: instante, close: 42 }]),
    resposta([{ date: '2026-11-12', close: 42 }]),
    resposta([{ date: dia('2026-11-12'), close: 42 }, { date: dia('2026-11-12'), close: 43 }]),
    { results: [{ symbol: 'PETR4', data: { usedRange: '1mo', usedInterval: '1m', historicalDataPrice: pontos } }] }]) {
    await assert.rejects(criar(body).mercado.historico('PETR4'), ErroMercado);
  }
});

test('falha do histórico não impede cotação e não fica em cache', async () => {
  let historicos = 0;
  const mercado = new MercadoBrapi('teste', { log: () => {}, fetch: async input => {
    const url = String(input);
    if (url.includes('/quote/list')) return Response.json({ stocks: [{ stock: 'PETR4', name: 'Petrobras', type: 'stock' }], hasNextPage: false });
    if (url.includes('/historical')) { historicos++; return Response.json({}, { status: 403 }); }
    return Response.json({ results: [{ symbol: 'PETR4', data: { currency: 'BRL', regularMarketPrice: 42 } }] });
  } });
  await assert.rejects(mercado.historico('PETR4'), (e: unknown) => e instanceof ErroMercado && e.codigo === 'ACESSO_NEGADO');
  assert.equal((await mercado.cotar('PETR4')).preco_brl, '42.00');
  await assert.rejects(mercado.historico('PETR4'), ErroMercado);
  assert.equal(historicos, 2);
});

test('rota de histórico valida ticker e método e não armazena resposta HTTP', async () => {
  const { mercado, chamadas } = criar();
  const req = (ticker: string, method = 'GET') => new Request(`https://teste/functions/v1/corretora/mercado/ativos/${ticker}/historico`, { method });
  assert.equal((await responderMercado(req('PETR4', 'POST'), mercado))?.status, 405);
  assert.equal((await responderMercado(req('invalido'), mercado))?.status, 400);
  assert.equal(chamadas.length, 0);
  const response = await responderMercado(req('PETR4'), mercado);
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response?.json()).pontos.length, 2);
});

test('períodos do seletor usam intervalos adequados e caches separados', async () => {
  const consultados: string[] = [];
  const mercado = new MercadoBrapi('teste', { agora: () => instante, fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname === '/api/quote/list') return Response.json({ stocks: [{ stock: 'PETR4', name: 'Petrobras', type: 'stock' }], hasNextPage: false });
    const range = url.searchParams.get('range');
    const interval = url.searchParams.get('interval');
    consultados.push(`${range}:${interval}`);
    return Response.json({ results: [{ symbol: 'PETR4', data: { usedRange: range, usedInterval: interval, historicalDataPrice: pontos } }] });
  } });
  for (const periodo of ['1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '5y', 'max']) {
    const req = new Request(`https://teste/functions/v1/corretora/mercado/ativos/PETR4/historico?periodo=${periodo}`);
    const response = await responderMercado(req, mercado);
    assert.equal(response?.status, 200);
    assert.equal((await response?.json()).periodo, periodo);
    await mercado.historico('PETR4', periodo);
  }
  assert.deepEqual(consultados, ['1d:5m', '5d:60m', '1mo:1d', '3mo:1d', '6mo:1d', 'ytd:1d', '1y:1d', '5y:1wk', 'max:1mo']);
});

test('demonstração gratuita libera até três meses e preserva exceções de teste', () => {
  for (const ativo of ['BBAS3', 'BOVA11', 'HGLG11', 'PETR3', 'ITUB3']) {
    for (const periodo of ['1d', '5d', '1mo', '3mo'] as const) assert.equal(periodoPremium(ativo, periodo), false);
    for (const periodo of ['6mo', 'ytd', '1y', '5y', 'max'] as const) assert.equal(periodoPremium(ativo, periodo), true);
  }
  for (const ativo of ['PETR4', 'ITUB4', 'VALE3', 'MGLU3', ' petr4 ']) {
    for (const periodo of ['6mo', 'ytd', '1y', '5y', 'max'] as const) assert.equal(periodoPremium(ativo, periodo), false);
  }
});

test('períodos intradiários preservam pontos do mesmo dia e expiram em cinco minutos', async () => {
  const body = { results: [{ symbol: 'PETR4', data: { usedRange: '1d', usedInterval: '5m', historicalDataPrice: [
    { date: dia('2026-11-13'), close: 42 }, { date: dia('2026-11-13') + 300, close: 43 },
  ] } }] };
  const { mercado, chamadas, avancar } = criar(body);
  const historico = await mercado.historico('PETR4', '1d');
  assert.deepEqual(historico.pontos.map(p => p.data), ['2026-11-13T12:00:00.000Z', '2026-11-13T12:05:00.000Z']);
  avancar(299_999);
  await mercado.historico('PETR4', '1d');
  assert.equal(chamadas.length, 2);
  avancar(2);
  await mercado.historico('PETR4', '1d');
  assert.equal(chamadas.length, 4);
});

test('período curto usa pontos diários quando o plano não libera intradiário', async () => {
  const chamadas: string[] = [];
  const mercado = new MercadoBrapi('segredo', { agora: () => instante, fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname === '/api/quote/list') return Response.json({ stocks: [
      { stock: 'PETR4', name: 'Petrobras', type: 'stock' }], hasNextPage: false });
    const intervalo = url.searchParams.get('interval')!;
    chamadas.push(intervalo);
    if (intervalo === '5m') return Response.json({ message: 'Plano não permite' }, { status: 400 });
    return Response.json({ results: [{ symbol: 'PETR4', data: {
      usedRange: '1d', usedInterval: '1d', historicalDataPrice: [{ date: dia('2026-11-16'), close: 42 }],
    } }] });
  } });
  const historico = await mercado.historico('PETR4', '1d');
  assert.equal(historico.intervalo, '1d');
  assert.deepEqual(historico.pontos, [{ data: '2026-11-16', preco_brl: '42.00' }]);
  assert.deepEqual(chamadas, ['5m', '1d']);
});

test('cotação e histórico compartilham uma fila para respeitar limite de simultaneidade', async () => {
  let ativas = 0;
  let maxAtivas = 0;
  const mercado = new MercadoBrapi('segredo', { agora: () => instante, fetch: async input => {
    ativas++;
    maxAtivas = Math.max(maxAtivas, ativas);
    await new Promise(resolve => setTimeout(resolve, 5));
    const url = new URL(String(input));
    ativas--;
    if (maxAtivas > 1) return Response.json({ message: 'Muitas chamadas simultâneas' }, { status: 429 });
    if (url.pathname === '/api/quote/list') return Response.json({ stocks: [
      { stock: 'PETR4', name: 'Petrobras', type: 'stock' }], hasNextPage: false });
    if (url.pathname.endsWith('/quote')) return Response.json({ results: [{ symbol: 'PETR4', data: {
      currency: 'BRL', regularMarketPrice: 42,
    } }] });
    return Response.json(resposta());
  } });
  const [cotacao, historico] = await Promise.all([mercado.cotar('PETR4'), mercado.historico('PETR4')]);
  assert.equal(cotacao.preco_brl, '42.00');
  assert.equal(historico.pontos.length, 2);
  assert.equal(maxAtivas, 1);
});

test('rejeita períodos desconhecidos antes da API, incluindo propriedades de Object', async () => {
  const { mercado, chamadas } = criar();
  for (const periodo of ['', '2y', '__proto__', 'constructor', 'toString']) {
    const response = await responderMercado(new Request(`https://teste/functions/v1/corretora/mercado/ativos/PETR4/historico?periodo=${periodo}`), mercado);
    assert.equal(response?.status, 400);
    assert.equal((await response?.json()).codigo, 'PERIODO_INVALIDO');
  }
  assert.equal(chamadas.length, 0);
});

test('período negado pelo provedor tem erro próprio e não usa outro período', async () => {
  const { mercado } = criar({ message: 'segredo do provedor' }, 'PETR4', 400);
  await assert.rejects(mercado.historico('PETR4', '5y'), (e: unknown) => e instanceof ErroMercado &&
    e.status === 422 && e.codigo === 'PERIODO_INDISPONIVEL' && !e.message.includes('segredo'));
  await assert.rejects(criar().mercado.historico('PETR4', '6mo'), (e: unknown) => e instanceof ErroMercado && e.codigo === 'RESPOSTA_INVALIDA');
});
