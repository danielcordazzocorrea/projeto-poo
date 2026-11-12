import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Theme } from '@/lib/theme';
import { ArrowLeft, ArrowUpRight, ChartNoAxesCombined, Check, Eye, EyeOff, Landmark, LogOut, RefreshCw, ScanLine, UserRound } from 'lucide-react';

type Area = 'home' | 'investments' | 'pix' | 'profile';
type AccountHomeProps = {
  theme: Theme;
  session: Session;
  conta: { id: string; saldo_brl: string } | null;
  loading: boolean;
  notice: { text: string; kind: 'ok' | 'erro' | 'info' } | null;
  onRefresh: () => void;
  onLogout: () => void;
};

const destinations = [
  { id: 'investments', title: 'Investimentos', description: 'Seu espaço para acompanhar ativos e construir sua carteira simulada.', action: 'Explorar investimentos', icon: ChartNoAxesCombined },
  { id: 'pix', title: 'Pix', description: 'Um lugar para suas transferências e chaves. Estamos preparando essa área.', action: 'Conhecer a área Pix', icon: ScanLine },
  { id: 'profile', title: 'Dados da conta', description: 'Consulte seu cadastro, e-mail e informações da sua conta em um só lugar.', action: 'Ver meus dados', icon: UserRound },
] as const;

export function AccountHome({ theme, session, conta, loading, notice, onRefresh, onLogout }: AccountHomeProps) {
  const [area, setArea] = useState<Area>('home');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousArea = useRef(area);
  useEffect(() => {
    if (previousArea.current !== area) heading.current?.focus();
    previousArea.current = area;
  }, [area]);
  const balance = conta ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(conta.saldo_brl)) : 'Indisponível';
  const created = new Date(session.user.created_at);
  const createdLabel = Number.isNaN(created.getTime()) ? 'Não informado' : created.toLocaleDateString('pt-BR');
  const selected = destinations.find(item => item.id === area);

  return <div className="account-app" data-theme={theme} style={{ colorScheme: theme }}>
    <a className="account-skip" href="#account-content">Ir para o conteúdo</a>
    <header className="account-topbar">
      <div className="account-container account-topbar-inner">
        <button className="account-brand" type="button" onClick={() => setArea('home')} aria-label="Corretora POO — início"><span className="account-brand-symbol"><Landmark size={22} aria-hidden /></span>Corretora <span className="account-brand-suffix">POO</span></button>
        <div className="account-user"><span className="account-user-email">{session.user.email ?? 'Minha conta'}</span><button className="account-logout" type="button" onClick={onLogout}><LogOut size={17} aria-hidden />Sair</button></div>
      </div>
    </header>

    <main id="account-content" className="account-container account-main">
      <nav aria-label="Localização" className="account-breadcrumb"><button type="button" onClick={() => setArea('home')} aria-current={area === 'home' ? 'page' : undefined}>Início</button>{selected && <><span aria-hidden>/</span><span aria-current="page">{selected.title}</span></>}</nav>

      {area === 'home' ? <>
        <section className="account-overview" aria-labelledby="home-title">
          <div className="account-greeting"><span className="account-tag"><span />Sua conta, conectada</span><h1 id="home-title" ref={heading} tabIndex={-1}>Tudo começa<br />pela sua conta.</h1><p>Escolha o que você quer fazer hoje.</p></div>
          <div className="account-balance" aria-busy={loading}>
            <div className="account-balance-label"><span>Saldo disponível simulado</span><button type="button" onClick={() => setBalanceVisible(value => !value)} aria-label={balanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'} aria-pressed={!balanceVisible}>{balanceVisible ? <Eye size={19} /> : <EyeOff size={19} />}</button></div>
            <p className="account-balance-value" aria-live="polite">{!balanceVisible ? '••••••' : loading ? 'Carregando…' : balance}</p>
            <button className="account-refresh" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando saldo' : 'Atualizar saldo'}</button>
          </div>
        </section>
        <section className="account-options" aria-labelledby="options-title">
          <div className="account-section-heading"><h2 id="options-title">Sua conta, por aqui.</h2><span>O que você precisa, em um lugar.</span></div>
          <div className="account-destinations">{destinations.map(({ id, title, description, action, icon: Icon }) => <button key={id} type="button" className={`account-destination account-destination-${id}`} onClick={() => setArea(id)}>
            <span className="account-destination-top"><span className="account-option-icon"><Icon size={26} strokeWidth={1.6} aria-hidden /></span><ArrowUpRight size={20} aria-hidden /></span>
            <h3>{title}</h3><p>{description}</p><span className="account-destination-action">{action}</span>
          </button>)}</div>
        </section>
      </> : <section className="account-detail" aria-labelledby="area-title">
        <button className="account-back" type="button" onClick={() => setArea('home')}><ArrowLeft size={17} aria-hidden />Voltar ao início</button>
        <h1 id="area-title" ref={heading} tabIndex={-1}>{selected?.title}</h1>
        {area === 'profile' ? <>
          <p className="account-detail-intro">As informações do seu cadastro e da sua conta na corretora.</p>
          <dl className="account-data">
            <div><dt>E-mail</dt><dd>{session.user.email ?? 'Não informado'}</dd></div>
            <div><dt>Identificador da conta</dt><dd>{loading ? 'Carregando…' : conta?.id ?? 'Conta indisponível. Tente atualizar os dados.'}</dd></div>
            <div><dt>Data de cadastro</dt><dd>{createdLabel}</dd></div>
            <div><dt>Verificação do e-mail</dt><dd>{session.user.email_confirmed_at ? <span className="account-verified"><Check size={16} aria-hidden />Confirmado</span> : 'Pendente'}</dd></div>
          </dl>
          <button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />{loading ? 'Atualizando…' : 'Atualizar dados'}</button>
        </> : <div className="account-coming-soon">
          <span className="account-coming-icon">{area === 'pix' ? <ScanLine size={40} strokeWidth={1.4} aria-hidden /> : <ChartNoAxesCombined size={40} strokeWidth={1.4} aria-hidden />}</span>
          <span className="account-soon-label">Em breve</span>
          <h2>{area === 'pix' ? 'Seu Pix terá lugar aqui.' : 'O próximo passo para sua carteira.'}</h2>
          <p>{area === 'pix' ? 'Esta área está em preparação. Ainda não é possível cadastrar chaves, enviar ou receber Pix.' : 'Estamos preparando a consulta de ativos e a gestão da sua carteira. As operações de investimento ainda não estão disponíveis nesta tela.'}</p>
        </div>}
      </section>}

      {notice && <p className="account-notice" role={notice.kind === 'erro' ? 'alert' : 'status'}>{notice.text}</p>}
      <footer className="account-footer"><span>Corretora POO</span><p>Ambiente de demonstração. Saldos e investimentos são simulados.</p></footer>
    </main>
  </div>;
}
