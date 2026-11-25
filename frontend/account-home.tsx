import { t, SeletorIdioma } from '@/frontend/idioma';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ComprovanteCompra } from './investment-types';
import { ValorInput } from './valor-input';
import { SaldoDisponivel } from './saldo-disponivel';
import type { Session } from '@supabase/supabase-js';
import type { Theme } from '@/lib/theme';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ArrowRightLeft, ChartNoAxesCombined, Check, Eye, EyeOff, History, Landmark, LogOut, Moon, Sun, RefreshCw, UserRound } from 'lucide-react';
import { AboutTivvo } from '@/components/ui/about-tivvo';
import { ErrorDialog } from '@/components/ui/error-dialog';
import { CircleAlert, CloudOff, Clock, Search, UserRoundX, Wallet } from 'lucide-react';
import { mapAccountError, type AccountErrorNotice } from './account-errors';
import { PixTransferError } from './pix-transfer';
import { CurrencyConversionError } from './currency-conversion';
import { LiveOrb } from './live-orb';
import { formatarSaldo, type Conta, type ConversionReceipt, type Movimentacao, type PixReceipt, type TipoMoeda } from './moeda';
import { InvestmentAccount, type ContaInvestimento, type DirecaoTransferencia, type TransferenciaInvestimento } from './investment-account';
import { pathForRoute, routeFromPath, type AccountRoute, type Area, type InvestmentCategory } from './rotas';

type TransactionFilter = 'all' | 'pix' | 'conversion' | 'stocks';
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
  onInvestmentPurchase: (codigoAtivo: string, quantidade: string, precoConfirmado: string) => Promise<ComprovanteCompra>;
  onInvestmentSale: (codigoAtivo: string, quantidade: string) => Promise<void>;
  onInvestmentRefresh: () => void;
  onLogout: () => void;
};

const destinations = [
  { id: 'investments', title: 'Investimentos', description: 'Seu espaço para acompanhar ativos e construir sua carteira simulada', action: 'Explorar investimentos' },
  { id: 'pix', title: 'Pix', description: 'Um lugar para suas transferências e chaves', action: 'Acessar Pix' },
  { id: 'currencies', title: 'Moedas', description: 'Converta seu saldo entre real, dólar e euro com cotação atualizada', action: 'Converter saldo' },
  { id: 'history', title: 'Histórico de transações', description: 'Acompanhe conversões de moeda e Pix enviados ou recebidos', action: 'Ver histórico' },
] as const;
const transactionFilters: { id: TransactionFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pix', label: 'Pix' },
  { id: 'conversion', label: 'Conversões' },
  { id: 'stocks', label: 'Ações' },
];

function formatDateBr(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return t("Não informado");
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTimeBr(value: string | null): string {
  if (!value) return t("Não informado");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("Não informado") : date.toLocaleString('pt-BR');
}

function PixLogo() {
  return <span className="account-pix-logo" aria-hidden />;
}
const errorIcons = { alert: CircleAlert, wallet: Wallet, recipient: UserRoundX, exchange: ArrowRightLeft, connection: CloudOff, clock: Clock, search: Search };

function transactionLabel(transaction: Movimentacao): string {
  if (transaction.tipo === 'COMPRA') return t("Compra de ativo");
  if (transaction.tipo === 'VENDA') return t("Venda de ativo");
  if (transaction.tipo === 'CONVERSAO') return t("Saldo convertido");
  if (transaction.tipo === 'PIX_ENVIADO') return t("Pix enviado");
  return t("Pix recebido");
}

export function AccountHome({ theme, onThemeChange, session, conta, investimento, loading, notice, accountError, onDismissAccountError, onRefresh, onPixTransfer, onConvertBalance, onInvestmentTransfer, onInvestmentPurchase, onInvestmentSale, onInvestmentRefresh, onLogout }: AccountHomeProps) {
  const [route, setRoute] = useState<AccountRoute>(() => routeFromPath(window.location.pathname));
  const area = route.area;
  const [balanceVisible, setBalanceVisible] = useState(false);
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
  const [purchaseSuccess, setPurchaseSuccess] = useState<ComprovanteCompra | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousArea = useRef(area);
  const successDialog = useRef<HTMLDialogElement>(null);
  const conversionSuccessDialog = useRef<HTMLDialogElement>(null);
  const purchaseSuccessDialog = useRef<HTMLDialogElement>(null);
  const loadingDialog = useRef<HTMLDialogElement>(null);
  const operationLoading = sendingPix ? 'pix' : converting ? 'conversion' : null;
  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  function navigate(nextArea: Area, category: InvestmentCategory = null) {
    const nextRoute: AccountRoute = { area: nextArea, category: nextArea === 'investments' ? category : null };
    const nextPath = pathForRoute(nextRoute);
    if (window.location.pathname !== nextPath) window.history.pushState(null, '', nextPath);
    setRoute(nextRoute);
  }
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
    if (purchaseSuccess && !purchaseSuccessDialog.current?.open) purchaseSuccessDialog.current?.showModal();
  }, [purchaseSuccess]);
  useEffect(() => {
    if (operationLoading && !loadingDialog.current?.open) loadingDialog.current?.showModal();
    if (!operationLoading && loadingDialog.current?.open) loadingDialog.current.close();
  }, [operationLoading]);
  const balance = conta ? formatarSaldo(conta.saldo, conta.moeda_saldo) : t("Indisponível");
  const created = new Date(session.user.created_at);
  const createdLabel = Number.isNaN(created.getTime()) ? t("Não informado") : created.toLocaleDateString('pt-BR');
  const selected = destinations.find(item => item.id === area);
  const areaTitle = area === 'profile' ? t("Meu perfil") : t(selected?.title ?? '');
  const savedName: unknown = session.user.user_metadata?.first_name;
  const firstName = typeof savedName === 'string' ? savedName.trim().split(/\s+/)[0] : '';
  const savedLastName: unknown = session.user.user_metadata?.last_name;
  const lastName = typeof savedLastName === 'string' ? savedLastName.trim() : '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || t("Não informado");
  const birthDate = formatDateBr(session.user.user_metadata?.birth_date);
  const transactionHistory = conta?.movimentacoes.filter(transaction => ['CONVERSAO', 'PIX_ENVIADO', 'PIX_RECEBIDO', 'COMPRA', 'VENDA'].includes(transaction.tipo)) ?? [];
  const filteredTransactionHistory = (historyFilter === 'all' ? transactionHistory : transactionHistory
    .filter(transaction => historyFilter === 'pix' ? transaction.tipo.startsWith('PIX_') : historyFilter === 'stocks'
      ? transaction.tipo === 'COMPRA' || transaction.tipo === 'VENDA' : transaction.tipo === 'CONVERSAO')).slice(0, 10);


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
    <a className="account-skip" href="#account-content">{t("Ir para o conteúdo")}</a>
    <header className="account-topbar">
      <div className="account-container account-topbar-inner">
        <div className="account-brand-nav">
          <button className="account-brand" type="button" onClick={() => navigate('home')} aria-label="tivvo — início"><span className="account-brand-symbol"><Landmark size={22} aria-hidden /></span><span>ti<span className="account-brand-accent">vv</span>o</span></button>
          <AboutTivvo triggerClassName="account-about-trigger" theme={theme} />
        </div>
        <div className="account-user">
          <SeletorIdioma />
          <button className="account-profile-link" type="button" onClick={() => navigate('profile')} aria-label={t("Meu perfil")} data-tooltip={t("Meu perfil")} aria-current={area === 'profile' ? 'page' : undefined}><UserRound size={17} aria-hidden /></button>
          <button
            className="account-theme-toggle"
            type="button"
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? t("Alternar para modo claro") : t("Alternar para modo escuro")}
            data-tooltip={theme === 'dark' ? t("Alternar para modo claro") : t("Alternar para modo escuro")}
          >
            {theme === 'dark' ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
          </button>
          <button className="account-logout" type="button" onClick={onLogout}><LogOut size={17} aria-hidden />{t("Sair")}</button>
        </div>
      </div>
    </header>

    <main id="account-content" className="account-container account-main">
      <nav aria-label={t("Localização")} className="account-breadcrumb"><button type="button" onClick={() => navigate('home')} aria-current={area === 'home' ? 'page' : undefined}>{t("Início")}</button>{areaTitle && <><span aria-hidden>/</span><span aria-current="page">{areaTitle}</span></>}</nav>

      {area === 'home' ? <>
        <section className="account-overview" aria-labelledby="home-title">
          <div className="account-greeting"><span className="account-tag"><span />{t("Sua vida financeira, conectada")}</span><h1 id="home-title" ref={heading} tabIndex={-1}>{firstName ? `${t("Olá,")} ${firstName}!` : t("Olá!")}</h1><p>{t("Acompanhe e gerencie seu patrimônio")}</p></div>
          <div className="account-balance" aria-busy={loading}>
            <div className="account-balance-label"><span>{t("Saldo disponível simulado ·")} {conta?.moeda_saldo ?? 'BRL'}</span><button type="button" onClick={() => setBalanceVisible(value => !value)} aria-label={balanceVisible ? t("Ocultar saldo") : t("Mostrar saldo")} aria-pressed={!balanceVisible}>{balanceVisible ? <Eye size={19} /> : <EyeOff size={19} />}</button></div>
            <p className="account-balance-value" aria-live="polite">{!balanceVisible ? '••••••' : loading ? t("Carregando…") : balance}</p>
            <button className="account-refresh" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? t("Atualizando saldo") : t("Atualizar saldo")}</button>
          </div>
        </section>
        <section className="account-options" aria-labelledby="options-title">
          <div className="account-section-heading"><h2 id="options-title">{t("Visão geral da sua conta")}</h2><span>{t("Tudo em um só lugar")}</span></div>
          <div className="account-destinations">{destinations.map(({ id, title, description, action }) => <button key={id} type="button" className={`account-destination account-destination-${id}`} onClick={() => navigate(id)}>
            <span className="account-destination-top"><span className="account-option-icon">{id === 'pix' ? <PixLogo /> : id === 'currencies' ? <ArrowRightLeft size={26} strokeWidth={1.6} aria-hidden /> : id === 'investments' ? <ChartNoAxesCombined size={26} strokeWidth={1.6} aria-hidden /> : <History size={26} strokeWidth={1.6} aria-hidden />}</span><ArrowUpRight size={20} aria-hidden /></span>
            <h3>{t(title)}</h3><p>{t(description)}</p><span className="account-destination-action">{t(action)}</span>
          </button>)}</div>
        </section>
      </> : <section className="account-detail" aria-labelledby="area-title">
        <button className="account-back" type="button" onClick={() => navigate('home')}><ArrowLeft size={17} aria-hidden />{t("Voltar ao início")}</button>
        <h1 id="area-title" ref={heading} tabIndex={-1}>{areaTitle}</h1>
        {area === 'currencies' ? <div className="account-currency-area">
          <p className="account-detail-intro">{t("Seu saldo está em")} <strong>{conta?.moeda_saldo ?? 'BRL'}</strong>{t(". Ao converter, todo o saldo passa para a moeda escolhida.")}</p>
          <div className="account-currency-balance"><span>{t("Saldo atual")}</span><p className="account-currency-current" aria-live="polite">{conta ? formatarSaldo(conta.saldo, conta.moeda_saldo) : t("Carregando saldo…")}</p></div>
          <form className="account-pix-form" onSubmit={event => void submitConversion(event)} aria-busy={converting}>
            <fieldset ref={currencyOptions} className="account-currency-options" disabled={loading || converting}>
              <legend>{t("Converter saldo para")}</legend>
              <div className="account-currency-options-grid">
                {([['BRL', 'Real'], ['USD', t("Dólar")], ['EUR', 'Euro']] as const).map(([codigo, nome]) => <label className="account-currency-choice" key={codigo}>
                  <input type="radio" name="target-currency" value={codigo} checked={targetCurrency === codigo} onChange={() => setTargetCurrency(codigo)} />
                  <span className="account-currency-choice-content"><span>{nome}</span><strong>{codigo}</strong></span>
                </label>)}
              </div>
            </fieldset>
            <button type="submit" className="account-pix-submit" disabled={loading || converting || !conta || targetCurrency === conta.moeda_saldo}>{converting && <RefreshCw size={16} className="account-spin" aria-hidden />}{converting ? t("Convertendo…") : targetCurrency === conta?.moeda_saldo ? `${t("Saldo já está em")} ${targetCurrency}` : t("Converter saldo")}</button>
          </form>
          <p className="account-pix-note">{t("A conversão é realizada automaticamente com base na cotação de referência consultada na API, desconsiderando frações inferiores a um centavo. As transferências via Pix são convertidas automaticamente para a sua moeda.")}</p>
        </div> : area === 'profile' ? <>
          <p className="account-detail-intro">{t("Confira seus dados de cadastro e as informações da sua conta tivvo")}</p>
          <dl className="account-data">
            <div><dt>{t("Nome completo")}</dt><dd>{fullName}</dd></div>
            <div><dt>{t("Data de nascimento")}</dt><dd>{birthDate}</dd></div>
            <div><dt>{t("E-mail")}</dt><dd>{session.user.email ?? t("Não informado")}</dd></div>
            <div><dt>{t("Data de cadastro")}</dt><dd>{createdLabel}</dd></div>
            <div><dt>{t("Verificação do e-mail")}</dt><dd>{session.user.email_confirmed_at ? <span className="account-verified"><Check size={16} aria-hidden />{t("Confirmado")}</span> : t("Pendente")}</dd></div>
          </dl>
          <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? t("Atualizando…") : t("Atualizar dados")}</button>
        </> : area === 'history' ? <div className="account-transactions">
          <p className="account-detail-intro">{t("Consulte conversões, Pix e compras ou vendas de ações da sua conta.")}</p>
          <div className="account-transaction-filters" role="group" aria-label={t("Filtrar transações")}>
            {transactionFilters.map(filter => <button key={filter.id} type="button" className="account-transaction-filter" aria-pressed={historyFilter === filter.id} onClick={() => setHistoryFilter(filter.id)}>{t(filter.label)}</button>)}
          </div>
          {loading ? <p className="account-transactions-state" role="status">{t("Carregando histórico…")}</p> : filteredTransactionHistory.length === 0 ? <p className="account-transactions-state">{historyFilter === 'all' ? t("Ainda não há transações para mostrar.") : historyFilter === 'pix' ? t("Ainda não há Pix para mostrar.") : historyFilter === 'stocks' ? t("Ainda não há compras ou vendas de ações para mostrar.") : t("Ainda não há conversões para mostrar.")}</p> : <ul className="account-transaction-list" aria-label="Transações da conta">
            {filteredTransactionHistory.map(transaction => <li className={`account-transaction account-transaction-${transaction.tipo.toLowerCase()}`} key={transaction.id}>
              <span className="account-transaction-icon">{transaction.tipo === 'CONVERSAO' ? <ArrowRightLeft size={20} aria-hidden /> : (transaction.tipo === 'PIX_ENVIADO' || transaction.tipo === 'VENDA') ? <ArrowUpRight size={20} aria-hidden /> : <ArrowDownLeft size={20} aria-hidden />}</span>
              <div className="account-transaction-main"><strong>{transactionLabel(transaction)}</strong><span>{formatDateTimeBr(transaction.criada_em)}</span></div>
              <div className="account-transaction-values">{transaction.tipo === 'CONVERSAO' ? <><strong>{formatarSaldo(transaction.valor, transaction.moeda)} → {transaction.valor_destino && transaction.moeda_destino ? formatarSaldo(transaction.valor_destino, transaction.moeda_destino) : transaction.moeda_destino ?? transaction.moeda}</strong><span>{transaction.moeda} para {transaction.moeda_destino ?? transaction.moeda}</span></> : <><strong>{(transaction.tipo === 'PIX_ENVIADO' || transaction.tipo === 'COMPRA') ? '−' : '+'}{formatarSaldo(transaction.valor, transaction.moeda)}</strong><span>{transaction.tipo === 'COMPRA' || transaction.tipo === 'VENDA' ? `${transaction.codigo_ativo ?? t("Ativo")} · ${Number(transaction.quantidade ?? '0').toLocaleString('pt-BR', { maximumFractionDigits: 6 })} unidades` : transaction.tipo === 'PIX_ENVIADO' ? `Destinatário: ${transaction.contraparte_nome ?? 'conta de destino'}` : `Remetente: ${transaction.contraparte_nome ?? 'remetente'}`}</span></>}</div>
            </li>)}
          </ul>}
          <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? t("Atualizando…") : t("Atualizar histórico")}</button>
        </div> : area === 'pix' ? <div className="account-pix">
          <p className="account-detail-intro">{t("Envie saldo simulado para outra conta tivvo usando a chave Pix de e-mail.")}</p>
          <form className="account-pix-form" onSubmit={event => void submitPix(event)} aria-busy={sendingPix}>
            <SaldoDisponivel id="pix-available-balance" saldo={conta ? balance : t("Carregando…")} />
            <h2>{t("Enviar Pix")}</h2>
            <label htmlFor="pix-key">{t("Chave Pix de destino")} <span>(e-mail)</span></label>
            <input ref={pixKeyInput} id="pix-key" type="email" value={pixKey} onChange={event => setPixKey(event.target.value)} placeholder="pessoa@exemplo.com" autoComplete="email" required disabled={sendingPix || loading} />
            <label htmlFor="pix-value">{t("Valor em")} {conta?.moeda_saldo ?? 'BRL'}</label>
            <div className="account-pix-value"><span>{conta?.moeda_saldo === 'USD' ? 'US$' : conta?.moeda_saldo === 'EUR' ? '€' : 'R$'}</span><ValorInput ref={pixValueInput} id="pix-value" value={pixValue} onValueChange={setPixValue} aria-describedby="pix-available-balance" placeholder="0,00" required disabled={sendingPix || loading || !conta} /></div>
            <button type="submit" className="account-pix-submit" disabled={sendingPix || loading}>{sendingPix && <RefreshCw size={16} className="account-spin" aria-hidden />}{sendingPix ? t("Enviando Pix…") : t("Enviar Pix")}</button>
          </form>
          <p className="account-pix-note">{t("O envio é imediato neste ambiente de demonstração. Confira a chave e o valor antes de confirmar.")}</p>
        </div> : <>
          <InvestmentAccount principal={conta} investimento={investimento} loading={loading} token={session.access_token} category={route.category} onCategoryChange={category => navigate('investments', category)} onOperationError={showQueryError} onQueryError={showQueryError} onRefresh={onInvestmentRefresh} onTransfer={onInvestmentTransfer} onPurchase={onInvestmentPurchase} onPurchaseSuccess={setPurchaseSuccess} onSale={onInvestmentSale} />
        </>}
      </section>}

      {notice && <p className="account-notice" role={notice.kind === 'erro' ? 'alert' : 'status'}>{notice.text}</p>}
      <footer className="account-footer"><span>tivvo</span><p>{t("Ambiente de demonstração · Saldos e investimentos simulados")}</p></footer>
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
          case 'open-currencies': navigate('currencies'); break;
          case 'check-balances': navigate('home'); onRefresh(); break;
          case 'reload': onRefresh(); break;
          case 'sign-in': onLogout(); break;
        }
      }}
    />}
    <dialog ref={successDialog} className="account-pix-dialog" aria-labelledby="pix-success-title" onClose={() => setPixSuccess(null)}>
      {pixSuccess && <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><Check size={30} strokeWidth={2.5} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">{t("Transferência concluída")}</span>
        <h2 id="pix-success-title">{t("Pix enviado com sucesso")}</h2>
        <p className="account-pix-success-amount">{formatarSaldo(pixSuccess.valor, pixSuccess.moeda)}</p>
        <div className="account-pix-success-details"><div><span>{t("Enviado para")}</span><strong>{pixSuccess.chave}</strong></div>{pixSuccess.recebido && <div><span>{t("Recebido pelo destinatário")}</span><strong>{formatarSaldo(pixSuccess.recebido.valor_recebido, pixSuccess.recebido.moeda_recebida)}</strong></div>}</div>
        <button type="button" className="account-pix-success-close" onClick={() => successDialog.current?.close()}>{t("Concluir")}</button>
      </div>}
    </dialog>
    <dialog ref={conversionSuccessDialog} className="account-pix-dialog" aria-labelledby="conversion-success-title" onClose={() => setConversionSuccess(null)}>
      {conversionSuccess && <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><Check size={30} strokeWidth={2.5} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">{t("Conversão concluída")}</span>
        <h2 id="conversion-success-title">{t("Saldo convertido com sucesso")}</h2>
        <p className="account-pix-success-amount">{formatarSaldo(conversionSuccess.recibo.conta.saldo, conversionSuccess.recibo.conta.moeda_saldo)}</p>
        <div className="account-pix-success-details">
          <div><span>{t("Convertido de")}</span><strong>{formatarSaldo(conversionSuccess.saldoAnterior, conversionSuccess.moedaAnterior)}</strong></div>
          <div><span>{t("Nova moeda")}</span><strong>{conversionSuccess.recibo.conta.moeda_saldo}</strong></div>
          <div><span>{t("Cotação consultada em")}</span><strong>{formatDateTimeBr(conversionSuccess.recibo.cotacaoEm)}</strong></div>
        </div>
        <button type="button" className="account-pix-success-close" onClick={() => conversionSuccessDialog.current?.close()}>{t("Concluir")}</button>
      </div>}
    </dialog>
    <dialog ref={purchaseSuccessDialog} className="account-pix-dialog" aria-labelledby="purchase-success-title" onClose={() => setPurchaseSuccess(null)}>
      {purchaseSuccess && <div className="account-pix-dialog-content">
        <span className="account-pix-success-icon"><Check size={30} strokeWidth={2.5} aria-hidden /></span>
        <span className="account-pix-success-eyebrow">{t("Compra concluída")}</span>
        <h2 id="purchase-success-title">{t("Ativo comprado com sucesso")}</h2>
        <p className="account-pix-success-amount">{formatarSaldo(purchaseSuccess.total_pago, 'BRL')}</p>
        <div className="account-pix-success-details">
          <div><span>{t("Ativo")}</span><strong>{purchaseSuccess.codigo_ativo}</strong></div>
          <div><span>{t("Quantidade")}</span><strong>{Number(purchaseSuccess.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</strong></div>
          <div><span>{t("Preço por unidade")}</span><strong>{formatarSaldo(purchaseSuccess.preco_unitario, 'BRL')}</strong></div>
          <div><span>{t("Data e hora da compra")}</span><strong>{formatDateTimeBr(purchaseSuccess.criada_em)}</strong></div>
        </div>
        <button type="button" className="account-pix-success-close" onClick={() => purchaseSuccessDialog.current?.close()}>{t("Concluir")}</button>
      </div>}
    </dialog>
    <dialog ref={loadingDialog} className="account-pix-dialog account-loading-dialog" aria-labelledby="operation-loading-title" onCancel={event => event.preventDefault()}>
      {operationLoading && <div className="account-loading-dialog-content" role="status" aria-live="polite">
        <span className="account-pix-progress-icon"><ArrowRightLeft size={22} aria-hidden /></span>
        <div>
          <h2 id="operation-loading-title">{operationLoading === 'pix' ? t("Transferência em andamento") : t("Conversão em andamento")}</h2>
          <p>{operationLoading === 'pix' ? t("Estamos enviando seu Pix. Aguarde a confirmação.") : `Estamos convertendo seu saldo para ${targetCurrency}. Aguarde a confirmação.`}</p>
        </div>
        <span className="account-pix-progress-bar" aria-hidden />
      </div>}
    </dialog>
    <LiveOrb key={session.user.id} theme={theme} token={session.access_token} onPixTransfer={onPixTransfer} />
  </div>;
}
