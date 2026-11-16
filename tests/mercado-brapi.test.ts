import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MercadoBrapi, ErroMercado } from '../supabase/functions/_shared/mercado-brapi.ts';
import { responderMercado } from '../supabase/functions/_shared/mercado-http.ts';

const instante = Date.parse('2026-11-15T15:00:00Z');
const stocks = [
  { stock: 'PETR4F', name: 'Petrobras fracionario', type: 'stock', subType: 'stock' },
  { stock: 'PETR4', name: 'Petrobras', type: 'stock', subType: 'stock' },
  { stock: 'BOVA11', name: 'ETF Bovespa', type: 'fund', subType: 'etf' },
  { stock: 'HGLG11', name: 'Fundo imobiliário', type: 'fund', subType: 'fii' },
  { stock: 'XXXX11', name: 'Fundo sem classificação', type: 'fund' },
  { stock: 'AAPL34', name: 'BDR', type: 'bdr', subType: 'bdr' },
];
const lista = { stocks, hasNextPage: false };
const preco = { currency: 'BRL', regularMarketPrice: 32.5, regularMarketTime: '2026-11-15T14:30:00Z' };
const cotacao = (data: unknown = preco) => ({ results: [{ symbol: 'PETR4', data }] });
function simulado(quote = cotacao(), opcoes: { agora?: () => number } = {}) {
  const chamadas: string[] = [];
  const mercado = new MercadoBrapi('segredo-teste', { ...opcoes, log: () => {}, fetch: async (input, init) => {
    const url = String(input); chamadas.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer segredo-teste');
    assert.ok(!url.includes('segredo-teste'));
    return Response.json(url.includes('/quote/list') ? lista : quote);
  } });
  return { mercado, chamadas };
}
test('busca por nome normaliza tipos sem adivinhar fundos, pagina e reutiliza cache', async () => {
  const { mercado, chamadas } = simulado();
  const resultado = await mercado.buscar('Petrobras', 2);
  assert.deepEqual(resultado.ativos.map(a => a.tipo), ['ACAO', 'ETF', 'FII']);
  assert.equal(resultado.pagina, 2);
  assert.deepEqual(resultado.ativos.map(a => a.codigo), ['PETR4', 'BOVA11', 'HGLG11']);
  assert.ok(chamadas[0]?.includes('search=PETROBRAS'));
  await mercado.buscar(' petrobras ', 2);
  assert.equal(chamadas.length, 1);
});
test('cotação v2 normaliza dinheiro e preserva horários distintos; coalesce chamadas', async () => {
  const { mercado, chamadas } = simulado(cotacao(), { agora: () => instante });
  const [a, b] = await Promise.all([mercado.cotar('petr4'), mercado.cotar('PETR4')]);
  assert.deepEqual(a, b);
  assert.equal(a.preco_brl, '32.50');
  assert.equal(a.cotacao_em, '2026-11-15T14:30:00.000Z');
  assert.equal(a.consultado_em, '2026-11-15T15:00:00.000Z');
  assert.equal(a.fonte, 'brapi');
  assert.equal(chamadas.length, 2);
});
test('horário ausente ou inválido permanece null', async () => {
  for (const regularMarketTime of [null, '', 'invalido']) {
    const { mercado } = simulado(cotacao({ ...preco, regularMarketTime }));
    assert.equal((await mercado.cotar('PETR4')).cotacao_em, null);
  }
});
test('rejeita preços ausentes, inválidos, negativos e moeda diferente', async () => {
  for (const data of [{ ...preco, regularMarketPrice: null }, { ...preco, regularMarketPrice: -1 },
    { ...preco, regularMarketPrice: '32.50' }, { ...preco, currency: 'USD' }]) {
    await assert.rejects(simulado(cotacao(data)).mercado.cotar('PETR4'), (e: unknown) => e instanceof ErroMercado && e.codigo === 'PRECO_INDISPONIVEL');
  }
});
test('cache de cotação expira sem alterar horário de uma resposta armazenada', async () => {
  let agora = instante;
  const { mercado, chamadas } = simulado(cotacao(), { agora: () => agora });
  await mercado.cotar('PETR4');
  agora += 30_000;
  assert.equal((await mercado.cotar('PETR4')).consultado_em, new Date(instante).toISOString());
  agora += 31_000;
  assert.equal((await mercado.cotar('PETR4')).consultado_em, new Date(agora).toISOString());
  assert.equal(chamadas.length, 3);
  agora += 300_001;
  await mercado.buscar('PETR4');
  assert.equal(chamadas.length, 4);
});
test('entradas inválidas e ausência de token não chamam o provedor', async () => {
  let chamadas = 0;
  const mercado = new MercadoBrapi('', { fetch: async () => { chamadas++; return Response.json({}); } });
  for (const executar of [() => mercado.buscar('a'), () => mercado.buscar('ab', 0), () => mercado.buscar('ab', 1.5),
    () => mercado.cotar('PETR4/VALE3'), () => mercado.buscar('petr')]) await assert.rejects(executar, ErroMercado);
  assert.equal(chamadas, 0);
});
test('mapeia erros HTTP, registra somente limites e não vaza corpo do provedor', async () => {
  for (const [status, esperado] of [[401, 503], [403, 503], [404, 404], [429, 429], [500, 502]]) {
    const logs: unknown[] = [];
    const mercado = new MercadoBrapi('segredo', { log: l => logs.push(l), fetch: async () =>
      Response.json({ erro: 'segredo' }, { status, headers: { 'RateLimit-Limit': '15000', 'RateLimit-Remaining': '0', 'RateLimit-Reset': '123' } }) });
    await assert.rejects(mercado.buscar('PETR'), (e: unknown) => e instanceof ErroMercado && e.status === esperado && !e.message.includes('segredo'));
    assert.deepEqual(logs, [{ 'RateLimit-Limit': '15000', 'RateLimit-Remaining': '0', 'RateLimit-Reset': '123' }]);
  }
});
test('429 suspende novas chamadas e permite tentar depois do intervalo', async () => {
  let agora = instante, chamadas = 0;
  const mercado = new MercadoBrapi('teste', { agora: () => agora, fetch: async () => {
    chamadas++; return chamadas === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '2' } }) : Response.json(lista);
  } });
  await assert.rejects(mercado.buscar('PETR'), ErroMercado);
  await assert.rejects(mercado.buscar('VALE'), ErroMercado);
  assert.equal(chamadas, 1);
  agora += 2001;
  await mercado.buscar('VALE');
  assert.equal(chamadas, 2);
});
test('timeout aborta a requisição e falhas não ficam em cache', async () => {
  let chamadas = 0;
  const mercado = new MercadoBrapi('teste', { timeoutMs: 5, fetch: async (_input, init) => {
    chamadas++;
    if (chamadas > 1) return Response.json(lista);
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))));
  } });
  await assert.rejects(mercado.buscar('PETR'), (e: unknown) => e instanceof ErroMercado && e.status === 504);
  await mercado.buscar('PETR');
  assert.equal(chamadas, 2);
});
test('trata JSON inválido, rede e estrutura inesperada', async () => {
  for (const fetcher of [async () => new Response('invalido'), async () => Response.json({}),
    async () => { throw new Error('segredo'); }]) {
    await assert.rejects(new MercadoBrapi('teste', { fetch: fetcher }).buscar('PETR'), (e: unknown) => e instanceof ErroMercado && e.status === 502 && !e.message.includes('segredo'));
  }
});
test('não aceita cotação de outro ticker nem ativo ausente', async () => {
  await assert.rejects(simulado({ results: [{ symbol: 'VALE3', data: preco }] }).mercado.cotar('PETR4'), ErroMercado);
  await assert.rejects(simulado().mercado.cotar('ZZZZ3'), (e: unknown) => e instanceof ErroMercado && e.status === 404);
});
test('rotas de mercado validam método, consulta e parâmetros sem interceptar conta', async () => {
  const { mercado } = simulado();
  const req = (path: string, method = 'GET') => new Request('https://teste/functions/v1/corretora' + path, { method });
  assert.equal(await responderMercado(req('/conta'), mercado), null);
  assert.equal((await responderMercado(req('/mercado/ativos?busca=PETR'), mercado))?.status, 200);
  assert.equal((await responderMercado(req('/mercado/ativos/PETR4'), mercado))?.status, 200);
  assert.equal((await responderMercado(req('/mercado/ativos?busca=P'), mercado))?.status, 400);
  assert.equal((await responderMercado(req('/mercado/ativos?busca=PETR&pagina=abc'), mercado))?.status, 400);
  assert.equal((await responderMercado(req('/mercado/ativos', 'POST'), mercado))?.status, 405);
});
