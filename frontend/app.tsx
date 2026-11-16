import { useEffect, useRef, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AccountHome } from './account-home';
import { SmokeLogin } from '@/components/ui/smoke-login';
import { CONFIGURATION_NOTICE, submitCredentials } from './auth';
import { readSavedTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';
import { type Conta, type ConversionReceipt, type PixReceipt, type TipoMoeda } from './moeda';
import type { ContaInvestimento, DirecaoTransferencia, TransferenciaInvestimento } from './investment-account';
import { requestPixTransfer } from './pix-transfer';
import { requestCurrencyConversion } from './currency-conversion';
import { InvestmentTransferError, requestInvestmentTransfer } from './investment-transfer';
import { queryErrorNotice, readQueryResponse } from './query-errors';
import type { AccountErrorNotice } from './account-errors';

type Notice = { text: string; kind: 'ok' | 'erro' | 'info' } | null;

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
const configurado = chave.startsWith('sb_publishable_') && !chave.includes('COLE_A_CHAVE');
const supabase: SupabaseClient | null = configurado ? createClient(url, chave) : null;

export default function App() {
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [conta, setConta] = useState<Conta | null>(null);
  const [investimento, setInvestimento] = useState<ContaInvestimento | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [accountError, setAccountError] = useState<AccountErrorNotice | null>(null);
  const pendingInvestment = useRef<{ key: string; id: string } | null>(null);
  const pendingPurchase = useRef<{ key: string; id: string } | null>(null);
  const pendingSale = useRef<{ key: string; id: string } | null>(null);

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

  useEffect(() => { if (session) void loadAccount(session); else { setConta(null); setInvestimento(null); setAccountError(null); pendingInvestment.current = null; pendingPurchase.current = null; pendingSale.current = null; } }, [session]);

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
  async function requestInvestment(token: string): Promise<ContaInvestimento> {
    const response = await fetch(`${url}/functions/v1/corretora/investimentos/conta`, {
      headers: { apikey: chave, Authorization: `Bearer ${token}` },
    });
    return readQueryResponse<ContaInvestimento>(response, 'account');
  }
  async function transferInvestment(direcao: DirecaoTransferencia, valor: string): Promise<TransferenciaInvestimento> {
    if (!session) throw new Error('Entre na conta para transferir.');
    setLoadingAccount(true); setNotice(null);
    try {
      const key = `${session.user.id}:${direcao}:${valor}`;
      if (pendingInvestment.current?.key !== key) pendingInvestment.current = { key, id: crypto.randomUUID() };
      const result = await requestInvestmentTransfer({ url, apiKey: chave, token: session.access_token,
        direction: direcao, value: valor, requestId: pendingInvestment.current.id });
      setInvestimento(result.conta);
      const principal = await requestAccount('GET', session.access_token);
      if (!principal.ok) throw new Error(await readError(principal));
      setConta(await principal.json() as Conta);
      pendingInvestment.current = null;
      return result.comprovante;
    } catch (error) {
      // A later balance refresh can fail even after the transfer completed.
      throw error instanceof InvestmentTransferError ? error : new InvestmentTransferError(error, 'unconfirmed');
    } finally { setLoadingAccount(false); }
  }
  async function purchaseInvestment(codigoAtivo: string, quantidade: string): Promise<void> {
    if (!session) throw new Error('Entre na conta para comprar.');
    setLoadingAccount(true); setNotice(null);
    try {
      const key = `${session.user.id}:${codigoAtivo}:${quantidade}`;
      if (pendingPurchase.current?.key !== key) pendingPurchase.current = { key, id: crypto.randomUUID() };
      const response = await fetch(`${url}/functions/v1/corretora/investimentos/compras`, {
        method: 'POST',
        headers: { apikey: chave, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_ativo: codigoAtivo, quantidade, requisicao_id: pendingPurchase.current.id }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setInvestimento(await response.json() as ContaInvestimento);
      pendingPurchase.current = null;
    } catch (error) {
      setNotice({ text: `Não foi possível concluir a compra: ${error instanceof Error ? error.message : 'erro inesperado'}`, kind: 'erro' });
      throw error;
    } finally { setLoadingAccount(false); }
  }
  async function sellInvestment(codigoAtivo: string, quantidade: string): Promise<void> {
    if (!session) throw new Error('Entre na conta para vender.');
    setLoadingAccount(true); setNotice(null);
    try {
      const key = `${session.user.id}:${codigoAtivo}:${quantidade}`;
      if (pendingSale.current?.key !== key) pendingSale.current = { key, id: crypto.randomUUID() };
      const response = await fetch(`${url}/functions/v1/corretora/investimentos/vendas`, {
        method: 'POST',
        headers: { apikey: chave, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_ativo: codigoAtivo, quantidade, requisicao_id: pendingSale.current.id }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setInvestimento(await response.json() as ContaInvestimento);
      const principal = await requestAccount('GET', session.access_token);
      if (!principal.ok) throw new Error(await readError(principal));
      setConta(await principal.json() as Conta);
      pendingSale.current = null;
    } catch (error) {
      setNotice({ text: `Não foi possível concluir a venda: ${error instanceof Error ? error.message : 'erro inesperado'}`, kind: 'erro' });
      throw error;
    } finally { setLoadingAccount(false); }
  }
  async function convertBalance(moeda: TipoMoeda): Promise<ConversionReceipt> {
    if (!session) throw new Error('Entre na conta para converter o saldo.');
    setLoadingAccount(true); setNotice(null);
    try {
      const resultado = await requestCurrencyConversion({ url, apiKey: chave, token: session.access_token, currency: moeda });
      setConta(resultado.conta);
      return resultado;
    } finally { setLoadingAccount(false); }
  }
  async function transferPix(chaveDestino: string, valor: string): Promise<PixReceipt> {
    if (!session) throw new Error('Entre na conta para enviar um Pix.');
    setLoadingAccount(true); setNotice(null);
    try {
      const resultado = await requestPixTransfer({ url, apiKey: chave, token: session.access_token, key: chaveDestino, value: valor });
      setConta(resultado);
      const recebido = resultado.comprovante;
      return recebido ?? null;
    } finally { setLoadingAccount(false); }
  }
  async function loadAccount(currentSession: Session): Promise<void> {
    setLoadingAccount(true); setNotice(null); setAccountError(null);
    try {
      let response = await requestAccount('GET', currentSession.access_token);
      if (response.status === 404 && (await readError(response.clone())).includes('Conta não encontrada')) response = await requestAccount('POST', currentSession.access_token);
      setConta(await readQueryResponse<Conta>(response, 'account'));
      setInvestimento(await requestInvestment(currentSession.access_token));
    } catch (error) { setAccountError(queryErrorNotice(error, 'account')); }
    finally { setLoadingAccount(false); }
  }
  async function authenticate(values: { email: string; password: string; firstName?: string; lastName?: string; birthDate?: string; passwordConfirmation?: string }): Promise<void> {
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

  if (session) return <AccountHome key={session.user.id} theme={theme} onThemeChange={setTheme} session={session} conta={conta} investimento={investimento} loading={loadingAccount} notice={notice} accountError={accountError} onDismissAccountError={() => setAccountError(null)} onRefresh={() => void loadAccount(session)} onInvestmentRefresh={() => void loadAccount(session)} onPixTransfer={transferPix} onConvertBalance={convertBalance} onInvestmentTransfer={transferInvestment} onInvestmentPurchase={purchaseInvestment} onInvestmentSale={sellInvestment} onLogout={() => void logout()} />;
  const signingUp = mode === 'signup';
  return <SmokeLogin
    theme={theme}
    brand="tivvo"
    title={signingUp ? <>Comece pela ti<span className="text-[var(--accent)]">vv</span>o</> : <>Que bom ter você na ti<span className="text-[var(--accent)]">vv</span>o</>}
    subtitle={signingUp ? 'Crie sua conta para explorar investimentos simulados com saldo inicial zero' : ''}
    submitLabel={signingUp ? 'Criar conta' : 'Entrar'}
    mode={mode}
    disabled={!configurado}
    notice={!configurado ? { text: CONFIGURATION_NOTICE, kind: 'info' } : notice}
    onSubmit={authenticate}
    onSignUpClick={() => { setMode(signingUp ? 'login' : 'signup'); setNotice(null); }}
  />;
}
