import type { Plugin } from 'vite';
import YahooFinance from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';
import { MercadoYahoo } from '../supabase/functions/_shared/mercado-yahoo.ts';
import { ErroMercado } from '../supabase/functions/_shared/mercado-brapi.ts';

export function yahooTeste(url: string, chave: string): Plugin {
  const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  const mercado = new MercadoYahoo((simbolo, opcoes) => yahoo.chart(simbolo, opcoes, {
    fetchOptions: { signal: AbortSignal.timeout(15000) },
  }));
  const auth = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  return { name: 'yahoo-history-test', configureServer(server) {
    server.middlewares.use('/api/yahoo-history', async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      const enviar = (status: number, dados: unknown) => { res.statusCode = status; res.end(JSON.stringify(dados)); };
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); enviar(405, { erro: 'Método não permitido.' }); return; }
      try {
        const jwt = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!jwt) { enviar(401, { erro: 'Entre na conta para consultar o histórico.' }); return; }
        const { data, error } = await auth.auth.getUser(jwt);
        if (error || !data.user) { enviar(401, { erro: 'Sessão inválida. Entre novamente.' }); return; }
        const parametros = new URL(req.url ?? '/', 'http://localhost').searchParams;
        enviar(200, await mercado.historico(parametros.get('ticker') ?? '', parametros.get('periodo') ?? '1mo'));
      } catch (erro) {
        if (erro instanceof ErroMercado) enviar(erro.status, { erro: erro.message, codigo: erro.codigo });
        else enviar(502, { erro: 'Consulta experimental indisponível.' });
      }
    });
  } };
}
