import { t } from '@/frontend/idioma';
import { aceitaEntradaDecimal } from './moeda';
import { consultarHistoricoYahoo } from './historico-cliente';
import { SaldoDisponivel } from './saldo-disponivel';
import { PERIODOS_HISTORICO, type PeriodoHistorico } from '../supabase/functions/_shared/mercado-periodos';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BarChart3, Clock3, Search } from 'lucide-react';
import type { BuscaAtivos, CotacaoAtivo, HistoricoAtivo } from '../supabase/functions/_shared/mercado-brapi';
import type { AccountErrorNotice } from './account-errors';
import { queryErrorNotice, readQueryResponse } from './query-errors';
import { InvestmentTradeError } from './investment-trade';
import { mapAccountError } from './account-errors';
import { prepararRevisaoCompra, type PurchaseReview } from './purchase-review';
import { RegraDeNegocio } from '../supabase/functions/_shared/dominio';
import { validAssetSearch, validAssetQuote, validAssetHistory } from './query-validation';
import { GraficoAtivo } from './mercado-grafico';
import type { ComprovanteCompra } from './investment-account';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
const testeYahoo = import.meta.env.VITE_YAHOO_TEST === 'true';
async function consultarHistorico(ticker: string, periodo: PeriodoHistorico, token: string, signal: AbortSignal): Promise<HistoricoAtivo> {
  return consultarHistoricoYahoo({ url, chave, ticker, periodo, token, signal, local: testeYahoo });
}
async function consultar<T>(caminho: string, token: string, signal: AbortSignal): Promise<T> {
  const resposta = await fetch(`${url}/functions/v1/corretora/mercado/ativos${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${token}` }, signal,
  });
  return readQueryResponse<T>(resposta, 'market', caminho.startsWith('?') ? validAssetSearch : caminho.includes('/historico?') ? validAssetHistory : validAssetQuote);
}
function horario(valor: string | null): string {
  return valor ? new Date(valor).toLocaleString('pt-BR', { timeZoneName: 'short' }) : 'Não informado pelo provedor';
}
export function consultarCotacao(codigo: string, token: string, signal: AbortSignal) {
  return consultar<CotacaoAtivo>(`/${encodeURIComponent(codigo)}`, token, signal);
}
function preco(valor: string): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function MercadoAtivos({ token, onPurchase, onPurchaseSuccess, saldoInvestimentos, saldoInvestimentosValor,
  contaCarregada, onQueryError, onTradeError, onRefresh, loading }: {
  token: string;
  onPurchase: (codigoAtivo: string, quantidade: string, precoConfirmado: string) => Promise<ComprovanteCompra>;
  onPurchaseSuccess: (comprovante: ComprovanteCompra) => void;
  saldoInvestimentos: string;
  saldoInvestimentosValor: string | null;
  contaCarregada: boolean;
  onQueryError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onTradeError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<BuscaAtivos | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoHistorico>('1mo');
  const periodoGrafico = periodoSelecionado;
  const [cotacao, setCotacao] = useState<CotacaoAtivo | null>(null);
  const [erroBusca, setErroBusca] = useState(false);
  const [erroCotacao, setErroCotacao] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [cotando, setCotando] = useState(false);
  const [historico, setHistorico] = useState<HistoricoAtivo | null>(null);
  const [erroHistorico, setErroHistorico] = useState('');
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [tentativaHistorico, setTentativaHistorico] = useState(0);
  const [quantidade, setQuantidade] = useState('1');
  const [comprando, setComprando] = useState(false);
  const [conferindoCompra, setConferindoCompra] = useState(false);
  const [revisaoCompra, setRevisaoCompra] = useState<PurchaseReview | null>(null);
  const purchaseQuantityInput = useRef<HTMLInputElement>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (revisaoCompra && !reviewDialog.current?.open) reviewDialog.current?.showModal();
  }, [revisaoCompra]);

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

  useEffect(() => {
    const controller = new AbortController();
    setHistorico(null); setErroHistorico('');
    if (!ticker) { setCarregandoHistorico(false); return () => controller.abort(); }
    setCarregandoHistorico(true);
    void consultarHistorico(ticker, periodoGrafico, token, controller.signal)
      .then(dados => { if (!controller.signal.aborted) setHistorico(dados); })
      .catch(erro => {
        if (controller.signal.aborted) return;
        setErroHistorico(erro instanceof Error ? erro.message : 'Falha ao consultar histórico.');
      })
      .finally(() => { if (!controller.signal.aborted) setCarregandoHistorico(false); });
    return () => controller.abort();
  }, [ticker, token, periodoGrafico, tentativaHistorico]);

  async function revisarCompra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cotacao || !saldoInvestimentosValor || conferindoCompra || comprando || loading || !contaCarregada) return;
    const quantidadeInformada = quantidade.trim().replace(',', '.');
    try {
      prepararRevisaoCompra(cotacao.codigo, quantidadeInformada, cotacao.preco_brl,
        saldoInvestimentosValor, cotacao.cotacao_em);
    } catch (error) {
      const notice = mapAccountError(error, { operation: 'purchase', outcome: 'rejected' });
      onTradeError(notice, notice.action === 'edit-quantity' ? () => purchaseQuantityInput.current?.focus() : undefined);
      return;
    }
    setConferindoCompra(true);
    try {
      const atual = await consultarCotacao(cotacao.codigo, token, new AbortController().signal);
      setRevisaoCompra(prepararRevisaoCompra(atual.codigo, quantidadeInformada, atual.preco_brl,
        saldoInvestimentosValor, atual.cotacao_em));
    } catch (error) {
      if (error instanceof RegraDeNegocio) {
        const notice = mapAccountError(error, { operation: 'purchase', outcome: 'rejected' });
        onTradeError(notice, notice.action === 'edit-quantity' ? () => purchaseQuantityInput.current?.focus() : undefined);
      } else {
        const notice = queryErrorNotice(error, 'market');
        onQueryError(notice, notice.action === 'reload' ? () => setQuoteRetry(value => value + 1) : undefined);
      }
    } finally { setConferindoCompra(false); }
  }

  async function confirmarCompra() {
    if (!revisaoCompra || comprando || loading) return;
    setComprando(true);
    try {
      const recibo = await onPurchase(revisaoCompra.codigo, revisaoCompra.quantidade, revisaoCompra.precoUnitario);
      reviewDialog.current?.close();
      onPurchaseSuccess(recibo);
    } catch (error) {
      reviewDialog.current?.close();
      const notice = error instanceof InvestmentTradeError ? error.notice : mapAccountError(error, { operation: 'purchase' });
      const recover = notice.title === 'Preço atualizado' ? () => setQuoteRetry(value => value + 1)
        : notice.action === 'edit-quantity' ? () => purchaseQuantityInput.current?.focus()
        : notice.action === 'check-balances' || notice.action === 'reload' ? onRefresh : undefined;
      onTradeError(notice, recover);
    } finally { setComprando(false); }
  }

  return <div className="account-market">
    <dialog ref={reviewDialog} className="account-pix-dialog" aria-labelledby="purchase-review-title"
      onCancel={event => { if (comprando) event.preventDefault(); }} onClose={() => setRevisaoCompra(null)}>
      {revisaoCompra && <div className="account-pix-dialog-content">
        <span className="account-pix-success-eyebrow">{t("Revise antes de comprar")}</span>
        <h2 id="purchase-review-title">Confirmar compra de {revisaoCompra.codigo}?</h2>
        <p className="account-pix-success-amount">{preco(revisaoCompra.total)}</p>
        <div className="account-pix-success-details">
          <div><span>{t("Quantidade")}</span><strong>{Number(revisaoCompra.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</strong></div>
          <div><span>{t("Preço por unidade")}</span><strong>{preco(revisaoCompra.precoUnitario)}</strong></div>
          <div><span>{t("Saldo disponível")}</span><strong>{preco(revisaoCompra.saldoAntes)}</strong></div>
          <div><span>{t("Saldo após a compra")}</span><strong>{preco(revisaoCompra.saldoDepois)}</strong></div>
          <div><span>{t("Cotação consultada em")}</span><strong>{horario(revisaoCompra.cotacaoEm)}</strong></div>
        </div>
        <p className="account-pix-note">{t("A compra só será enviada após sua confirmação. Se a cotação mudar, você precisará revisar o novo preço.")}</p>
        <button type="button" className="account-pix-success-close" disabled={comprando || loading}
          onClick={() => void confirmarCompra()}>{comprando ? t("Comprando…") : t("Confirmar compra")}</button>
        <button type="button" className="account-back" disabled={comprando} onClick={() => reviewDialog.current?.close()}>{t("Cancelar")}</button>
      </div>}
    </dialog>
    <header className="market-heading">
      <div>
        <p className="market-kicker">{t("Mercado")}</p>
        <h3>{t("Encontre ativos para acompanhar")}</h3>
        <p>{t("Pesquise as ações, EFTs e FIIs pelo nome ou ticker.")}</p>
      </div>
      <span className="market-heading-icon"><BarChart3 size={24} aria-hidden /></span>
    </header>

    <div className="market-search-panel">
      <label htmlFor="market-search">{t("Nome ou ticker")}</label>
      <div className="market-search-input">
        <Search size={18} aria-hidden />
        <input ref={searchInput} id="market-search" type="search" value={busca} maxLength={80} placeholder="Ex.: PETR4 ou Petrobras" autoComplete="off" disabled={conferindoCompra || comprando}
          onChange={event => { setBusca(event.target.value); setPagina(1); setTicker(null); setCotacao(null); setLista(null); }} />
      </div>
      <p>{t("Cotações de referência podem ter atraso de aproximadamente 30 minutos.")}</p>
    </div>

    {busca.trim().length < 2 && <p className="market-search-hint">{t("Digite pelo menos 2 caracteres para buscar ativos.")}</p>}
    {buscando && <p className="market-state" role="status">{t("Buscando ativos…")}</p>}
    {erroBusca && <button type="button" className="account-detail-refresh" onClick={() => setSearchRetry(value => value + 1)}>{t("Buscar novamente")}</button>}
    {lista && <section className="market-search-results" aria-label={t("Resultados da busca")}>
      <div className="market-section-title"><h4>{t("Resultados")}</h4><span>Página {pagina}</span></div>
      {lista.ativos.length === 0 && <p className="market-state">{t("Nenhum ativo compatível nesta página.")}</p>}
      <ul className="market-results">{lista.ativos.map(ativo => <li key={ativo.codigo}>
        <button type="button" aria-pressed={ticker === ativo.codigo} disabled={conferindoCompra || comprando} onClick={() => setTicker(ativo.codigo)}>
          <span className="market-result-symbol">{ativo.codigo.slice(0, 1)}</span>
          <span className="market-result-main"><strong>{ativo.codigo}</strong><span>{ativo.nome}</span></span>
          <span className="market-result-type">{ativo.tipo}</span>
        </button>
      </li>)}</ul>
      <nav className="market-pagination" aria-label={t("Páginas de ativos")}>
        <button type="button" disabled={pagina <= 1 || buscando} onClick={() => setPagina(valor => valor - 1)}>{t("Anterior")}</button>
        <button type="button" disabled={!lista.tem_proxima || buscando} onClick={() => setPagina(valor => valor + 1)}>{t("Próxima")}</button>
      </nav>
    </section>}

    {cotando && <p className="market-state" role="status">Consultando {ticker}…</p>}
    {erroCotacao && <button type="button" className="account-detail-refresh" onClick={() => setQuoteRetry(value => value + 1)}>{t("Consultar cotação novamente")}</button>}
    {ticker && <section className="market-quote-grid" aria-label={t("Cotação do ativo")} aria-live="polite">
      {cotacao && <article className="market-quote-card market-price-card">
        <div className="market-card-heading"><span>{t("Cotação atual")}</span><span className="market-live-indicator">{t("Referência")}</span></div>
        <div className="market-asset-title"><span>{cotacao.codigo}</span><h4>{cotacao.nome}</h4></div>
        <strong className="market-price">{preco(cotacao.preco_brl)}</strong>
        <p><Clock3 size={14} aria-hidden />{horario(cotacao.cotacao_em)}</p>
        <SaldoDisponivel className="market-main-balance" rotulo="Saldo da conta de investimentos" saldo={saldoInvestimentos} />
        <form className="market-buy-form" onSubmit={event => void revisarCompra(event)}>
          <label htmlFor="market-quantity">{t("Quantidade")}</label>
          <div><input ref={purchaseQuantityInput} id="market-quantity" type="text" inputMode="decimal" value={quantidade} onChange={event => aceitaEntradaDecimal(event.target.value, 6) && setQuantidade(event.target.value)} placeholder="1" required disabled={conferindoCompra || comprando || loading} />
            <button type="submit" disabled={conferindoCompra || comprando || loading || !contaCarregada}>{conferindoCompra ? t("Conferindo…") : t("Comprar ativo")}</button></div>
        </form>
      </article>}

    {ticker && <section className="market-history-card market-quote-card" aria-label={`Evolução do preço de ${ticker}`} aria-busy={carregandoHistorico}>
      <div className="market-history-heading"><h3>Evolução do preço · {ticker}</h3><span>{PERIODOS_HISTORICO[periodoGrafico].descricao}</span></div>
      <div className="market-history-layout">
      <div className="market-history-periods" role="group" aria-label={t("Período do gráfico")}>
        {(Object.keys(PERIODOS_HISTORICO) as PeriodoHistorico[]).filter(periodo => periodo !== '3mo').map(periodo => {
          return <button key={periodo} type="button" aria-pressed={periodoGrafico === periodo}
            aria-label={PERIODOS_HISTORICO[periodo].descricao}
            title={PERIODOS_HISTORICO[periodo].descricao}
            onClick={() => {
              if (periodo !== periodoGrafico) {
                setHistorico(null); setErroHistorico(''); setCarregandoHistorico(true);
              }
              setPeriodoSelecionado(periodo);
            }}>
            {PERIODOS_HISTORICO[periodo].rotulo}
          </button>;
        })}
      </div>
      <div className="market-history-content">
      <p className="market-history-note">Histórico: Yahoo Finance{testeYahoo ? ' (servidor local de teste)' : ''}. Busca e cotação: brapi. A cobertura varia por ativo e período; os preços podem diferir entre as fontes.</p>
      {carregandoHistorico && <p role="status">{t("Carregando histórico…")}</p>}
      {erroHistorico && <div role="alert"><p>Não foi possível carregar o gráfico. {erroHistorico}</p>
        <button type="button" onClick={() => setTentativaHistorico(valor => valor + 1)}>{t("Tentar novamente")}</button>
      </div>}
      {historico?.codigo === ticker && historico.periodo === periodoGrafico && !carregandoHistorico && !erroHistorico && <GraficoAtivo key={`${ticker}:${periodoGrafico}:${historico.consultado_em}`} historico={historico} />}
      </div>
      </div>
    </section>}

      {cotacao && <article className="market-quote-card market-details-card">
        <div className="market-card-heading"><span>{t("Dados da consulta")}</span><span>brapi</span></div>
        <dl>
          <div><dt>{t("Tipo de ativo")}</dt><dd>{cotacao.tipo}</dd></div>
          <div><dt>{t("Consultado em")}</dt><dd>{horario(cotacao.consultado_em)}</dd></div>
          <div><dt>{t("Moeda")}</dt><dd>{t("Real brasileiro")}</dd></div>
        </dl>
      </article>}
    </section>}
  </div>;
}
