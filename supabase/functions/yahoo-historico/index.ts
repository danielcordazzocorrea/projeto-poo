import YahooFinance from 'npm:yahoo-finance2@4.0.6';
import { withSupabase } from 'npm:@supabase/server@1';
import { MercadoYahoo } from '../_shared/mercado-yahoo.ts';
import { ErroMercado } from '../_shared/mercado-brapi.ts';

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const mercado = new MercadoYahoo((simbolo, opcoes) => yahoo.chart(simbolo, opcoes, {
  fetchOptions: { signal: AbortSignal.timeout(15000) },
}));

// Função experimental independente: não substitui a corretora publicada.
Deno.serve(withSupabase({ auth: 'user' }, async req => {
  if (req.method !== 'GET') return Response.json({ erro: 'Método não permitido.' }, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(req.url);
  try {
    return Response.json(await mercado.historico(url.searchParams.get('ticker') ?? '', url.searchParams.get('periodo') ?? '1mo'),
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (erro) {
    if (erro instanceof ErroMercado) return Response.json({ erro: erro.message, codigo: erro.codigo }, { status: erro.status });
    return Response.json({ erro: 'Histórico experimental indisponível.' }, { status: 502 });
  }
}));
