import YahooFinance from 'yahoo-finance2';
import { MercadoYahoo } from '../dist/supabase/functions/_shared/mercado-yahoo.js';
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const mercado = new MercadoYahoo((simbolo, opcoes) => yahoo.chart(simbolo, opcoes, { fetchOptions: { signal: AbortSignal.timeout(15000) } }));
for (const ticker of ['BBAS3', 'BOVA11', 'HGLG11']) {
  try {
    const historico = await mercado.historico(ticker, '6mo');
    console.log(JSON.stringify({ ticker, periodo: historico.periodo, fonte: historico.fonte, pontos: historico.pontos.length,
      inicio: historico.pontos[0]?.data, fim: historico.pontos.at(-1)?.data }));
  } catch (erro) { console.log(JSON.stringify({ ticker, codigo: erro.codigo ?? 'ERRO' })); process.exitCode = 1; }
}
