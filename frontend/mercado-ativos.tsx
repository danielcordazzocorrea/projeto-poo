import { aceitaEntradaDecimal } from './moeda';
import { GraficoAtivo } from './mercado-grafico';
import { PERIODOS_HISTORICO, periodoPremium, type PeriodoHistorico } from '../supabase/functions/_shared/mercado-periodos';
import type { ComprovanteCompra } from './investment-account';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BarChart3, Check, Clock3, LockKeyhole, Search, TriangleAlert } from 'lucide-react';
import type { BuscaAtivos, CotacaoAtivo, HistoricoAtivo } from '../supabase/functions/_shared/mercado-brapi';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
async function consultar<T>(caminho: string, token: string, signal: AbortSignal): Promise<T> {
  const resposta = await fetch(`${url}/functions/v1/corretora/mercado/ativos${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${token}` }, signal,
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(typeof dados.erro === 'string' ? dados.erro : 'Não foi possível consultar o mercado.');
  return dados as T;
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

export function MercadoAtivos({ token, onPurchase, onTransferFunds, saldoInvestimentos, contaCarregada }: {
  token: string;
  onPurchase: (codigoAtivo: string, quantidade: string) => Promise<ComprovanteCompra>;
  onTransferFunds: () => void;
  saldoInvestimentos: string;
  contaCarregada: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<BuscaAtivos | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoHistorico>('1mo');
  const periodoGrafico = ticker && periodoPremium(ticker, periodoSelecionado) ? '1mo' : periodoSelecionado;
  const premiumDialog = useRef<HTMLDialogElement>(null);
  const [periodoBloqueado, setPeriodoBloqueado] = useState<PeriodoHistorico>('6mo');
  const [cotacao, setCotacao] = useState<CotacaoAtivo | null>(null);
  const [erroBusca, setErroBusca] = useState('');
  const [erroCotacao, setErroCotacao] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [cotando, setCotando] = useState(false);
  const [historico, setHistorico] = useState<HistoricoAtivo | null>(null);
  const [erroHistorico, setErroHistorico] = useState('');
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [tentativaHistorico, setTentativaHistorico] = useState(0);
  const [quantidade, setQuantidade] = useState('1');
  const [comprando, setComprando] = useState(false);
  const [erroCompra, setErroCompra] = useState('');
  const [compraConcluida, setCompraConcluida] = useState(false);
  const [comprovante, setComprovante] = useState<ComprovanteCompra | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const erroDialog = useRef<HTMLDialogElement>(null);
  const saldoInsuficiente = /saldo insuficiente/i.test(erroCompra);
  useEffect(() => {
    if (saldoInsuficiente && !erroDialog.current?.open) erroDialog.current?.showModal();
  }, [saldoInsuficiente, erroCompra]);
  useEffect(() => {
    if (comprovante && !dialog.current?.open) dialog.current?.showModal();
  }, [comprovante]);

  useEffect(() => {
    const controller = new AbortController();
    setLista(null); setErroBusca('');
    if (busca.trim().length < 2) { setBuscando(false); return () => controller.abort(); }
    setBuscando(true);
    const timer = setTimeout(() => {
      void consultar<BuscaAtivos>(`?busca=${encodeURIComponent(busca.trim())}&pagina=${pagina}`, token, controller.signal)
        .then(dados => { if (!controller.signal.aborted) setLista(dados); })
        .catch(erro => { if (!controller.signal.aborted) setErroBusca(erro instanceof Error ? erro.message : 'Falha na busca.'); })
        .finally(() => { if (!controller.signal.aborted) setBuscando(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [busca, pagina, token]);

  useEffect(() => {
    const controller = new AbortController();
    setCotacao(null); setErroCotacao('');
    if (!ticker) { setCotando(false); return () => controller.abort(); }
    setCotando(true);
    void consultar<CotacaoAtivo>(`/${encodeURIComponent(ticker)}`, token, controller.signal)
      .then(dados => { if (!controller.signal.aborted) setCotacao(dados); })
      .catch(erro => { if (!controller.signal.aborted) setErroCotacao(erro instanceof Error ? erro.message : 'Falha na cotação.'); })
      .finally(() => { if (!controller.signal.aborted) setCotando(false); });
    return () => controller.abort();
  }, [ticker, token]);

  useEffect(() => {
    const controller = new AbortController();
    setHistorico(null); setErroHistorico('');
    if (!ticker) { setCarregandoHistorico(false); return () => controller.abort(); }
    setCarregandoHistorico(true);
    void consultar<HistoricoAtivo>(`/${encodeURIComponent(ticker)}/historico?periodo=${periodoGrafico}`, token, controller.signal)
      .then(dados => { if (!controller.signal.aborted) setHistorico(dados); })
      .catch(erro => { if (!controller.signal.aborted) setErroHistorico(erro instanceof Error ? erro.message : 'Falha ao consultar histórico.'); })
      .finally(() => { if (!controller.signal.aborted) setCarregandoHistorico(false); });
    return () => controller.abort();
  }, [ticker, token, periodoGrafico, tentativaHistorico]);

  async function comprar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cotacao || comprando || !contaCarregada) return;
    setComprando(true); setErroCompra(''); setCompraConcluida(false);
    try {
      const recibo = await onPurchase(cotacao.codigo, quantidade.trim().replace(',', '.'));
      setComprovante(recibo);
      setCompraConcluida(true);
    } catch (erro) {
      setErroCompra(erro instanceof Error ? erro.message : 'Não foi possível concluir a compra.');
    } finally { setComprando(false); }
  }

  return <div className="account-market">
    <header className="market-heading">
      <div>
        <p className="market-kicker">Mercado</p>
        <h3>Encontre ativos para acompanhar</h3>
        <p>Pesquise as ações, EFTs e FIIs pelo nome ou ticker.</p>
      </div>
      <span className="market-heading-icon"><BarChart3 size={24} aria-hidden /></span>
    </header>

    <div className="market-search-panel">
      <label htmlFor="market-search">Nome ou ticker</label>
      <div className="market-search-input">
        <Search size={18} aria-hidden />
        <input id="market-search" type="search" value={busca} maxLength={80} placeholder="Ex.: PETR4 ou Petrobras" autoComplete="off"
          onChange={event => { setBusca(event.target.value); setPagina(1); setTicker(null); setCotacao(null); setLista(null); setCompraConcluida(false); setErroCompra(''); }} />
      </div>
      <p>Cotações de referência podem ter atraso de aproximadamente 30 minutos.</p>
    </div>

    {busca.trim().length < 2 && <p className="market-search-hint">Digite pelo menos 2 caracteres para buscar ativos.</p>}
    {buscando && <p className="market-state" role="status">Buscando ativos…</p>}
    {erroBusca && <p className="market-state market-state-error" role="alert">{erroBusca}</p>}
    {lista && <section className="market-search-results" aria-label="Resultados da busca">
      <div className="market-section-title"><h4>Resultados</h4><span>Página {pagina}</span></div>
      {lista.ativos.length === 0 && <p className="market-state">Nenhum ativo compatível nesta página.</p>}
      <ul className="market-results">{lista.ativos.map(ativo => <li key={ativo.codigo}>
        <button type="button" aria-pressed={ticker === ativo.codigo} onClick={() => { setTicker(ativo.codigo); setCompraConcluida(false); setErroCompra(''); }}>
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
    {erroCotacao && <p className="market-state market-state-error" role="alert">{erroCotacao} <button type="button" onClick={() => setTicker(null)}>Fechar</button></p>}
    <dialog ref={dialog} className="account-pix-dialog" aria-labelledby="purchase-success-title" onClose={() => setComprovante(null)}>
      {comprovante && <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><Check size={30} strokeWidth={2.5} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">Compra concluída</span>
        <h2 id="purchase-success-title">Ativo comprado com sucesso</h2>
        <p className="account-pix-success-amount">{preco(comprovante.total_pago)}</p>
        <div className="account-pix-success-details">
          <div><span>Ativo</span><strong>{comprovante.codigo_ativo}</strong></div>
          <div><span>Quantidade</span><strong>{Number(comprovante.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</strong></div>
          <div><span>Preço por unidade</span><strong>{preco(comprovante.preco_unitario)}</strong></div>
          <div><span>Data e hora da cotação</span><strong>{horario(comprovante.cotacao_em)}</strong></div>
          <div><span>Data e hora da compra</span><strong>{horario(comprovante.criada_em)}</strong></div>
        </div>
        <button type="button" className="account-pix-success-close" onClick={() => dialog.current?.close()}>Concluir</button>
      </div>}
    </dialog>
    <dialog ref={erroDialog} className="account-pix-dialog" aria-labelledby="purchase-error-title" onClose={() => setErroCompra('')}>
      <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon account-purchase-error-icon"><TriangleAlert size={30} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">Compra não realizada</span>
        <h2 id="purchase-error-title">Saldo insuficiente</h2>
        <p className="account-pix-note">Você não tem saldo suficiente na conta de investimentos para essa compra. Transfira dinheiro da sua conta principal para continuar.</p>
        <div className="account-pix-success-details">
          <div><span>Saldo disponível para investir</span><strong>{saldoInvestimentos}</strong></div>
        </div>
        <button type="button" className="account-pix-success-close" onClick={() => { erroDialog.current?.close(); onTransferFunds(); }}>Transferir para investimentos</button>
        <button type="button" className="account-back" onClick={() => erroDialog.current?.close()}>Voltar</button>
      </div>
    </dialog>
    {ticker && <section className="market-quote-grid" aria-label="Cotação do ativo" aria-live="polite">
      {cotacao && <article className="market-quote-card market-price-card">
        <div className="market-card-heading"><span>Cotação atual</span><span className="market-live-indicator">Referência</span></div>
        <div className="market-asset-title"><span>{cotacao.codigo}</span><h4>{cotacao.nome}</h4></div>
        <strong className="market-price">{preco(cotacao.preco_brl)}</strong>
        <p><Clock3 size={14} aria-hidden />{horario(cotacao.cotacao_em)}</p>
        <span className="market-main-balance">Saldo da conta de investimentos: <strong>{saldoInvestimentos}</strong></span>
        <form className="market-buy-form" onSubmit={event => void comprar(event)}>
          <label htmlFor="market-quantity">Quantidade</label>
          <div><input id="market-quantity" type="text" inputMode="decimal" value={quantidade} onChange={event => aceitaEntradaDecimal(event.target.value, 6) && setQuantidade(event.target.value)} placeholder="1" required disabled={comprando} />
            <button type="submit" disabled={comprando || !contaCarregada}>{comprando ? 'Comprando…' : 'Comprar ativo'}</button></div>
        </form>
        {compraConcluida && <span className="market-buy-success" role="status">Compra concluída. Sua carteira foi atualizada.</span>}
        {erroCompra && !saldoInsuficiente && <span className="market-buy-error" role="alert">{erroCompra}</span>}
      </article>}

    {ticker && <section className="market-history-card market-quote-card" aria-label={`Evolução do preço de ${ticker}`} aria-busy={carregandoHistorico}>
      <div className="market-history-heading"><h3>Evolução do preço · {ticker}</h3><span>{PERIODOS_HISTORICO[periodoGrafico].descricao}</span></div>
      <div className="market-history-layout">
      <div className="market-history-periods" role="group" aria-label="Período do gráfico">
        {(Object.keys(PERIODOS_HISTORICO) as PeriodoHistorico[]).filter(periodo => periodo !== '3mo').map(periodo => {
          const bloqueado = periodoPremium(ticker, periodo);
          return <button key={periodo} type="button" aria-pressed={periodoGrafico === periodo}
            className={bloqueado ? 'is-premium' : undefined}
            aria-label={`${PERIODOS_HISTORICO[periodo].descricao}${bloqueado ? ' — exclusivo Premium; ver detalhes' : ''}`}
            title={bloqueado ? 'Disponível apenas no plano Premium' : PERIODOS_HISTORICO[periodo].descricao}
            onClick={() => {
              if (bloqueado) {
                setPeriodoBloqueado(periodo);
                premiumDialog.current?.showModal();
                return;
              }
              if (periodo !== periodoGrafico) {
                setHistorico(null); setErroHistorico(''); setCarregandoHistorico(true);
              }
              setPeriodoSelecionado(periodo);
            }}>
            {PERIODOS_HISTORICO[periodo].rotulo}{bloqueado && <LockKeyhole size={12} aria-hidden />}
          </button>;
        })}
      </div>
      <div className="market-history-content">
      <p className="market-history-note">{periodoPremium(ticker, '6mo')
        ? 'Nesta demonstração, consulte até 1 mês no plano gratuito. Períodos com cadeado são exclusivos Premium.'
        : 'Ativo de teste da brapi: períodos estendidos liberados para demonstração.'}</p>
      {carregandoHistorico && <p role="status">Carregando histórico…</p>}
      {erroHistorico && <div role="alert"><p>Não foi possível carregar o gráfico. {erroHistorico}</p>
        <button type="button" onClick={() => setTentativaHistorico(valor => valor + 1)}>Tentar novamente</button>
      </div>}
      {historico?.codigo === ticker && historico.periodo === periodoGrafico && !carregandoHistorico && !erroHistorico && <GraficoAtivo key={`${ticker}:${periodoGrafico}:${historico.consultado_em}`} historico={historico} />}
      </div>
      </div>
    </section>}

      {cotacao && <article className="market-quote-card market-details-card">
        <div className="market-card-heading"><span>Dados da consulta</span><span>brapi</span></div>
        <dl>
          <div><dt>Tipo de ativo</dt><dd>{cotacao.tipo}</dd></div>
          <div><dt>Consultado em</dt><dd>{horario(cotacao.consultado_em)}</dd></div>
          <div><dt>Moeda</dt><dd>Real brasileiro</dd></div>
        </dl>
      </article>}
    </section>}
    <dialog ref={premiumDialog} className="account-pix-dialog market-premium-dialog"
      aria-labelledby="market-premium-title" aria-describedby="market-premium-description">
      <div className="account-pix-dialog-content">
        <span className="market-premium-icon"><LockKeyhole size={28} aria-hidden /></span>
        <h2 id="market-premium-title">Explore períodos maiores</h2>
        <p id="market-premium-description">Funcionalidade disponível apenas no plano Premium.</p>
        <p>O período “{PERIODOS_HISTORICO[periodoBloqueado].rotulo}” está bloqueado para este ativo no plano gratuito. Você pode continuar analisando até 1 mês de histórico nesta demonstração.</p>
        <p className="market-history-note">Demonstração acadêmica: não há assinatura ou cobrança. A disponibilidade dos dados depende do plano da brapi.</p>
        <button type="button" className="account-pix-success-close" onClick={() => premiumDialog.current?.close()}>Continuar no gratuito</button>
      </div>
    </dialog>
  </div>;
}
