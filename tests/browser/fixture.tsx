// Browser-only fixture: actual UI, fake account data, no authentication or writes.
// This HTML entry is separate from the production application's Vite entry.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SmokeLogin } from '../../components/ui/smoke-login';
import { AccountHome } from '../../frontend/account-home';
import { ErrorDialog } from '../../components/ui/error-dialog';
import { t, useIdioma } from '../../frontend/idioma';
import { useSpotlightCards } from '../../components/ui/spotlight-card';
import type { Conta } from '../../frontend/moeda';
import type { ContaInvestimento } from '../../frontend/investment-types';
import type { Theme } from '../../lib/theme';
import '../../frontend/styles.css';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'home';
const stress = params.get('stress') === 'true';
const state = params.get('state') ?? 'normal';
const now = '2026-11-25T14:30:00Z';
const noop = () => {};
const name = stress ? 'Alexandria ' + 'Fernández de Albuquerque '.repeat(5) : 'Alexandria Fernández';
const email = stress ? 'contato.' + 'nomecomprido'.repeat(5) + '@exemplo.com' : 'alexandria@exemplo.com';
const money = stress ? '1234567890123.45' : '4289.41';
const conta: Conta = {
  id: 'test', saldo: money, saldo_brl: money, moeda_saldo: 'BRL',
  movimentacoes: state === 'empty' ? [] : Array.from({ length: 10 }, (_, i) => ({
    id: String(i), tipo: (['PIX_RECEBIDO', 'PIX_ENVIADO', 'CONVERSAO', 'COMPRA', 'VENDA'] as const)[i % 5]!,
    valor: money, moeda: 'BRL', moeda_destino: 'USD', valor_destino: money,
    cotacao_em: now, contraparte_nome: name, criada_em: now, codigo_ativo: 'PETR4', quantidade: '123.123456',
  })),
};
const investimento: ContaInvestimento = {
  saldo: money, moeda: 'BRL', acoes_investidas: money,
  posicoes: state === 'empty' ? [] : [{ codigo_ativo: 'PETR4', quantidade: stress ? '123456789.123456' : '2', preco_medio_compra: '44.00' }],
  transferencias: [],
};
const session = { user: { id: 'layout-test', email, created_at: now, email_confirmed_at: now,
  user_metadata: { first_name: name, last_name: 'Correa', birth_date: '1990-01-01' } }, access_token: 'test-only' } as Session;
const paths: Record<string, string> = {
  home: '/', profile: '/perfil', history: '/historico', pix: '/pix', currencies: '/moedas',
  investments: '/investimentos', transfer: '/investimentos/transferir',
  stocks: '/investimentos/acoes', holdings: '/investimentos/compradas',
};
history.replaceState(null, '', paths[view] ?? '/');

function Preview() {
  useIdioma();
  useSpotlightCards();
  const [theme, setTheme] = useState<Theme>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [signup, setSignup] = useState(view === 'signup');
  if (view === 'login' || view === 'signup') return <SmokeLogin brand="tivvo" mode={signup ? 'signup' : 'login'}
    title={signup ? <>{t('Comece pela ti')}<span className="text-[var(--accent)]">vv</span>o</>
      : <>{t('Que bom ter você na ti')}<span className="text-[var(--accent)]">vv</span>o</>}
    subtitle={signup ? t('Crie sua conta para explorar investimentos simulados com saldo inicial zero') : ''}
    submitLabel={signup ? t('Criar conta') : t('Entrar')} theme={theme}
    onSubmit={async () => {}} onSignUpClick={() => setSignup(value => !value)}
    notice={state === 'error' ? { text: name + ' · ' + t('Não foi possível concluir a operação.'), kind: 'erro' } : null} />;
  if (view === 'error') return <div className="account-app" data-theme={theme}><ErrorDialog open theme={theme}
    title={t('Saldo insuficiente')} description={t('O valor informado é maior que seu saldo disponível.')}
    details={[{ label: t('Nome completo'), value: name }, { label: t('E-mail'), value: email }, { label: t('Valor'), value: money }]}
    actionLabel={t('Transferir dinheiro')} onClose={noop} /></div>;
  return <AccountHome theme={theme} onThemeChange={setTheme} session={session}
    conta={state === 'loading' ? null : conta} investimento={state === 'loading' ? null : investimento}
    loading={state === 'loading'} notice={state === 'error' ? { text: email, kind: 'erro' } : null}
    accountError={null} onDismissAccountError={noop} onRefresh={noop} onInvestmentRefresh={noop} onLogout={noop}
    onPixTransfer={async () => ({ moeda_recebida: 'EUR', valor_recebido: money })}
    onConvertBalance={async () => ({ conta: { ...conta, moeda_saldo: 'USD' }, cotacaoEm: now })}
    onInvestmentTransfer={async direcao => ({ id: 'transfer-test', direcao, valor_origem: money, moeda_origem: 'BRL',
      valor_destino: money, moeda_destino: 'BRL', cotacao_em: now, criada_em: now })}
    onInvestmentPurchase={async (codigo, quantidade) => ({ id: 'buy-test', codigo_ativo: codigo, quantidade,
      preco_unitario: '44.43', total_pago: '44.43', cotacao_em: now, criada_em: now })}
    onInvestmentSale={async () => {}} />;
}
createRoot(document.getElementById('app')!).render(<Preview />);
