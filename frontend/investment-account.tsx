import { aceitaEntradaDecimal } from './moeda';
import { ValorInput } from './valor-input';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Check, ChevronRight, HandCoins, RefreshCw } from 'lucide-react';
import { MercadoAtivos, consultarCotacao } from './mercado-ativos';
import { formatarSaldo, type Conta } from './moeda';
import { InvestmentTransferError } from './investment-transfer';
import { InvestmentTradeError } from './investment-trade';
import { mapAccountError, type AccountErrorNotice } from './account-errors';

import type { ComprovanteCompra, ContaInvestimento, DirecaoTransferencia, TransferenciaInvestimento } from './investment-types';
export type { ComprovanteCompra, ContaInvestimento, DirecaoTransferencia, TransferenciaInvestimento } from './investment-types';
import type { CotacaoAtivo } from '../supabase/functions/_shared/mercado-brapi';
import type { InvestmentCategory } from './rotas';

type Props = {
  principal: Conta | null;
  investimento: ContaInvestimento | null;
  loading: boolean;
  token: string;
  category: InvestmentCategory;
  onCategoryChange: (category: InvestmentCategory) => void;
  onRefresh: () => void;
  onTransfer: (direcao: DirecaoTransferencia, valor: string) => Promise<TransferenciaInvestimento>;
  onOperationError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onQueryError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onPurchase: (codigoAtivo: string, quantidade: string) => Promise<ComprovanteCompra>;
  onSale: (codigoAtivo: string, quantidade: string) => Promise<void>;
};

function GrowthHomeIcon() {
  return <svg viewBox="0 0 1024 1024" fill="none" stroke="currentColor" strokeWidth="80" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m118 454 358-306c22-19 52-19 74 0l356 306" />
    <path d="M200 440v135" />
    <path d="M828 440v425" />
    <path d="m130 864 119-119 151 71 239-237" />
    <path d="M442 579h197v197" />
  </svg>;
}

export function InvestmentAccount({ principal, investimento, loading, token, category: categoria, onCategoryChange, onRefresh, onTransfer, onOperationError, onQueryError, onPurchase, onSale }: Props) {
  const [direcao, setDirecao] = useState<DirecaoTransferencia>('PARA_INVESTIMENTOS');
  const [valor, setValor] = useState('');
  const [sending, setSending] = useState(false);
  const valueInput = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<TransferenciaInvestimento | null>(null);
  const [ativoParaVenda, setAtivoParaVenda] = useState<string | null>(null);
  const [quantidadeVenda, setQuantidadeVenda] = useState('');
  const [vendendo, setVendendo] = useState(false);
  const saleQuantityInput = useRef<HTMLInputElement>(null);
  const [erroCotacaoVenda, setErroCotacaoVenda] = useState('');
  const [vendaConcluida, setVendaConcluida] = useState<{ codigo: string; quantidade: string } | null>(null);
  const vendaDialog = useRef<HTMLDialogElement>(null);
  const [cotacaoVenda, setCotacaoVenda] = useState<CotacaoAtivo | null>(null);
  const [consultandoVenda, setConsultandoVenda] = useState(false);
  const posicaoVenda = investimento?.posicoes.find(posicao => posicao.codigo_ativo === ativoParaVenda);
  useEffect(() => {
    if (!ativoParaVenda || categoria !== 'compradas') return;
    const controller = new AbortController();
    vendaDialog.current?.showModal();
    setCotacaoVenda(null); setConsultandoVenda(true); setErroCotacaoVenda('');
    void consultarCotacao(ativoParaVenda, token, controller.signal)
      .then(cotacao => { if (!controller.signal.aborted) setCotacaoVenda(cotacao); })
      .catch(erro => {
        if (controller.signal.aborted) return;
        setErroCotacaoVenda(erro instanceof Error ? erro.message : 'Não foi possível consultar a cotação.');
      })
      .finally(() => { if (!controller.signal.aborted) setConsultandoVenda(false); });
    return () => controller.abort();
  }, [ativoParaVenda, categoria, token]);
  const saldoDaCarteira = Number(investimento?.saldo ?? '0');
  const acoesDaCarteira = Number(investimento?.acoes_investidas ?? '0');
  const rendaFixa = Number.isFinite(saldoDaCarteira) ? Math.max(saldoDaCarteira, 0) : 0;
  const acoes = Number.isFinite(acoesDaCarteira) ? Math.max(acoesDaCarteira, 0) : 0;
  const totalInvestido = rendaFixa + acoes;
  const porcentagem = (valor: number) => totalInvestido > 0 ? Math.round((valor / totalInvestido) * 100) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || loading || !principal || !investimento) return;
    setSending(true);
    setReceipt(null);
    try {
      const result = await onTransfer(direcao, valor.trim().replace(',', '.'));
      setReceipt(result);
      setValor('');
    } catch (error) {
      const notice = error instanceof InvestmentTransferError ? error.notice : mapAccountError(error, { operation: 'investment-transfer' });
      const recover = notice.action === 'edit-value' ? () => valueInput.current?.focus()
        : notice.action === 'check-balances' || notice.action === 'reload' ? onRefresh : undefined;
      onOperationError(notice, recover);
    }
    finally { setSending(false); }
  }
  async function vender(event: FormEvent<HTMLFormElement>, codigo: string) {
    event.preventDefault();
    if (vendendo || loading || !cotacaoVenda || !posicaoVenda) return;
    const quantidade = quantidadeVenda.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,6})?$/.test(quantidade) || Number(quantidade) <= 0 || Number(quantidade) > Number(posicaoVenda.quantidade)) {
      onOperationError(mapAccountError('Quantidade indisponível para venda', { operation: 'sale' }), () => saleQuantityInput.current?.focus());
      return;
    }
    setVendendo(true);
    try {
      await onSale(codigo, quantidade);
      setVendaConcluida({ codigo, quantidade });
      setQuantidadeVenda('');
    }
    catch (error) {
      const notice = error instanceof InvestmentTradeError ? error.notice : mapAccountError(error, { operation: 'sale' });
      const recover = notice.action === 'edit-quantity' ? () => saleQuantityInput.current?.focus()
        : notice.action === 'check-balances' || notice.action === 'reload' ? onRefresh : undefined;
      onOperationError(notice, recover);
    }
    finally { setVendendo(false); }
  }

  if (!categoria) return <div className="investment-account" aria-busy={loading}>
    <section className="investment-categories" aria-label="Categorias de investimento">
      <button type="button" className="investment-category" onClick={() => onCategoryChange('transferir')}>
        <span className="investment-category-icon"><HandCoins size={27} strokeWidth={2.3} aria-hidden /></span><h2>Transferir dinheiro</h2>
      </button>
      <button type="button" className="investment-category" onClick={() => onCategoryChange('acoes')}>
        <span className="investment-category-icon"><GrowthHomeIcon /></span><h2>Renda variável</h2>
      </button>
    </section>
    <section className="investment-portfolio" aria-labelledby="portfolio-title">
      <div className="investment-portfolio-heading">
        <div><h2 id="portfolio-title">Carteira</h2><span>Total investido</span></div>
        <strong>{loading ? 'Carregando…' : formatarSaldo(totalInvestido.toFixed(2), 'BRL')}</strong>
      </div>
      <div className="investment-portfolio-bar" aria-hidden>
        <span style={{ width: `${porcentagem(rendaFixa)}%` }} />
        <span className="investment-portfolio-bar-stocks" style={{ width: `${porcentagem(acoes)}%` }} />
      </div>
      <dl className="investment-portfolio-breakdown">
        <div>
          <dt><span className="investment-portfolio-marker investment-portfolio-marker-fixed" />Saldo disponível</dt>
          <dd><strong>{loading ? '—' : formatarSaldo(rendaFixa.toFixed(2), 'BRL')}</strong><span>{porcentagem(rendaFixa)}%</span></dd>
        </div>
        <div>
          <dt><span className="investment-portfolio-marker investment-portfolio-marker-stocks" />Renda variável</dt>
          <dd><strong>{loading ? '—' : formatarSaldo(acoes.toFixed(2), 'BRL')}</strong><span>{porcentagem(acoes)}%</span></dd>
        </div>
      </dl>
    </section>
    <button type="button" className="investment-positions-trigger" onClick={() => onCategoryChange('compradas')}>
      <span className="investment-positions-trigger-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 5h16M4 10h12M4 15h16M4 20h12" />
        </svg>
      </span>
      <span><strong>Ver ações compradas</strong><small>{investimento?.posicoes.length ?? 0} {investimento?.posicoes.length === 1 ? 'ativo na carteira' : 'ativos na carteira'}</small></span>
      <ChevronRight size={21} aria-hidden />
    </button>
  </div>;

  if (categoria === 'transferir') {
    const moedaOrigem = direcao === 'PARA_INVESTIMENTOS' ? principal?.moeda_saldo ?? 'BRL' : 'BRL';
    return <section className="investment-selected-content investment-fixed-income-content" aria-busy={loading || sending}>
      <button type="button" className="account-back" onClick={() => onCategoryChange(null)}><ArrowLeft size={17} aria-hidden />Voltar às categorias</button>
      <h2>Transferir dinheiro</h2>
      <div className="investment-account">
        <p className="account-detail-intro">Sua conta de investimentos tem saldo próprio em reais. Transfira entre ela e sua conta principal para organizar seu dinheiro simulado.</p>
        <div className="investment-balances">
          <div><span>Conta principal · {principal?.moeda_saldo ?? 'BRL'}</span><strong>{principal ? formatarSaldo(principal.saldo, principal.moeda_saldo) : 'Carregando…'}</strong></div>
          <div><span>Conta de investimentos · BRL</span><strong>{investimento ? formatarSaldo(investimento.saldo, 'BRL') : 'Carregando…'}</strong></div>
        </div>
        <form className="account-pix-form investment-transfer-form" onSubmit={event => void submit(event)}>
          <h2>Transferir entre contas</h2>
          <div className="investment-directions" role="group" aria-label="Direção da transferência">
            <button type="button" className={direcao === 'PARA_INVESTIMENTOS' ? 'is-selected' : ''} aria-pressed={direcao === 'PARA_INVESTIMENTOS'} onClick={() => { setDirecao('PARA_INVESTIMENTOS'); setReceipt(null); }}><ArrowDownToLine size={17} aria-hidden />Para investimentos</button>
            <button type="button" className={direcao === 'PARA_PRINCIPAL' ? 'is-selected' : ''} aria-pressed={direcao === 'PARA_PRINCIPAL'} onClick={() => { setDirecao('PARA_PRINCIPAL'); setReceipt(null); }}><ArrowUpFromLine size={17} aria-hidden />Para conta principal</button>
          </div>
          <label htmlFor="investment-value">Valor em {moedaOrigem}</label>
          <ValorInput ref={valueInput} id="investment-value" value={valor} onValueChange={setValor} placeholder="0,00" required disabled={loading || sending || !principal || !investimento} />
          {principal?.moeda_saldo !== 'BRL' && <p className="account-pix-note">A conversão entre {principal?.moeda_saldo} e BRL é automática nesta transferência. O valor convertido será mostrado no comprovante.</p>}
          <button type="submit" className="account-pix-submit" disabled={loading || sending || !principal || !investimento}>{sending && <RefreshCw size={16} className="account-spin" aria-hidden />}{sending ? 'Transferindo…' : 'Confirmar transferência'}</button>
        </form>
        {receipt && <div className="investment-receipt" role="status"><strong>Transferência concluída</strong><span>{formatarSaldo(receipt.valor_origem, receipt.moeda_origem)} → {formatarSaldo(receipt.valor_destino, receipt.moeda_destino)}</span>{receipt.cotacao_em && <small>Cotação consultada em {new Date(receipt.cotacao_em).toLocaleString('pt-BR')}</small>}</div>}
        <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading || sending}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando…' : 'Atualizar saldos'}</button>
      </div>
    </section>;
  }

  if (categoria === 'compradas') return <section className="investment-selected-content" aria-busy={loading}>
    <button type="button" className="account-back" onClick={() => onCategoryChange(null)}><ArrowLeft size={17} aria-hidden />Voltar às categorias</button>
    <h2>Ações compradas</h2>
    <p className="account-detail-intro">Confira os ativos que já fazem parte da sua carteira.</p>
    {!investimento?.posicoes.length ? <p className="investment-positions-empty">Você ainda não comprou ações, BDRs ou ETFs.</p> : <ul className="investment-positions-list" aria-label="Ativos comprados">
      {investimento.posicoes.map(posicao => <li key={posicao.codigo_ativo}>
        <span className="investment-position-symbol">{posicao.codigo_ativo.slice(0, 1)}</span>
        <strong>{posicao.codigo_ativo}</strong>
        <span>{Number(posicao.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 })} unidades</span>
        <button type="button" className="investment-sell-toggle" onClick={() => { setAtivoParaVenda(posicao.codigo_ativo); setQuantidadeVenda(''); }}>Vender</button>
      </li>)}
    </ul>}
    <dialog ref={vendaDialog} className="account-pix-dialog" aria-labelledby="sell-dialog-title"
      onCancel={event => { if (vendendo) event.preventDefault(); }}
      onClose={() => { setAtivoParaVenda(null); setCotacaoVenda(null); setVendaConcluida(null); }}>
      {vendaConcluida ? <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><Check size={30} strokeWidth={2.5} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">Venda concluída</span>
        <h2 id="sell-dialog-title">Ativo vendido com sucesso</h2>
        <div className="account-pix-success-details">
          <div><span>Ativo</span><strong>{vendaConcluida.codigo}</strong></div>
          <div><span>Quantidade vendida</span><strong>{Number(vendaConcluida.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</strong></div>
        </div>
        <p className="account-pix-note">O valor da venda foi creditado na sua conta de investimentos. Sua carteira foi atualizada.</p>
        <button type="button" className="account-pix-success-close" onClick={() => vendaDialog.current?.close()}>Concluir</button>
      </div> : <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><ArrowUpFromLine size={30} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">Venda de ativo</span>
        <h2 id="sell-dialog-title">Vender {ativoParaVenda}</h2>
        <div className="account-pix-success-details">
          <div><span>Preço atual por unidade</span><strong>{consultandoVenda ? 'Consultando cotação…' : cotacaoVenda ? formatarSaldo(cotacaoVenda.preco_brl, 'BRL') : 'Indisponível'}</strong></div>
          <div><span>Preço médio de compra por unidade</span><strong>{posicaoVenda?.preco_medio_compra ? formatarSaldo(posicaoVenda.preco_medio_compra, 'BRL') : 'Não informado'}</strong></div>
          <div><span>Quantidade disponível</span><strong>{Number(posicaoVenda?.quantidade ?? '0').toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</strong></div>
          {cotacaoVenda && <div><span>Data e hora da cotação</span><strong>{cotacaoVenda.cotacao_em ? new Date(cotacaoVenda.cotacao_em).toLocaleString('pt-BR', { timeZoneName: 'short' }) : 'Não informado pelo provedor'}</strong></div>}
        </div>
        <form className="account-pix-form" onSubmit={event => { if (ativoParaVenda) void vender(event, ativoParaVenda); else event.preventDefault(); }}>
          <label htmlFor="sell-dialog-quantity">Qual quantidade você quer vender?</label>
          <input ref={saleQuantityInput} id="sell-dialog-quantity" type="text" inputMode="decimal" value={quantidadeVenda} onChange={event => aceitaEntradaDecimal(event.target.value, 6) && setQuantidadeVenda(event.target.value)} placeholder="0" required disabled={vendendo || loading || consultandoVenda} />
          {erroCotacaoVenda && <p className="investment-sale-error" role="alert">{erroCotacaoVenda}</p>}
          <p className="account-pix-note">O valor será creditado na sua conta de investimentos pela cotação consultada na confirmação.</p>
          <button type="submit" className="account-pix-success-close" disabled={vendendo || loading || consultandoVenda || !cotacaoVenda || !quantidadeVenda.trim()}>{vendendo ? 'Vendendo…' : 'Confirmar venda'}</button>
          <button type="button" className="account-back" disabled={vendendo} onClick={() => vendaDialog.current?.close()}>Cancelar</button>
        </form>
      </div>}
    </dialog>
  </section>;

  return <section className="investment-selected-content investment-variable-income-content" aria-busy={loading}>
    <button type="button" className="account-back" onClick={() => onCategoryChange(null)}><ArrowLeft size={17} aria-hidden />Voltar às categorias</button>
    <h2>Ações, BDRs, EFTs</h2><MercadoAtivos onQueryError={onQueryError} onTradeError={onOperationError} onRefresh={onRefresh} loading={loading} token={token} onPurchase={onPurchase}
      saldoInvestimentos={investimento ? formatarSaldo(investimento.saldo, 'BRL') : 'Carregando…'}
      contaCarregada={Boolean(investimento) && !loading} />
  </section>;
}
