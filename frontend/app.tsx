import { useEffect, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AccountHome } from './account-home';
import { SmokeLogin } from '@/components/ui/smoke-login';
import { CONFIGURATION_NOTICE, submitCredentials } from './auth';
import { readSavedTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

type Conta = { id: string; saldo_brl: string };
type Notice = { text: string; kind: 'ok' | 'erro' | 'info' } | null;

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
const configurado = chave.startsWith('sb_publishable_') && !chave.includes('COLE_A_CHAVE');
const supabase: SupabaseClient | null = configurado ? createClient(url, chave) : null;

export default function App() {
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [conta, setConta] = useState<Conta | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#0c0d0c' : '#f4f6f2';
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch { /* Theme changes still work when browser storage is unavailable. */ }
  }, [theme]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) void loadAccount(session); else setConta(null); }, [session]);

  async function readError(response: Response): Promise<string> {
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object') {
        const detail = (body as { erro?: unknown; message?: unknown }).erro ?? (body as { message?: unknown }).message;
        if (typeof detail === 'string') return detail;
      }
    } catch { /* The API may return an empty response. */ }
    return `Erro HTTP ${response.status}`;
  }
  async function requestAccount(method: 'GET' | 'POST', token: string): Promise<Response> {
    return fetch(`${url}/functions/v1/corretora/conta`, { method, headers: { apikey: chave, Authorization: `Bearer ${token}` } });
  }
  async function loadAccount(currentSession: Session): Promise<void> {
    setLoadingAccount(true); setNotice(null);
    try {
      let response = await requestAccount('GET', currentSession.access_token);
      if (response.status === 404 && (await readError(response)).includes('Conta não encontrada')) response = await requestAccount('POST', currentSession.access_token);
      if (!response.ok) throw new Error(await readError(response));
      setConta(await response.json() as Conta);
    } catch (error) { setNotice({ text: `Login realizado, mas não foi possível carregar a conta: ${error instanceof Error ? error.message : 'erro inesperado'}`, kind: 'erro' }); }
    finally { setLoadingAccount(false); }
  }
  async function authenticate(values: { email: string; password: string }): Promise<void> {
    setNotice(null);
    try {
      const nextSession = await submitCredentials(supabase, mode, values, window.location.origin);
      if (nextSession) setSession(nextSession);
      else setNotice({ text: 'Cadastro enviado — confira sua caixa de entrada para confirmar o e-mail antes de entrar', kind: 'ok' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Não foi possível concluir o envio — tente novamente', kind: 'erro' });
    }
  }
  async function logout(): Promise<void> { if (!supabase) return; const { error } = await supabase.auth.signOut(); setNotice(error ? { text: error.message, kind: 'erro' } : { text: 'Você saiu da sua conta', kind: 'ok' }); }

  if (session) return <AccountHome key={session.user.id} theme={theme} session={session} conta={conta} loading={loadingAccount} notice={notice} onRefresh={() => void loadAccount(session)} onLogout={() => void logout()} />;
  const signingUp = mode === 'signup';
  return <SmokeLogin
    theme={theme}
    onThemeChange={setTheme}
    brand="tivvo"
    title={signingUp ? <>Comece pela ti<span className="text-[var(--accent)]">vv</span>o</> : <>Que bom ter você na ti<span className="text-[var(--accent)]">vv</span>o</>}
    subtitle={signingUp ? 'Crie sua conta para explorar investimentos simulados com saldo inicial zero' : 'Acesse sua conta para acompanhar saldo e investimentos simulados'}
    submitLabel={signingUp ? 'Criar conta' : 'Entrar'}
    mode={mode}
    disabled={!configurado}
    notice={!configurado ? { text: CONFIGURATION_NOTICE, kind: 'info' } : notice}
    onSubmit={authenticate}
    onSignUpClick={() => { setMode(signingUp ? 'login' : 'signup'); setNotice(null); }}
    footer="tivvo · Ambiente de demonstração · Valores e investimentos simulados"
  />;
}
