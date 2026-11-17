import type { HistoricoAtivo } from '../supabase/functions/_shared/mercado-brapi.ts';
import type { PeriodoHistorico } from '../supabase/functions/_shared/mercado-periodos.ts';

export async function consultarHistoricoYahoo({ url, chave, token, ticker, periodo, signal, local = false, fetcher = fetch }: {
  url: string; chave: string; token: string; ticker: string; periodo: PeriodoHistorico;
  signal: AbortSignal; local?: boolean; fetcher?: typeof fetch;
}): Promise<HistoricoAtivo> {
  const parametros = new URLSearchParams({ ticker, periodo });
  const endpoint = local ? `/api/yahoo-history?${parametros}` : `${url.replace(/\/$/, '')}/functions/v1/yahoo-historico?${parametros}`;
  const resposta = await fetcher(endpoint, {
    headers: local ? { Authorization: `Bearer ${token}` } : { apikey: chave, Authorization: `Bearer ${token}` }, signal,
  });
  let dados: unknown;
  try { dados = await resposta.json(); }
  catch { throw new Error('O serviço de histórico devolveu uma resposta inválida. Tente novamente.'); }
  const objeto = dados as Partial<HistoricoAtivo> & { erro?: string } | null;
  if (!resposta.ok) {
    if (resposta.status === 401) throw new Error('Sua sessão expirou. Entre novamente para consultar o histórico.');
    if (resposta.status === 404) throw new Error('O serviço Yahoo não está disponível neste ambiente.');
    throw new Error(typeof objeto?.erro === 'string' ? objeto.erro : 'Yahoo Finance indisponível. Tente novamente mais tarde.');
  }
  if (!objeto || objeto.fonte !== 'yahoo' || objeto.codigo !== ticker || objeto.periodo !== periodo ||
      !['5m', '60m', '1d', '1wk', '1mo'].includes(objeto.intervalo ?? '') || !Array.isArray(objeto.pontos) ||
      objeto.pontos.some(p => !p || typeof p.data !== 'string' || !Number.isFinite(Date.parse(p.data)) ||
        typeof p.preco_brl !== 'string' || !/^\d+\.\d{2}$/.test(p.preco_brl) || Number(p.preco_brl) <= 0)) {
    throw new Error('O serviço Yahoo devolveu um histórico incompatível com o ativo ou período solicitado.');
  }
  return objeto as HistoricoAtivo;
}
