import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MercadoBrapi, ErroMercado } from '../supabase/functions/_shared/mercado-brapi.ts';
import { responderMercado } from '../supabase/functions/_shared/mercado-http.ts';

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
