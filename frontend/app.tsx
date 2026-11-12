import { useEffect, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, LogOut, RefreshCw } from 'lucide-react';
import { SmokeLogin, type SmokeLoginProvider } from '@/components/ui/smoke-login';

type Conta = { id: string; saldo_brl: string };
type Notice = { text: string; kind: 'ok' | 'erro' | 'info' } | null;

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
const configurado = chave.startsWith('sb_publishable_') && !chave.includes('COLE_A_CHAVE');
const supabase: SupabaseClient | null = configurado ? createClient(url, chave) : null;

export default function App() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [conta, setConta] = useState<Conta | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [notice, setNotice] = useState<Notice>(configurado ? null : { text: 'Configure VITE_SUPABASE_PUBLISHABLE_KEY no .env.local para ativar o acesso.', kind: 'info' });

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
    return `Erro HTTP ${response.status}.`;
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
    if (!supabase) return;
    setNotice(null);
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email: values.email.trim(), password: values.password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
    if (result.error) { setNotice({ text: result.error.message, kind: 'erro' }); return; }
    if (result.data.session) setSession(result.data.session);
    else setNotice({ text: 'Cadastro enviado. Confirme o e-mail e depois entre com sua senha.', kind: 'ok' });
  }
  async function provider(providerName: SmokeLoginProvider): Promise<void> { setNotice({ text: `A autenticação com ${providerName === 'apple' ? 'Apple' : 'Google'} ainda não está configurada neste projeto.`, kind: 'info' }); }
  async function logout(): Promise<void> { if (!supabase) return; const { error } = await supabase.auth.signOut(); setNotice(error ? { text: error.message, kind: 'erro' } : { text: 'Você saiu da sua conta.', kind: 'ok' }); }

  if (session) return <Account session={session} conta={conta} loading={loadingAccount} notice={notice} onRefresh={() => void loadAccount(session)} onLogout={() => void logout()} />;
  const signingUp = mode === 'signup';
  return <SmokeLogin
    brand="Corretora POO"
    title={signingUp ? 'Crie sua conta' : 'Boas-vindas de volta'}
    subtitle={signingUp ? 'Seu cadastro cria uma conta simulada com saldo zero.' : 'Entre para consultar sua conta e seus ativos simulados.'}
    submitLabel={signingUp ? 'Criar conta' : 'Entrar'}
    onSubmit={authenticate}
    onProviderSignIn={provider}
    onSignUpClick={() => { setMode('signup'); setNotice(null); }}
    footer={<><span>{signingUp ? 'Já tem uma conta? ' : 'Projeto acadêmico · Ambiente de demonstração'}</span>{signingUp && <button type="button" onClick={() => { setMode('login'); setNotice(null); }} className="underline hover:text-[var(--ink)]">Entre</button>}{notice && <span className={`mt-3 block rounded-lg px-3 py-2 ${notice.kind === 'erro' ? 'bg-red-500/15 text-red-400' : notice.kind === 'ok' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--field)] text-[var(--muted)]'}`}>{notice.text}</span>}</>}
  />;
}

function Account({ session, conta, loading, notice, onRefresh, onLogout }: { session: Session; conta: Conta | null; loading: boolean; notice: Notice; onRefresh: () => void; onLogout: () => void }) {
  return <main className="grid min-h-dvh place-items-center bg-[#0c0d0c] p-4 font-sans text-[#ecede8]">
    <section className="w-full max-w-lg rounded-[28px] border border-[#262925] bg-[#121412] p-7 shadow-2xl sm:p-10">
      <div className="flex items-center gap-2 text-sm font-medium text-[#9dff3a]"><CheckCircle2 className="size-5" /> Conectado</div>
      <p className="mt-7 text-sm text-[#8d908a]">{session.user.email ?? 'Usuário autenticado'}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Minha conta</h1>
      <div className="mt-8 rounded-2xl border border-[#262925] bg-[#161816] p-6"><p className="text-xs font-medium uppercase tracking-wider text-[#8d908a]">Saldo simulado</p><p className="mt-2 text-4xl font-semibold tracking-[-.05em]">{loading ? 'Carregando...' : conta ? `R$ ${conta.saldo_brl}` : 'Indisponível'}</p></div>
      {conta && <p className="mt-4 break-all font-mono text-xs text-[#8d908a]">Conta: {conta.id}</p>}
      {notice && <p className={`mt-5 rounded-xl px-4 py-3 text-sm ${notice.kind === 'erro' ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{notice.text}</p>}
      <div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#3b403a] px-4 py-2.5 text-sm font-medium hover:border-[#9dff3a] disabled:opacity-60"><RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />Atualizar conta</button><button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-[#8d908a] hover:text-white"><LogOut className="size-4" />Sair</button></div>
    </section>
  </main>;
}
