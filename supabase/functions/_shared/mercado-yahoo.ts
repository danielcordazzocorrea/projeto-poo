import { ErroMercado, type HistoricoAtivo } from './mercado-brapi.ts';
import { PERIODOS_HISTORICO, periodoValido } from './mercado-periodos.ts';

export type ConsultaYahoo = (simbolo: string, opcoes: {
  period1: Date; period2: Date; interval: HistoricoAtivo['intervalo'];
}) => Promise<unknown>;

export class MercadoYahoo {
  private cache = new Map<string, { vence: number; valor: HistoricoAtivo }>();
  private pendentes = new Map<string, Promise<HistoricoAtivo>>();
  private fila: Promise<unknown> = Promise.resolve();
  constructor(private consultar: ConsultaYahoo, private agora = Date.now) {}

  async historico(ticker: string, periodo = '1mo'): Promise<HistoricoAtivo> {
    const codigo = ticker.trim().toUpperCase();
    if (!/^[A-Z]{4}\d{1,2}$/.test(codigo)) throw new ErroMercado(400, 'TICKER_INVALIDO', 'Ticker inválido.');
    if (!periodoValido(periodo)) throw new ErroMercado(400, 'PERIODO_INVALIDO', 'Período inválido.');
    const chave = `${codigo}:${periodo}`;
    const salvo = this.cache.get(chave);
    if (salvo && salvo.vence > this.agora()) return salvo.valor;
    const pendente = this.pendentes.get(chave);
    if (pendente) return pendente;
    const carregar = async (): Promise<HistoricoAtivo> => {
      const fim = new Date(this.agora());
      const inicio = new Date(fim);
      if (periodo === 'max') inicio.setTime(Date.UTC(1970, 0, 1));
      else if (periodo === 'ytd') inicio.setTime(Date.UTC(fim.getUTCFullYear(), 0, 1));
      else if (periodo === '1d' || periodo === '5d') inicio.setUTCDate(inicio.getUTCDate() - (periodo === '1d' ? 1 : 5));
      else {
        const meses = { '1mo': 1, '3mo': 3, '6mo': 6, '1y': 12, '5y': 60 }[periodo];
        // Evita que 31 de março menos um mês transborde para março novamente.
        const dia = inicio.getUTCDate(); inicio.setUTCDate(1);
        inicio.setUTCMonth(inicio.getUTCMonth() - meses);
        const ultimoDia = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0)).getUTCDate();
        inicio.setUTCDate(Math.min(dia, ultimoDia));
      }
      const intervalo = PERIODOS_HISTORICO[periodo].intervalo;
      let bruto: unknown;
      try { bruto = await this.consultar(`${codigo}.SA`, { period1: inicio, period2: fim, interval: intervalo }); }
      catch { throw new ErroMercado(502, 'YAHOO_INDISPONIVEL', 'Não foi possível consultar o Yahoo Finance. Tente novamente mais tarde ou escolha outro período.'); }
      const dados = bruto as { meta?: { symbol?: string; currency?: string }; quotes?: { date: Date; close: number | null }[] } | null;
      if (!dados || dados.meta?.symbol !== `${codigo}.SA` || dados.meta.currency !== 'BRL' ||
          !Array.isArray(dados.quotes) || dados.quotes.length > 10000) {
        throw new ErroMercado(502, 'RESPOSTA_INVALIDA', 'Histórico Yahoo inválido ou sem preço em BRL.');
      }
      const intradiario = intervalo === '5m' || intervalo === '60m';
      const pontos = new Map<string, string>();
      for (const ponto of dados.quotes) {
        if (ponto?.close === null) continue;
        if (!ponto || !(ponto.date instanceof Date) || !Number.isFinite(ponto.date.getTime()) ||
            ponto.date.getTime() > fim.getTime() || ponto.date.getTime() < Date.UTC(1970, 0, 1) ||
            typeof ponto.close !== 'number' || !Number.isFinite(ponto.close) || ponto.close <= 0 || ponto.close >= 1e12) {
          throw new ErroMercado(502, 'RESPOSTA_INVALIDA', 'Ponto de histórico Yahoo inválido.');
        }
        const data = intradiario ? ponto.date.toISOString() : ponto.date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const preco = ponto.close.toFixed(2);
        if (pontos.has(data) && pontos.get(data) !== preco) throw new ErroMercado(502, 'RESPOSTA_INVALIDA', 'Histórico Yahoo com datas conflitantes.');
        pontos.set(data, preco);
      }
      const valor: HistoricoAtivo = { codigo, periodo, intervalo, fonte: 'yahoo', consultado_em: fim.toISOString(),
        pontos: [...pontos].sort(([a], [b]) => a.localeCompare(b)).map(([data, preco_brl]) => ({ data, preco_brl })) };
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(chave, { valor, vence: this.agora() + (intradiario ? 300_000 : 3_600_000) });
      return valor;
    };
    const promessa = this.fila.then(carregar).finally(() => this.pendentes.delete(chave));
    this.fila = promessa.catch(() => {});
    this.pendentes.set(chave, promessa);
    return promessa;
  }
}
