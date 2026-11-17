import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BarChart3, Clock3, Search } from 'lucide-react';
import type { BuscaAtivos, CotacaoAtivo } from '../supabase/functions/_shared/mercado-brapi';
import type { TipoMoeda } from './moeda';
import type { AccountErrorNotice } from './account-errors';
import { queryErrorNotice, readQueryResponse } from './query-errors';
import { InvestmentTradeError } from './investment-trade';
import { mapAccountError } from './account-errors';
import { validAssetSearch, validAssetQuote } from './query-validation';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
async function consultar<T>(caminho: string, token: string, signal: AbortSignal): Promise<T> {
  const resposta = await fetch(`${url}/functions/v1/corretora/mercado/ativos${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${token}` }, signal,
  });
  return readQueryResponse<T>(resposta, 'market', caminho.startsWith('?') ? validAssetSearch : validAssetQuote);
}
function horario(valor: string | null): string {
  return valor ? new Date(valor).toLocaleString('pt-BR', { timeZoneName: 'short' }) : 'Não informado pelo provedor';
}
function preco(valor: string): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function MercadoAtivos({ token, onPurchase, saldoPrincipal, moedaPrincipal, onQueryError, onTradeError, onRefresh, loading }: {
  token: string;
  onPurchase: (codigoAtivo: string, quantidade: string) => Promise<void>;
  saldoPrincipal: string;
  moedaPrincipal: TipoMoeda;
  onQueryError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onTradeError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<BuscaAtivos | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [cotacao, setCotacao] = useState<CotacaoAtivo | null>(null);
  const [erroBusca, setErroBusca] = useState(false);
  const [erroCotacao, setErroCotacao] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [cotando, setCotando] = useState(false);
  const [quantidade, setQuantidade] = useState('1');
  const [comprando, setComprando] = useState(false);
  const purchaseQuantityInput = useRef<HTMLInputElement>(null);
  const [compraConcluida, setCompraConcluida] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLista(null); setErroBusca(false);
    if (busca.trim().length < 2) { setBuscando(false); return () => controller.abort(); }
    setBuscando(true);
    const timer = setTimeout(() => {
      void consultar<BuscaAtivos>(`?busca=${encodeURIComponent(busca.trim())}&pagina=${pagina}`, token, controller.signal)
        .then(dados => { if (!controller.signal.aborted) setLista(dados); })
        .catch(erro => {
          if (controller.signal.aborted) return;
          setErroBusca(true);
          const notice = queryErrorNotice(erro, 'market');
          onQueryError(notice, notice.action === 'reload' ? () => setSearchRetry(value => value + 1)
            : notice.action === 'edit-search' ? () => searchInput.current?.focus() : undefined);
        })
        .finally(() => { if (!controller.signal.aborted) setBuscando(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [busca, pagina, token, searchRetry, onQueryError]);

  useEffect(() => {
    const controller = new AbortController();
    setCotacao(null); setErroCotacao(false);
    if (!ticker) { setCotando(false); return () => controller.abort(); }
    setCotando(true);
    void consultar<CotacaoAtivo>(`/${encodeURIComponent(ticker)}`, token, controller.signal)
      .then(dados => { if (!controller.signal.aborted) setCotacao(dados); })
      .catch(erro => {
        if (controller.signal.aborted) return;
        setErroCotacao(true);
        const notice = queryErrorNotice(erro, 'market');
        onQueryError(notice, notice.action === 'reload' ? () => setQuoteRetry(value => value + 1)
          : notice.action === 'edit-search' ? () => searchInput.current?.focus() : undefined);
      })
      .finally(() => { if (!controller.signal.aborted) setCotando(false); });
    return () => controller.abort();
  }, [ticker, token, quoteRetry, onQueryError]);

  async function comprar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cotacao || comprando || loading) return;
    setComprando(true); setCompraConcluida(false);
    try {
      await onPurchase(cotacao.codigo, quantidade.trim().replace(',', '.'));
      setCompraConcluida(true);
    } catch (error) {
      const notice = error instanceof InvestmentTradeError ? error.notice : mapAccountError(error, { operation: 'purchase' });
      const recover = notice.action === 'edit-quantity' ? () => purchaseQuantityInput.current?.focus()
        : notice.action === 'check-balances' || notice.action === 'reload' ? onRefresh : undefined;
      onTradeError(notice, recover);
    } finally { setComprando(false); }
  }

  return <div className="account-market">
    <header className="market-heading">
      <div>
        <p className="market-kicker">Mercado</p>
        <h3>Encontre ativos para acompanhar</h3>
        <p>Pesquise pelo nome ou ticker.</p>
      </div>
      <span className="market-heading-icon"><BarChart3 size={24} aria-hidden /></span>
    </header>

    <div className="market-search-panel">
      <label htmlFor="market-search">Nome ou ticker</label>
      <div className="market-search-input">
        <Search size={18} aria-hidden />
        <input ref={searchInput} id="market-search" type="search" value={busca} maxLength={80} placeholder="Ex.: PETR4 ou Petrobras" autoComplete="off"
          onChange={event => { setBusca(event.target.value); setPagina(1); setTicker(null); setCotacao(null); setLista(null); setCompraConcluida(false); }} />
      </div>
      <p>Cotações de referência podem ter atraso de aproximadamente 30 minutos.</p>
    </div>

    {busca.trim().length < 2 && <p className="market-search-hint">Digite pelo menos 2 caracteres para buscar ativos.</p>}
    {buscando && <p className="market-state" role="status">Buscando ativos…</p>}
    {erroBusca && <button type="button" className="account-detail-refresh" onClick={() => setSearchRetry(value => value + 1)}>Buscar novamente</button>}
    {lista && <section className="market-search-results" aria-label="Resultados da busca">
      <div className="market-section-title"><h4>Resultados</h4><span>Página {pagina}</span></div>
      {lista.ativos.length === 0 && <p className="market-state">Nenhum ativo compatível nesta página.</p>}
      <ul className="market-results">{lista.ativos.map(ativo => <li key={ativo.codigo}>
        <button type="button" aria-pressed={ticker === ativo.codigo} onClick={() => { setTicker(ativo.codigo); setCompraConcluida(false); }}>
          <span className="market-result-symbol">{ativo.codigo.slice(0, 1)}</span>
          <span className="market-result-main"><strong>{ativo.codigo}</strong><span>{ativo.nome}</span></span>
          <span className="market-result-type">{ativo.tipo}</span>
        </button>
      </li>)}</ul>
      <nav className="market-pagination" aria-label="Páginas de ativos">
        <button type="button" disabled={pagina <= 1 || buscando} onClick={() => setPagina(valor => valor - 1)}>Anterior</button>
        <button type="button" disabled={!lista.tem_proxima || buscando} onClick={() => setPagina(valor => valor + 1)}>Próxima</button>
      </nav>
    </section>}

    {cotando && <p className="market-state" role="status">Consultando {ticker}…</p>}
    {erroCotacao && <button type="button" className="account-detail-refresh" onClick={() => setQuoteRetry(value => value + 1)}>Consultar cotação novamente</button>}
    {cotacao && <section className="market-quote-grid" aria-label="Cotação do ativo" aria-live="polite">
      <article className="market-quote-card market-price-card">
        <div className="market-card-heading"><span>Cotação atual</span><span className="market-live-indicator">Referência</span></div>
        <div className="market-asset-title"><span>{cotacao.codigo}</span><h4>{cotacao.nome}</h4></div>
        <strong className="market-price">{preco(cotacao.preco_brl)}</strong>
        <p><Clock3 size={14} aria-hidden />{horario(cotacao.cotacao_em)}</p>
        <span className="market-main-balance">Saldo da conta principal: <strong>{saldoPrincipal}</strong></span>
        <form className="market-buy-form" onSubmit={event => void comprar(event)}>
          <label htmlFor="market-quantity">Quantidade</label>
          <div><input ref={purchaseQuantityInput} id="market-quantity" type="text" inputMode="decimal" value={quantidade} onChange={event => setQuantidade(event.target.value)} placeholder="1" required disabled={comprando || loading} />
            <button type="submit" disabled={comprando || loading || moedaPrincipal !== 'BRL'}>{comprando ? 'Comprando…' : 'Comprar ativo'}</button></div>
        </form>
        {moedaPrincipal !== 'BRL' && <span className="market-buy-error">Converta o saldo principal para BRL antes de comprar.</span>}
        {compraConcluida && <span className="market-buy-success" role="status">Compra concluída. Sua carteira foi atualizada.</span>}
      </article>

      <article className="market-quote-card market-chart-card">
        <div className="market-card-heading"><span>Evolução do preço</span><span>Em breve</span></div>
        <div className="market-chart-placeholder">
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden>
            <path d="M0 77 C28 70 38 42 68 55 S110 78 135 48 S174 34 201 49 S239 72 267 31 S287 28 300 17" />
            <path className="market-chart-area" d="M0 77 C28 70 38 42 68 55 S110 78 135 48 S174 34 201 49 S239 72 267 31 S287 28 300 17 V100 H0Z" />
          </svg>
          <span>O gráfico deste ativo será exibido aqui.</span>
        </div>
      </article>

      <article className="market-quote-card market-details-card">
        <div className="market-card-heading"><span>Dados da consulta</span><span>brapi</span></div>
        <dl>
          <div><dt>Tipo de ativo</dt><dd>{cotacao.tipo}</dd></div>
          <div><dt>Consultado em</dt><dd>{horario(cotacao.consultado_em)}</dd></div>
          <div><dt>Moeda</dt><dd>Real brasileiro</dd></div>
        </dl>
      </article>
    </section>}
  </div>;
}
