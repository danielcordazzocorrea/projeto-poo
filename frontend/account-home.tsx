import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Theme } from '@/lib/theme';
import { ArrowLeft, ArrowUpRight, ArrowRightLeft, ChartNoAxesCombined, Check, Eye, EyeOff, Landmark, LogOut, Moon, Sun, RefreshCw, UserRound } from 'lucide-react';
import { formatarSaldo, type Conta, type ConversionReceipt, type PixReceipt, type TipoMoeda } from './moeda';
import { InvestmentAccount, type ContaInvestimento, type DirecaoTransferencia, type TransferenciaInvestimento } from './investment-account';

type Area = 'home' | 'investments' | 'pix' | 'profile' | 'currencies';
type AccountHomeProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  session: Session;
  conta: Conta | null;
  investimento: ContaInvestimento | null;
  loading: boolean;
  notice: { text: string; kind: 'ok' | 'erro' | 'info' } | null;
  onRefresh: () => void;
  onPixTransfer: (chaveDestino: string, valor: string) => Promise<PixReceipt>;
  onConvertBalance: (moeda: TipoMoeda) => Promise<ConversionReceipt>;
  onInvestmentTransfer: (direcao: DirecaoTransferencia, valor: string) => Promise<TransferenciaInvestimento>;
  onInvestmentRefresh: () => void;
  onLogout: () => void;
};

const destinations = [
  { id: 'investments', title: 'Investimentos', description: 'Seu espaço para acompanhar ativos e construir sua carteira simulada', action: 'Explorar investimentos' },
  { id: 'pix', title: 'Pix', description: 'Um lugar para suas transferências e chaves', action: 'Conhecer a área Pix' },
  { id: 'currencies', title: 'Moedas', description: 'Converta seu saldo entre real, dólar e euro com cotação atualizada', action: 'Converter saldo' },
  { id: 'profile', title: 'Dados da conta', description: 'Consulte seu cadastro, e-mail e informações da sua conta em um só lugar', action: 'Ver meus dados' },
] as const;

function formatDateBr(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Não informado';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function PixLogo() {
  return <img className="account-pix-logo" src="/pix-logo.svg" alt="" />;
}

export function AccountHome({ theme, onThemeChange, session, conta, investimento, loading, notice, onRefresh, onPixTransfer, onConvertBalance, onInvestmentTransfer, onInvestmentRefresh, onLogout }: AccountHomeProps) {
  const [area, setArea] = useState<Area>('home');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [pixKey, setPixKey] = useState('');
  const [pixValue, setPixValue] = useState('');
  const [sendingPix, setSendingPix] = useState(false);
  const [pixSuccess, setPixSuccess] = useState<{ chave: string; valor: string; moeda: TipoMoeda; recebido: PixReceipt } | null>(null);
  const [targetCurrency, setTargetCurrency] = useState<TipoMoeda>('USD');
  const [converting, setConverting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousArea = useRef(area);
  const successDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (previousArea.current !== area) heading.current?.focus();
    previousArea.current = area;
  }, [area]);
  useEffect(() => {
    if (pixSuccess && !successDialog.current?.open) successDialog.current?.showModal();
  }, [pixSuccess]);
  const balance = conta ? formatarSaldo(conta.saldo, conta.moeda_saldo) : 'Indisponível';
  const created = new Date(session.user.created_at);
  const createdLabel = Number.isNaN(created.getTime()) ? 'Não informado' : created.toLocaleDateString('pt-BR');
  const selected = destinations.find(item => item.id === area);
  const savedName: unknown = session.user.user_metadata?.first_name;
  const firstName = typeof savedName === 'string' ? savedName.trim().split(/\s+/)[0] : '';
  const savedLastName: unknown = session.user.user_metadata?.last_name;
  const lastName = typeof savedLastName === 'string' ? savedLastName.trim() : '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Não informado';
  const birthDate = formatDateBr(session.user.user_metadata?.birth_date);

  async function submitPix(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (sendingPix) return;
    setSendingPix(true);
    try {
      const chave = pixKey.trim();
      const valor = pixValue;
      const moeda = conta?.moeda_saldo ?? 'BRL';
      const recebido = await onPixTransfer(chave, valor);
      setPixSuccess({ chave, valor, moeda, recebido });
      setPixKey('');
      setPixValue('');
    } catch { /* A mensagem de erro é exibida pelo aviso compartilhado da conta. */ }
    finally { setSendingPix(false); }
  }

  async function submitConversion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setConverting(true);
    try { await onConvertBalance(targetCurrency); }
    catch { /* O aviso compartilhado mostra o erro. */ }
    finally { setConverting(false); }
  }

  return <div className="account-app" data-theme={theme} style={{ colorScheme: theme }}>
    <a className="account-skip" href="#account-content">Ir para o conteúdo</a>
    <header className="account-topbar">
      <div className="account-container account-topbar-inner">
        <button className="account-brand" type="button" onClick={() => setArea('home')} aria-label="tivvo — início"><span className="account-brand-symbol"><Landmark size={22} aria-hidden /></span><span>ti<span className="account-brand-accent">vv</span>o</span></button>
        <div className="account-user">
          <span className="account-user-email">{session.user.email ?? 'Minha conta'}</span>
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
      <nav aria-label="Localização" className="account-breadcrumb"><button type="button" onClick={() => setArea('home')} aria-current={area === 'home' ? 'page' : undefined}>Início</button>{selected && <><span aria-hidden>/</span><span aria-current="page">{selected.title}</span></>}</nav>

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
            <span className="account-destination-top"><span className="account-option-icon">{id === 'pix' ? <PixLogo /> : id === 'currencies' ? <ArrowRightLeft size={26} strokeWidth={1.6} aria-hidden /> : id === 'investments' ? <ChartNoAxesCombined size={26} strokeWidth={1.6} aria-hidden /> : <UserRound size={26} strokeWidth={1.6} aria-hidden />}</span><ArrowUpRight size={20} aria-hidden /></span>
            <h3>{title}</h3><p>{description}</p><span className="account-destination-action">{action}</span>
          </button>)}</div>
        </section>
      </> : <section className="account-detail" aria-labelledby="area-title">
        <button className="account-back" type="button" onClick={() => setArea('home')}><ArrowLeft size={17} aria-hidden />Voltar ao início</button>
        <h1 id="area-title" ref={heading} tabIndex={-1}>{selected?.title}</h1>
        {area === 'currencies' ? <div className="account-currency-area">
          <p className="account-detail-intro">Seu saldo está em <strong>{conta?.moeda_saldo ?? 'BRL'}</strong>. Ao converter, todo o saldo passa para a moeda escolhida com a cotação mais recente da API. Os valores são simulados.</p>
          <div className="account-currency-balance"><span>Saldo atual</span><p className="account-currency-current" aria-live="polite">{conta ? formatarSaldo(conta.saldo, conta.moeda_saldo) : 'Carregando saldo…'}</p></div>
          <form className="account-pix-form" onSubmit={event => void submitConversion(event)} aria-busy={converting}>
            <fieldset className="account-currency-options" disabled={loading || converting}>
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
          {converting && <div className="account-pix-progress" role="status" aria-live="polite"><span className="account-pix-progress-icon"><ArrowRightLeft size={22} aria-hidden /></span><div><strong>Conversão em andamento</strong><p>Estamos convertendo seu saldo para {targetCurrency}. Aguarde a confirmação.</p></div><span className="account-pix-progress-bar" aria-hidden /></div>}
          <p className="account-pix-note">A conversão usa a cotação de referência consultada na API e trunca frações menores que um centavo. O Pix é enviado na moeda do seu saldo e chega na moeda da conta de destino. A transferência para investimentos converte automaticamente para BRL.</p>
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
        </> : area === 'pix' ? <div className="account-pix">
          <p className="account-detail-intro">Envie saldo simulado para outra conta tivvo usando a chave Pix de e-mail.</p>
          <form className="account-pix-form" onSubmit={event => void submitPix(event)} aria-busy={sendingPix}>
            <h2>Enviar Pix</h2>
            <label htmlFor="pix-key">Chave Pix de destino <span>(e-mail)</span></label>
            <input id="pix-key" type="email" value={pixKey} onChange={event => setPixKey(event.target.value)} placeholder="pessoa@exemplo.com" autoComplete="email" required disabled={sendingPix || loading} />
            <label htmlFor="pix-value">Valor em {conta?.moeda_saldo ?? 'BRL'}</label>
            <div className="account-pix-value"><span>{conta?.moeda_saldo === 'USD' ? 'US$' : conta?.moeda_saldo === 'EUR' ? '€' : 'R$'}</span><input id="pix-value" type="text" inputMode="decimal" value={pixValue} onChange={event => setPixValue(event.target.value.replace(',', '.'))} placeholder="0,00" required disabled={sendingPix || loading} /></div>
            <button type="submit" className="account-pix-submit" disabled={sendingPix || loading}>{sendingPix && <RefreshCw size={16} className="account-spin" aria-hidden />}{sendingPix ? 'Enviando Pix…' : 'Enviar Pix'}</button>
          </form>
          {sendingPix && <div className="account-pix-progress" role="status" aria-live="polite"><span className="account-pix-progress-icon"><ArrowRightLeft size={22} aria-hidden /></span><div><strong>Transferência em andamento</strong><p>Estamos enviando seu Pix. Aguarde a confirmação.</p></div><span className="account-pix-progress-bar" aria-hidden /></div>}
          <p className="account-pix-note">O envio é imediato neste ambiente de demonstração. Confira a chave e o valor antes de confirmar.</p>
        </div> : <InvestmentAccount principal={conta} investimento={investimento} loading={loading} onRefresh={onInvestmentRefresh} onTransfer={onInvestmentTransfer} />}
      </section>}

      {notice && <p className="account-notice" role={notice.kind === 'erro' ? 'alert' : 'status'}>{notice.text}</p>}
      <footer className="account-footer"><span>tivvo</span><p>Ambiente de demonstração · Saldos e investimentos simulados</p></footer>
    </main>
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
  </div>;
}
