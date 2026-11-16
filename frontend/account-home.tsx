import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Theme } from '@/lib/theme';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ArrowRightLeft, ChartNoAxesCombined, Check, Eye, EyeOff, History, Landmark, LogOut, Moon, Sun, RefreshCw, UserRound } from 'lucide-react';
import { AboutTivvo } from '@/components/ui/about-tivvo';
import { ErrorDialog } from '@/components/ui/error-dialog';
import { CircleAlert, CloudOff, Clock, Search, UserRoundX, Wallet } from 'lucide-react';
import { mapAccountError, type AccountErrorNotice } from './account-errors';
import { PixTransferError } from './pix-transfer';
import { CurrencyConversionError } from './currency-conversion';
import { formatarSaldo, type Conta, type ConversionReceipt, type Movimentacao, type PixReceipt, type TipoMoeda } from './moeda';
import { InvestmentAccount, type ContaInvestimento, type DirecaoTransferencia, type TransferenciaInvestimento } from './investment-account';

type Area = 'home' | 'investments' | 'pix' | 'profile' | 'history' | 'currencies';
type TransactionFilter = 'all' | 'pix' | 'conversion';
type AccountHomeProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  session: Session;
  conta: Conta | null;
  investimento: ContaInvestimento | null;
  loading: boolean;
  notice: { text: string; kind: 'ok' | 'erro' | 'info' } | null;
  accountError: AccountErrorNotice | null;
  onDismissAccountError: () => void;
  onRefresh: () => void;
  onPixTransfer: (chaveDestino: string, valor: string) => Promise<PixReceipt>;
  onConvertBalance: (moeda: TipoMoeda) => Promise<ConversionReceipt>;
  onInvestmentTransfer: (direcao: DirecaoTransferencia, valor: string) => Promise<TransferenciaInvestimento>;
  onInvestmentPurchase: (codigoAtivo: string, quantidade: string) => Promise<void>;
  onInvestmentSale: (codigoAtivo: string, quantidade: string) => Promise<void>;
  onInvestmentRefresh: () => void;
  onLogout: () => void;
};

const destinations = [
  { id: 'investments', title: 'Investimentos', description: 'Seu espaço para acompanhar ativos e construir sua carteira simulada', action: 'Explorar investimentos' },
  { id: 'pix', title: 'Pix', description: 'Um lugar para suas transferências e chaves', action: 'Conhecer a área Pix' },
  { id: 'currencies', title: 'Moedas', description: 'Converta seu saldo entre real, dólar e euro com cotação atualizada', action: 'Converter saldo' },
  { id: 'history', title: 'Histórico de transações', description: 'Acompanhe conversões de moeda e Pix enviados ou recebidos', action: 'Ver histórico' },
] as const;
const transactionFilters: { id: TransactionFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pix', label: 'Pix' },
  { id: 'conversion', label: 'Conversões' },
];

function formatDateBr(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Não informado';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTimeBr(value: string | null): string {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informado' : date.toLocaleString('pt-BR');
}

function PixLogo() {
  return <span className="account-pix-logo" aria-hidden />;
}
const errorIcons = { alert: CircleAlert, wallet: Wallet, recipient: UserRoundX, exchange: ArrowRightLeft, connection: CloudOff, clock: Clock, search: Search };

function transactionLabel(transaction: Movimentacao): string {
  if (transaction.tipo === 'CONVERSAO') return 'Saldo convertido';
  if (transaction.tipo === 'PIX_ENVIADO') return 'Pix enviado';
  return 'Pix recebido';
}

export function AccountHome({ theme, onThemeChange, session, conta, investimento, loading, notice, accountError, onDismissAccountError, onRefresh, onPixTransfer, onConvertBalance, onInvestmentTransfer, onInvestmentPurchase, onInvestmentSale, onInvestmentRefresh, onLogout }: AccountHomeProps) {
  const [area, setArea] = useState<Area>('home');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [pixKey, setPixKey] = useState('');
  const [pixValue, setPixValue] = useState('');
  const [sendingPix, setSendingPix] = useState(false);
  const [operationError, setOperationError] = useState<{ notice: AccountErrorNotice; details: { label: string; value: string }[]; recover?: () => void } | null>(null);
  const showQueryError = useCallback((notice: AccountErrorNotice, recover?: () => void) => {
    setOperationError({ notice, details: [], recover });
  }, []);
  const displayedError = operationError ?? (accountError ? { notice: accountError, details: [], recover: undefined } : null);
  const pixKeyInput = useRef<HTMLInputElement>(null);
  const pixValueInput = useRef<HTMLInputElement>(null);
  const [pixSuccess, setPixSuccess] = useState<{ chave: string; valor: string; moeda: TipoMoeda; recebido: PixReceipt } | null>(null);
  const [targetCurrency, setTargetCurrency] = useState<TipoMoeda>('USD');
  const [converting, setConverting] = useState(false);
  const currencyOptions = useRef<HTMLFieldSetElement>(null);
  const [historyFilter, setHistoryFilter] = useState<TransactionFilter>('all');
  const [conversionSuccess, setConversionSuccess] = useState<{ saldoAnterior: string; moedaAnterior: TipoMoeda; recibo: ConversionReceipt } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousArea = useRef(area);
  const successDialog = useRef<HTMLDialogElement>(null);
  const conversionSuccessDialog = useRef<HTMLDialogElement>(null);
  const loadingDialog = useRef<HTMLDialogElement>(null);
  const operationLoading = sendingPix ? 'pix' : converting ? 'conversion' : null;
  useEffect(() => {
    if (previousArea.current !== area) heading.current?.focus();
    previousArea.current = area;
  }, [area]);
  useEffect(() => {
    if (pixSuccess && !successDialog.current?.open) successDialog.current?.showModal();
  }, [pixSuccess]);
  useEffect(() => {
    if (conversionSuccess && !conversionSuccessDialog.current?.open) conversionSuccessDialog.current?.showModal();
  }, [conversionSuccess]);
  useEffect(() => {
    if (operationLoading && !loadingDialog.current?.open) loadingDialog.current?.showModal();
    if (!operationLoading && loadingDialog.current?.open) loadingDialog.current.close();
  }, [operationLoading]);
  const balance = conta ? formatarSaldo(conta.saldo, conta.moeda_saldo) : 'Indisponível';
  const created = new Date(session.user.created_at);
  const createdLabel = Number.isNaN(created.getTime()) ? 'Não informado' : created.toLocaleDateString('pt-BR');
  const selected = destinations.find(item => item.id === area);
  const areaTitle = area === 'profile' ? 'Meus dados' : selected?.title;
  const savedName: unknown = session.user.user_metadata?.first_name;
  const firstName = typeof savedName === 'string' ? savedName.trim().split(/\s+/)[0] : '';
  const savedLastName: unknown = session.user.user_metadata?.last_name;
  const lastName = typeof savedLastName === 'string' ? savedLastName.trim() : '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Não informado';
  const birthDate = formatDateBr(session.user.user_metadata?.birth_date);
  const transactionHistory = conta?.movimentacoes.filter(transaction => ['CONVERSAO', 'PIX_ENVIADO', 'PIX_RECEBIDO'].includes(transaction.tipo)) ?? [];
  const filteredTransactionHistory = (historyFilter === 'all' ? transactionHistory : transactionHistory
    .filter(transaction => historyFilter === 'pix' ? transaction.tipo.startsWith('PIX_') : transaction.tipo === 'CONVERSAO')).slice(0, 10);

  async function submitPix(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (sendingPix || loading) return;
    setOperationError(null);
    setSendingPix(true);
    try {
      const chave = pixKey.trim();
      const valor = pixValue;
      const moeda = conta?.moeda_saldo ?? 'BRL';
      const recebido = await onPixTransfer(chave, valor);
      loadingDialog.current?.close();
      setPixSuccess({ chave, valor, moeda, recebido });
      setPixKey('');
      setPixValue('');
    } catch (error) {
      loadingDialog.current?.close();
      const notice = error instanceof PixTransferError ? error.notice : mapAccountError(error, { operation: 'pix' });
      const details = notice.action === 'edit-key' ? [{ label: 'Chave informada', value: pixKey.trim() }]
        : notice.title === 'Saldo insuficiente' && conta ? [
          { label: 'Valor solicitado', value: formatarSaldo(pixValue, conta.moeda_saldo) },
          { label: 'Último saldo disponível', value: formatarSaldo(conta.saldo, conta.moeda_saldo) },
        ] : [];
      setOperationError({ notice, details });
    }
    finally { setSendingPix(false); }
  }

  async function submitConversion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (converting || loading || sendingPix || !conta) return;
    setOperationError(null);
    setConverting(true);
    try {
      const saldoAnterior = conta?.saldo ?? '0';
      const moedaAnterior = conta?.moeda_saldo ?? 'BRL';
      const recibo = await onConvertBalance(targetCurrency);
      loadingDialog.current?.close();
      setConversionSuccess({ saldoAnterior, moedaAnterior, recibo });
    }
    catch (error) {
      loadingDialog.current?.close();
      const notice = error instanceof CurrencyConversionError ? error.notice : mapAccountError(error, { operation: 'conversion' });
      setOperationError({ notice, details: [{ label: 'Moeda solicitada', value: targetCurrency }] });
    }
    finally { setConverting(false); }
  }

  return <div className="account-app" data-theme={theme} style={{ colorScheme: theme }}>
    <a className="account-skip" href="#account-content">Ir para o conteúdo</a>
    <header className="account-topbar">
      <div className="account-container account-topbar-inner">
        <div className="account-brand-nav">
          <button className="account-brand" type="button" onClick={() => setArea('home')} aria-label="tivvo — início"><span className="account-brand-symbol"><Landmark size={22} aria-hidden /></span><span>ti<span className="account-brand-accent">vv</span>o</span></button>
          <AboutTivvo triggerClassName="account-about-trigger" theme={theme} />
        </div>
        <div className="account-user">
          <button className="account-profile-link" type="button" onClick={() => setArea('profile')} aria-current={area === 'profile' ? 'page' : undefined}><UserRound size={17} aria-hidden /><span>Meus dados</span></button>
          <button
            className="account-theme-toggle"
            type="button"
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
            title={theme === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
          >
            {theme === 'dark' ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
            <span>{theme === 'dark' ? 'Escuro' : 'Claro'}</span>
          </button>
          <button className="account-logout" type="button" onClick={onLogout}><LogOut size={17} aria-hidden />Sair</button>
        </div>
      </div>
    </header>

    <main id="account-content" className="account-container account-main">
      <nav aria-label="Localização" className="account-breadcrumb"><button type="button" onClick={() => setArea('home')} aria-current={area === 'home' ? 'page' : undefined}>Início</button>{areaTitle && <><span aria-hidden>/</span><span aria-current="page">{areaTitle}</span></>}</nav>

      {area === 'home' ? <>
        <section className="account-overview" aria-labelledby="home-title">
          <div className="account-greeting"><span className="account-tag"><span />Sua conta, conectada</span><h1 id="home-title" ref={heading} tabIndex={-1}>{firstName ? `Olá, ${firstName}!` : 'Olá!'}</h1><p>Escolha o que você quer fazer hoje</p></div>
          <div className="account-balance" aria-busy={loading}>
            <div className="account-balance-label"><span>Saldo disponível simulado · {conta?.moeda_saldo ?? 'BRL'}</span><button type="button" onClick={() => setBalanceVisible(value => !value)} aria-label={balanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'} aria-pressed={!balanceVisible}>{balanceVisible ? <Eye size={19} /> : <EyeOff size={19} />}</button></div>
            <p className="account-balance-value" aria-live="polite">{!balanceVisible ? '••••••' : loading ? 'Carregando…' : balance}</p>
            <button className="account-refresh" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando saldo' : 'Atualizar saldo'}</button>
          </div>
        </section>
        <section className="account-options" aria-labelledby="options-title">
          <div className="account-section-heading"><h2 id="options-title">Sua conta, por aqui</h2><span>O que você precisa, em um lugar</span></div>
          <div className="account-destinations">{destinations.map(({ id, title, description, action }) => <button key={id} type="button" className={`account-destination account-destination-${id}`} onClick={() => setArea(id)}>
            <span className="account-destination-top"><span className="account-option-icon">{id === 'pix' ? <PixLogo /> : id === 'currencies' ? <ArrowRightLeft size={26} strokeWidth={1.6} aria-hidden /> : id === 'investments' ? <ChartNoAxesCombined size={26} strokeWidth={1.6} aria-hidden /> : <History size={26} strokeWidth={1.6} aria-hidden />}</span><ArrowUpRight size={20} aria-hidden /></span>
            <h3>{title}</h3><p>{description}</p><span className="account-destination-action">{action}</span>
          </button>)}</div>
        </section>
      </> : <section className="account-detail" aria-labelledby="area-title">
        <button className="account-back" type="button" onClick={() => setArea('home')}><ArrowLeft size={17} aria-hidden />Voltar ao início</button>
        <h1 id="area-title" ref={heading} tabIndex={-1}>{areaTitle}</h1>
        {area === 'currencies' ? <div className="account-currency-area">
          <p className="account-detail-intro">Seu saldo está em <strong>{conta?.moeda_saldo ?? 'BRL'}</strong>. Ao converter, todo o saldo passa para a moeda escolhida.</p>
          <div className="account-currency-balance"><span>Saldo atual</span><p className="account-currency-current" aria-live="polite">{conta ? formatarSaldo(conta.saldo, conta.moeda_saldo) : 'Carregando saldo…'}</p></div>
          <form className="account-pix-form" onSubmit={event => void submitConversion(event)} aria-busy={converting}>
            <fieldset ref={currencyOptions} className="account-currency-options" disabled={loading || converting}>
              <legend>Converter saldo para</legend>
              <div className="account-currency-options-grid">
                {([['BRL', 'Real'], ['USD', 'Dólar'], ['EUR', 'Euro']] as const).map(([codigo, nome]) => <label className="account-currency-choice" key={codigo}>
                  <input type="radio" name="target-currency" value={codigo} checked={targetCurrency === codigo} onChange={() => setTargetCurrency(codigo)} />
                  <span className="account-currency-choice-content"><span>{nome}</span><strong>{codigo}</strong></span>
                </label>)}
              </div>
            </fieldset>
            <button type="submit" className="account-pix-submit" disabled={loading || converting || !conta || targetCurrency === conta.moeda_saldo}>{converting && <RefreshCw size={16} className="account-spin" aria-hidden />}{converting ? 'Convertendo…' : targetCurrency === conta?.moeda_saldo ? `Saldo já está em ${targetCurrency}` : 'Converter saldo'}</button>
          </form>
          <p className="account-pix-note">A conversão é realizada automaticamente com base na cotação de referência consultada na API, desconsiderando frações inferiores a um centavo. As transferências via Pix são convertidas automaticamente para a sua moeda.</p>
        </div> : area === 'profile' ? <>
          <p className="account-detail-intro">Confira seus dados de cadastro e as informações da sua conta tivvo</p>
          <dl className="account-data">
            <div><dt>Nome completo</dt><dd>{fullName}</dd></div>
            <div><dt>Data de nascimento</dt><dd>{birthDate}</dd></div>
            <div><dt>E-mail</dt><dd>{session.user.email ?? 'Não informado'}</dd></div>
            <div><dt>Data de cadastro</dt><dd>{createdLabel}</dd></div>
            <div><dt>Verificação do e-mail</dt><dd>{session.user.email_confirmed_at ? <span className="account-verified"><Check size={16} aria-hidden />Confirmado</span> : 'Pendente'}</dd></div>
          </dl>
          <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando…' : 'Atualizar dados'}</button>
        </> : area === 'history' ? <div className="account-transactions">
          <p className="account-detail-intro">Consulte todas as conversões de saldo e os Pix enviados ou recebidos pela sua conta.</p>
          <div className="account-transaction-filters" role="group" aria-label="Filtrar transações">
            {transactionFilters.map(filter => <button key={filter.id} type="button" className="account-transaction-filter" aria-pressed={historyFilter === filter.id} onClick={() => setHistoryFilter(filter.id)}>{filter.label}</button>)}
          </div>
          {loading ? <p className="account-transactions-state" role="status">Carregando histórico…</p> : filteredTransactionHistory.length === 0 ? <p className="account-transactions-state">{historyFilter === 'all' ? 'Ainda não há conversões ou Pix para mostrar.' : historyFilter === 'pix' ? 'Ainda não há Pix para mostrar.' : 'Ainda não há conversões para mostrar.'}</p> : <ul className="account-transaction-list" aria-label="Transações da conta">
            {filteredTransactionHistory.map(transaction => <li className={`account-transaction account-transaction-${transaction.tipo.toLowerCase()}`} key={transaction.id}>
              <span className="account-transaction-icon">{transaction.tipo === 'CONVERSAO' ? <ArrowRightLeft size={20} aria-hidden /> : transaction.tipo === 'PIX_ENVIADO' ? <ArrowUpRight size={20} aria-hidden /> : <ArrowDownLeft size={20} aria-hidden />}</span>
              <div className="account-transaction-main"><strong>{transactionLabel(transaction)}</strong><span>{formatDateTimeBr(transaction.criada_em)}</span></div>
              <div className="account-transaction-values">{transaction.tipo === 'CONVERSAO' ? <><strong>{formatarSaldo(transaction.valor, transaction.moeda)} → {transaction.valor_destino && transaction.moeda_destino ? formatarSaldo(transaction.valor_destino, transaction.moeda_destino) : transaction.moeda_destino ?? transaction.moeda}</strong><span>{transaction.moeda} para {transaction.moeda_destino ?? transaction.moeda}</span></> : <><strong>{transaction.tipo === 'PIX_ENVIADO' ? '−' : '+'}{formatarSaldo(transaction.valor, transaction.moeda)}</strong><span>{transaction.tipo === 'PIX_ENVIADO' ? `Destinatário: ${transaction.contraparte_nome ?? 'conta de destino'}` : `Remetente: ${transaction.contraparte_nome ?? 'remetente'}`}</span></>}</div>
            </li>)}
          </ul>}
          <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando…' : 'Atualizar histórico'}</button>
        </div> : area === 'pix' ? <div className="account-pix">
          <p className="account-detail-intro">Envie saldo simulado para outra conta tivvo usando a chave Pix de e-mail.</p>
          <form className="account-pix-form" onSubmit={event => void submitPix(event)} aria-busy={sendingPix}>
            <h2>Enviar Pix</h2>
            <label htmlFor="pix-key">Chave Pix de destino <span>(e-mail)</span></label>
            <input ref={pixKeyInput} id="pix-key" type="email" value={pixKey} onChange={event => setPixKey(event.target.value)} placeholder="pessoa@exemplo.com" autoComplete="email" required disabled={sendingPix || loading} />
            <label htmlFor="pix-value">Valor em {conta?.moeda_saldo ?? 'BRL'}</label>
            <div className="account-pix-value"><span>{conta?.moeda_saldo === 'USD' ? 'US$' : conta?.moeda_saldo === 'EUR' ? '€' : 'R$'}</span><input ref={pixValueInput} id="pix-value" type="text" inputMode="decimal" value={pixValue} onChange={event => setPixValue(event.target.value.replace(',', '.'))} placeholder="0,00" required disabled={sendingPix || loading} /></div>
            <button type="submit" className="account-pix-submit" disabled={sendingPix || loading}>{sendingPix && <RefreshCw size={16} className="account-spin" aria-hidden />}{sendingPix ? 'Enviando Pix…' : 'Enviar Pix'}</button>
          </form>
          <p className="account-pix-note">O envio é imediato neste ambiente de demonstração. Confira a chave e o valor antes de confirmar.</p>
        </div> : <>
          <InvestmentAccount principal={conta} investimento={investimento} loading={loading} token={session.access_token} onRefresh={onInvestmentRefresh} onTransfer={onInvestmentTransfer} onOperationError={showQueryError} onQueryError={showQueryError} onPurchase={onInvestmentPurchase} onSale={onInvestmentSale} />
        </>}
      </section>}

      {notice && <p className="account-notice" role={notice.kind === 'erro' ? 'alert' : 'status'}>{notice.text}</p>}
      <footer className="account-footer"><span>tivvo</span><p>Ambiente de demonstração · Saldos e investimentos simulados</p></footer>
    </main>
    {displayedError && <ErrorDialog
      key={operationError ? 'operation-error' : 'account-error'}
      {...displayedError.notice}
      open={!operationLoading && !loading}
      theme={theme}
      icon={errorIcons[displayedError.notice.icon]}
      details={displayedError.details}
      onClose={() => { if (operationError) setOperationError(null); else onDismissAccountError(); }}
      onAction={() => {
        if (displayedError.recover) { displayedError.recover(); return; }
        switch (displayedError.notice.action) {
          case 'edit-key': pixKeyInput.current?.focus(); break;
          case 'edit-value': pixValueInput.current?.focus(); break;
          case 'select-currency': currencyOptions.current?.querySelector<HTMLInputElement>('input:checked')?.focus(); break;
          case 'open-currencies': setArea('currencies'); break;
          case 'check-balances': setArea('home'); onRefresh(); break;
          case 'reload': onRefresh(); break;
          case 'sign-in': onLogout(); break;
        }
      }}
    />}
    <dialog ref={successDialog} className="account-pix-dialog" aria-labelledby="pix-success-title" onClose={() => setPixSuccess(null)}>
      {pixSuccess && <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><Check size={30} strokeWidth={2.5} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">Transferência concluída</span>
        <h2 id="pix-success-title">Pix enviado com sucesso</h2>
        <p className="account-pix-success-amount">{formatarSaldo(pixSuccess.valor, pixSuccess.moeda)}</p>
        <div className="account-pix-success-details"><div><span>Enviado para</span><strong>{pixSuccess.chave}</strong></div>{pixSuccess.recebido && <div><span>Recebido pelo destinatário</span><strong>{formatarSaldo(pixSuccess.recebido.valor_recebido, pixSuccess.recebido.moeda_recebida)}</strong></div>}</div>
        <button type="button" className="account-pix-success-close" onClick={() => successDialog.current?.close()}>Concluir</button>
      </div>}
    </dialog>
    <dialog ref={conversionSuccessDialog} className="account-pix-dialog" aria-labelledby="conversion-success-title" onClose={() => setConversionSuccess(null)}>
      {conversionSuccess && <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><Check size={30} strokeWidth={2.5} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">Conversão concluída</span>
        <h2 id="conversion-success-title">Saldo convertido com sucesso</h2>
        <p className="account-pix-success-amount">{formatarSaldo(conversionSuccess.recibo.conta.saldo, conversionSuccess.recibo.conta.moeda_saldo)}</p>
        <div className="account-pix-success-details">
          <div><span>Convertido de</span><strong>{formatarSaldo(conversionSuccess.saldoAnterior, conversionSuccess.moedaAnterior)}</strong></div>
          <div><span>Nova moeda</span><strong>{conversionSuccess.recibo.conta.moeda_saldo}</strong></div>
          <div><span>Cotação consultada em</span><strong>{formatDateTimeBr(conversionSuccess.recibo.cotacaoEm)}</strong></div>
        </div>
        <button type="button" className="account-pix-success-close" onClick={() => conversionSuccessDialog.current?.close()}>Concluir</button>
      </div>}
    </dialog>
    <dialog ref={loadingDialog} className="account-pix-dialog account-loading-dialog" aria-labelledby="operation-loading-title" onCancel={event => event.preventDefault()}>
      {operationLoading && <div className="account-loading-dialog-content" role="status" aria-live="polite">
        <span className="account-pix-progress-icon"><ArrowRightLeft size={22} aria-hidden /></span>
        <div>
          <h2 id="operation-loading-title">{operationLoading === 'pix' ? 'Transferência em andamento' : 'Conversão em andamento'}</h2>
          <p>{operationLoading === 'pix' ? 'Estamos enviando seu Pix. Aguarde a confirmação.' : `Estamos convertendo seu saldo para ${targetCurrency}. Aguarde a confirmação.`}</p>
        </div>
        <span className="account-pix-progress-bar" aria-hidden />
      </div>}
    </dialog>
  </div>;
}
