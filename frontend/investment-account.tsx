import { useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ChevronRight, HandCoins, RefreshCw } from 'lucide-react';
import { MercadoAtivos } from './mercado-ativos';
import { formatarSaldo, type Conta } from './moeda';
import { InvestmentTransferError } from './investment-transfer';
import { InvestmentTradeError } from './investment-trade';
import { mapAccountError, type AccountErrorNotice } from './account-errors';

import type { ContaInvestimento, DirecaoTransferencia, TransferenciaInvestimento } from './investment-types';
export type { ContaInvestimento, DirecaoTransferencia, TransferenciaInvestimento } from './investment-types';

type Props = {
  principal: Conta | null;
  investimento: ContaInvestimento | null;
  loading: boolean;
  token: string;
  onRefresh: () => void;
  onTransfer: (direcao: DirecaoTransferencia, valor: string) => Promise<TransferenciaInvestimento>;
  onOperationError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onQueryError: (notice: AccountErrorNotice, recover?: () => void) => void;
  onPurchase: (codigoAtivo: string, quantidade: string) => Promise<void>;
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

export function InvestmentAccount({ principal, investimento, loading, token, onRefresh, onTransfer, onOperationError, onQueryError, onPurchase, onSale }: Props) {
  const [categoria, setCategoria] = useState<'renda-fixa' | 'acoes' | 'compradas' | null>(null);
  const [direcao, setDirecao] = useState<DirecaoTransferencia>('PARA_INVESTIMENTOS');
  const [valor, setValor] = useState('');
  const [sending, setSending] = useState(false);
  const valueInput = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<TransferenciaInvestimento | null>(null);
  const [ativoParaVenda, setAtivoParaVenda] = useState<string | null>(null);
  const [quantidadeVenda, setQuantidadeVenda] = useState('');
  const [vendendo, setVendendo] = useState(false);
  const saleQuantityInput = useRef<HTMLInputElement>(null);
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
    if (vendendo || loading) return;
    setVendendo(true);
    try { await onSale(codigo, quantidadeVenda.trim().replace(',', '.')); setAtivoParaVenda(null); setQuantidadeVenda(''); }
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
      <button type="button" className="investment-category" onClick={() => setCategoria('renda-fixa')}>
        <span className="investment-category-icon"><HandCoins size={27} strokeWidth={2.3} aria-hidden /></span><h2>Renda fixa</h2>
      </button>
      <button type="button" className="investment-category" onClick={() => setCategoria('acoes')}>
        <span className="investment-category-icon"><GrowthHomeIcon /></span><h2>Ações, BDRs, EFTs</h2>
      </button>
    </section>
    <section className="investment-portfolio" aria-labelledby="portfolio-title">
      <div className="investment-portfolio-heading">
        <div><h2 id="portfolio-title">Carteira</h2><span>Total investido</span></div>
        <strong>{loading ? 'Carregando…' : formatarSaldo(totalInvestido.toFixed(2), 'BRL')}</strong>
      </div>
      <div className="investment-portfolio-bar" aria-hidden>
        <span style={{ width: `${porcentagem(rendaFixa)}%` }} />
      </div>
      <dl className="investment-portfolio-breakdown">
        <div>
          <dt><span className="investment-portfolio-marker investment-portfolio-marker-fixed" />Renda fixa</dt>
          <dd><strong>{loading ? '—' : formatarSaldo(rendaFixa.toFixed(2), 'BRL')}</strong><span>{porcentagem(rendaFixa)}%</span></dd>
        </div>
        <div>
          <dt><span className="investment-portfolio-marker investment-portfolio-marker-stocks" />Ações, BDRs, ETFs</dt>
          <dd><strong>{loading ? '—' : formatarSaldo(acoes.toFixed(2), 'BRL')}</strong><span>{porcentagem(acoes)}%</span></dd>
        </div>
      </dl>
    </section>
    <button type="button" className="investment-positions-trigger" onClick={() => setCategoria('compradas')}>
      <span className="investment-positions-trigger-icon"><GrowthHomeIcon /></span>
      <span><strong>Ver ações compradas</strong><small>{investimento?.posicoes.length ?? 0} {investimento?.posicoes.length === 1 ? 'ativo na carteira' : 'ativos na carteira'}</small></span>
      <ChevronRight size={21} aria-hidden />
    </button>
  </div>;

  if (categoria === 'renda-fixa') {
    const moedaOrigem = direcao === 'PARA_INVESTIMENTOS' ? principal?.moeda_saldo ?? 'BRL' : 'BRL';
    return <section className="investment-selected-content investment-fixed-income-content" aria-busy={loading || sending}>
      <button type="button" className="account-back" onClick={() => setCategoria(null)}><ArrowLeft size={17} aria-hidden />Voltar às categorias</button>
      <h2>Renda fixa</h2>
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
          <input ref={valueInput} id="investment-value" type="text" inputMode="decimal" value={valor} onChange={event => setValor(event.target.value)} placeholder="0,00" required disabled={loading || sending || !principal || !investimento} />
          {principal?.moeda_saldo !== 'BRL' && <p className="account-pix-note">A conversão entre {principal?.moeda_saldo} e BRL é automática nesta transferência. O valor convertido será mostrado no comprovante.</p>}
          <button type="submit" className="account-pix-submit" disabled={loading || sending || !principal || !investimento}>{sending && <RefreshCw size={16} className="account-spin" aria-hidden />}{sending ? 'Transferindo…' : 'Confirmar transferência'}</button>
        </form>
        {receipt && <div className="investment-receipt" role="status"><strong>Transferência concluída</strong><span>{formatarSaldo(receipt.valor_origem, receipt.moeda_origem)} → {formatarSaldo(receipt.valor_destino, receipt.moeda_destino)}</span>{receipt.cotacao_em && <small>Cotação consultada em {new Date(receipt.cotacao_em).toLocaleString('pt-BR')}</small>}</div>}
        <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading || sending}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando…' : 'Atualizar saldos'}</button>
      </div>
    </section>;
  }

  if (categoria === 'compradas') return <section className="investment-selected-content" aria-busy={loading}>
    <button type="button" className="account-back" onClick={() => setCategoria(null)}><ArrowLeft size={17} aria-hidden />Voltar às categorias</button>
    <h2>Ações compradas</h2>
    <p className="account-detail-intro">Confira os ativos que já fazem parte da sua carteira.</p>
    {!investimento?.posicoes.length ? <p className="investment-positions-empty">Você ainda não comprou ações, BDRs ou ETFs.</p> : <ul className="investment-positions-list" aria-label="Ativos comprados">
      {investimento.posicoes.map(posicao => <li key={posicao.codigo_ativo}>
        <span className="investment-position-symbol">{posicao.codigo_ativo.slice(0, 1)}</span>
        <strong>{posicao.codigo_ativo}</strong>
        <span>{Number(posicao.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 })} unidades</span>
        <button type="button" className="investment-sell-toggle" onClick={() => { setAtivoParaVenda(ativoParaVenda === posicao.codigo_ativo ? null : posicao.codigo_ativo); setQuantidadeVenda(''); }}>Vender</button>
        {ativoParaVenda === posicao.codigo_ativo && <form className="investment-sell-form" onSubmit={event => void vender(event, posicao.codigo_ativo)}>
          <label htmlFor={`sell-${posicao.codigo_ativo}`}>Quantidade para vender <span>Disponível: {Number(posicao.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</span></label>
          <div><input ref={saleQuantityInput} id={`sell-${posicao.codigo_ativo}`} type="text" inputMode="decimal" value={quantidadeVenda} onChange={event => setQuantidadeVenda(event.target.value)} placeholder="0" required disabled={vendendo || loading} />
            <button type="submit" disabled={vendendo || loading}>{vendendo ? 'Vendendo…' : 'Confirmar venda'}</button></div>
        </form>}
      </li>)}
    </ul>}
  </section>;

  return <section className="investment-selected-content" aria-busy={loading}>
    <button type="button" className="account-back" onClick={() => setCategoria(null)}><ArrowLeft size={17} aria-hidden />Voltar às categorias</button>
    <h2>Ações, BDRs, EFTs</h2><MercadoAtivos onQueryError={onQueryError} onTradeError={onOperationError} onRefresh={onRefresh} loading={loading} token={token} onPurchase={onPurchase}
      saldoPrincipal={principal ? formatarSaldo(principal.saldo, principal.moeda_saldo) : 'Carregando…'}
      moedaPrincipal={principal?.moeda_saldo ?? 'BRL'} />
  </section>;
}
