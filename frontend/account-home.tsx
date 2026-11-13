import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Theme } from '@/lib/theme';
import { ArrowLeft, ArrowUpRight, ArrowRightLeft, ChartNoAxesCombined, Check, Eye, EyeOff, Landmark, LogOut, Moon, Sun, RefreshCw, UserRound } from 'lucide-react';
import { CurrencyArea } from './currency-area';
import { formatarMoeda, NOMES_MOEDAS, type Conta, type SaldoMoeda, type TipoMoeda } from './moedas';

type Area = 'home' | 'investments' | 'pix' | 'profile' | 'currencies';
type AccountHomeProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  session: Session;
  conta: Conta | null;
  loading: boolean;
  notice: { text: string; kind: 'ok' | 'erro' | 'info' } | null;
  onRefresh: () => void;
  onPixTransfer: (chaveDestino: string, valor: string) => Promise<void>;
  onSaveCurrency: (moeda: TipoMoeda) => Promise<void>;
  onSimulateCurrency: (valor: string, moeda: TipoMoeda) => Promise<SaldoMoeda>;
  onCurrencyTransfer: (chaveDestino: string, valor: string) => Promise<SaldoMoeda>;
  onLogout: () => void;
};

const destinations = [
  { id: 'investments', title: 'Investimentos', description: 'Seu espaço para acompanhar ativos e construir sua carteira simulada', action: 'Explorar investimentos' },
  { id: 'pix', title: 'Pix', description: 'Envie reais para outra conta tivvo usando uma chave de e-mail', action: 'Enviar Pix' },
  { id: 'currencies', title: 'Moedas', description: 'Consulte seus saldos, simule câmbio e envie com conversão para dólar ou bitcoin', action: 'Gerenciar moedas' },
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

export function AccountHome({ theme, onThemeChange, session, conta, loading, notice, onRefresh, onPixTransfer, onSaveCurrency, onSimulateCurrency, onCurrencyTransfer, onLogout }: AccountHomeProps) {
  const [area, setArea] = useState<Area>('home');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [pixKey, setPixKey] = useState('');
  const [pixValue, setPixValue] = useState('');
  const [sendingPix, setSendingPix] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousArea = useRef(area);
  useEffect(() => {
    if (previousArea.current !== area) heading.current?.focus();
    previousArea.current = area;
  }, [area]);
  const balance = conta ? formatarMoeda(conta.saldo_brl, 'BRL') : 'Indisponível';
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
    setSendingPix(true);
    try {
      await onPixTransfer(pixKey, pixValue);
      setPixKey('');
      setPixValue('');
    } catch { /* A mensagem de erro é exibida pelo aviso compartilhado da conta. */ }
    finally { setSendingPix(false); }
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
            <div className="account-balance-label"><span>Saldo disponível simulado</span><button type="button" onClick={() => setBalanceVisible(value => !value)} aria-label={balanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'} aria-pressed={!balanceVisible}>{balanceVisible ? <Eye size={19} /> : <EyeOff size={19} />}</button></div>
            <p className="account-balance-value" aria-live="polite">{!balanceVisible ? '••••••' : loading ? 'Carregando…' : balance}</p>
            <button className="account-refresh" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando saldo' : 'Atualizar saldo'}</button>
          </div>
        </section>
        <section className="account-wallets" aria-label="Saldos por moeda" aria-busy={loading}>
          {(['BRL', 'USD', 'BTC'] as const).map(tipo => {
            const saldo = tipo === 'BRL' ? conta?.saldo_brl : conta?.saldos_moedas?.find(s => s.tipo_moeda === tipo)?.saldo;
            return <div className="account-wallet" key={tipo}>
              <span>{NOMES_MOEDAS[tipo]} <small>{tipo}</small></span>
              <strong>{!balanceVisible ? '••••••' : loading ? 'Carregando…' : saldo === undefined ? 'Indisponível' : formatarMoeda(saldo, tipo)}</strong>
              {conta?.tipo_moeda === tipo && <span className="account-wallet-preferred">Moeda de recebimento</span>}
            </div>;
          })}
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
        {area === 'currencies' ? <>
          <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />Atualizar saldos e moeda</button>
          <CurrencyArea conta={conta} loading={loading} onSave={onSaveCurrency} onSimulate={onSimulateCurrency} onTransfer={onCurrencyTransfer} />
        </> : area === 'profile' ? <>
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
          <form className="account-pix-form" onSubmit={event => void submitPix(event)}>
            <h2>Enviar Pix</h2>
            <label htmlFor="pix-key">Chave Pix de destino <span>(e-mail)</span></label>
            <input id="pix-key" type="email" value={pixKey} onChange={event => setPixKey(event.target.value)} placeholder="pessoa@exemplo.com" autoComplete="email" required disabled={sendingPix || loading} />
            <label htmlFor="pix-value">Valor</label>
            <div className="account-pix-value"><span>R$</span><input id="pix-value" type="text" inputMode="decimal" value={pixValue} onChange={event => setPixValue(event.target.value.replace(',', '.'))} placeholder="0,00" required disabled={sendingPix || loading} /></div>
            <button type="submit" className="account-pix-submit" disabled={sendingPix || loading}>{sendingPix ? 'Enviando Pix…' : 'Enviar Pix'}</button>
          </form>
          <p className="account-pix-note">O envio é imediato neste ambiente de demonstração. Confira a chave e o valor antes de confirmar.</p>
        </div> : <div className="account-coming-soon">
          <span className="account-coming-icon"><ChartNoAxesCombined size={40} strokeWidth={1.4} aria-hidden /></span>
          <span className="account-soon-label">Em breve</span>
          <h2>O próximo passo para sua carteira</h2>
          <p>Estamos preparando a consulta de ativos e a gestão da sua carteira — as operações de investimento ainda não estão disponíveis nesta tela</p>
        </div>}
      </section>}

      {notice && <p className="account-notice" role={notice.kind === 'erro' ? 'alert' : 'status'}>{notice.text}</p>}
      <footer className="account-footer"><span>tivvo</span><p>Ambiente de demonstração · Saldos e investimentos simulados</p></footer>
    </main>
  </div>;
}
