import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import './styles.css';

type Conta = { id: string; saldo_brl: string };

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
const configurado = chave.startsWith('sb_publishable_') && !chave.includes('COLE_A_CHAVE');
const supabase: SupabaseClient | null = configurado ? createClient(url, chave) : null;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Elemento #app não encontrado.');
app.innerHTML = `
  <main class="shell">
    <section class="intro" aria-labelledby="titulo">
      <div class="brand"><span class="brand-icon" aria-hidden="true">C</span> Corretora POO</div>
      <h1 id="titulo">Sua conta começa aqui.</h1>
      <p>Crie seu cadastro ou entre para consultar sua conta. Este projeto usa valores e ativos simulados.</p>
      <div class="flow" aria-label="Como funciona">
        <span>01 · Cadastro</span><span>02 · Confirmação do e-mail</span><span>03 · Conta disponível</span>
      </div>
    </section>
    <section class="card" aria-label="Acesso à corretora">
      <div id="auth-view">
        <div class="tabs" role="tablist" aria-label="Escolha a ação">
          <button id="login-tab" class="tab active" type="button" role="tab" aria-selected="true" aria-controls="auth-form">Entrar</button>
          <button id="signup-tab" class="tab" type="button" role="tab" aria-selected="false" aria-controls="auth-form">Criar conta</button>
        </div>
        <h2 id="form-title">Entre na sua conta</h2>
        <p class="helper" id="form-helper">Use o e-mail e a senha do seu cadastro.</p>
        <form id="auth-form" novalidate>
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="email" required placeholder="voce@exemplo.com">
          <label for="password">Senha</label>
          <input id="password" name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="Mínimo de 6 caracteres">
          <button id="submit-button" class="primary" type="submit">Entrar</button>
        </form>
      </div>
      <div id="account-view" hidden>
        <div class="account-heading"><span class="account-icon" aria-hidden="true">✓</span><span>Conectado</span></div>
        <h2>Minha conta</h2>
        <p class="helper" id="user-email"></p>
        <div class="balance"><span>Saldo simulado</span><strong id="balance-value">Carregando...</strong></div>
        <p class="account-id" id="account-id"></p>
        <div class="actions"><button class="secondary" id="retry-button" type="button">Atualizar conta</button><button class="text-button" id="logout-button" type="button">Sair</button></div>
      </div>
      <p id="notice" class="notice" role="status" aria-live="polite" hidden></p>
    </section>
  </main>
  <footer>Backend: Supabase Auth + Edge Function + Postgres · Ambiente de demonstração</footer>
`;

function elemento<T extends HTMLElement>(seletor: string): T {
  const encontrado = document.querySelector<T>(seletor);
  if (!encontrado) throw new Error(`Elemento ausente: ${seletor}`);
  return encontrado;
}

const authView = elemento<HTMLElement>('#auth-view');
const accountView = elemento<HTMLElement>('#account-view');
const notice = elemento<HTMLParagraphElement>('#notice');
const form = elemento<HTMLFormElement>('#auth-form');
const emailInput = elemento<HTMLInputElement>('#email');
const passwordInput = elemento<HTMLInputElement>('#password');
const submitButton = elemento<HTMLButtonElement>('#submit-button');
const loginTab = elemento<HTMLButtonElement>('#login-tab');
const signupTab = elemento<HTMLButtonElement>('#signup-tab');
let modo: 'login' | 'signup' = 'login';
let versaoSessao = 0;

function avisar(mensagem: string, tipo: 'ok' | 'erro' | 'info' = 'info'): void {
  notice.textContent = mensagem;
  notice.dataset.type = tipo;
  notice.hidden = false;
}
function limparAviso(): void { notice.hidden = true; notice.textContent = ''; }

function trocarModo(novoModo: 'login' | 'signup'): void {
  modo = novoModo;
  limparAviso();
  const cadastro = modo === 'signup';
  loginTab.classList.toggle('active', !cadastro);
  signupTab.classList.toggle('active', cadastro);
  loginTab.setAttribute('aria-selected', String(!cadastro));
  signupTab.setAttribute('aria-selected', String(cadastro));
  elemento<HTMLElement>('#form-title').textContent = cadastro ? 'Crie sua conta' : 'Entre na sua conta';
  elemento<HTMLElement>('#form-helper').textContent = cadastro
    ? 'O cadastro cria sua conta da corretora com saldo zero.'
    : 'Use o e-mail e a senha do seu cadastro.';
  passwordInput.autocomplete = cadastro ? 'new-password' : 'current-password';
  submitButton.textContent = cadastro ? 'Criar conta' : 'Entrar';
  if (!supabase) avisar('Configure VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local para ativar o cadastro.', 'info');
}

async function chamarConta(metodo: 'GET' | 'POST', token: string): Promise<Response> {
  return fetch(`${url}/functions/v1/corretora/conta`, {
    method: metodo,
    headers: { apikey: chave, Authorization: `Bearer ${token}` },
  });
}

async function lerErro(resposta: Response): Promise<string> {
  try {
    const dados: unknown = await resposta.json();
    if (dados && typeof dados === 'object') {
      const erro = (dados as { erro?: unknown; message?: unknown }).erro
        ?? (dados as { message?: unknown }).message;
      if (typeof erro === 'string') return erro;
    }
  } catch { /* Resposta sem JSON. */ }
  return `Erro HTTP ${resposta.status}.`;
}

async function carregarConta(sessao: Session, versao: number): Promise<void> {
  elemento<HTMLElement>('#balance-value').textContent = 'Carregando...';
  elemento<HTMLElement>('#account-id').textContent = '';
  try {
    let resposta = await chamarConta('GET', sessao.access_token);
    if (resposta.status === 404) {
      const erro = await lerErro(resposta);
      // Recupera usuários criados antes do trigger de cadastro automático.
      if (erro.includes('Conta não encontrada')) resposta = await chamarConta('POST', sessao.access_token);
      else throw new Error(erro);
    }
    if (!resposta.ok) throw new Error(await lerErro(resposta));
    const conta = await resposta.json() as Conta;
    if (versao !== versaoSessao) return;
    elemento<HTMLElement>('#balance-value').textContent = `R$ ${conta.saldo_brl}`;
    elemento<HTMLElement>('#account-id').textContent = `Conta: ${conta.id}`;
    limparAviso();
  } catch (erro) {
    if (versao !== versaoSessao) return;
    elemento<HTMLElement>('#balance-value').textContent = 'Indisponível';
    avisar(`Login realizado, mas não foi possível carregar a conta: ${erro instanceof Error ? erro.message : 'erro inesperado'}`, 'erro');
  }
}

async function mostrarSessao(sessao: Session | null): Promise<void> {
  const versao = ++versaoSessao;
  const logado = Boolean(sessao);
  authView.hidden = logado;
  accountView.hidden = !logado;
  if (!sessao) return;
  elemento<HTMLElement>('#user-email').textContent = sessao.user.email ?? 'Usuário autenticado';
  await carregarConta(sessao, versao);
}

loginTab.addEventListener('click', () => trocarModo('login'));
signupTab.addEventListener('click', () => trocarModo('signup'));
form.addEventListener('submit', async evento => {
  evento.preventDefault();
  if (!supabase || !form.reportValidity()) return;
  limparAviso();
  submitButton.disabled = true;
  submitButton.textContent = modo === 'signup' ? 'Criando conta...' : 'Entrando...';
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (modo === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.session) await mostrarSessao(data.session);
      else avisar('Cadastro enviado. Confirme o e-mail e depois entre com sua senha.', 'ok');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await mostrarSessao(data.session);
    }
  } catch (erro) {
    avisar(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.', 'erro');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = modo === 'signup' ? 'Criar conta' : 'Entrar';
  }
});

elemento<HTMLButtonElement>('#logout-button').addEventListener('click', async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) avisar(error.message, 'erro');
  else { await mostrarSessao(null); avisar('Você saiu da sua conta.', 'ok'); }
});
elemento<HTMLButtonElement>('#retry-button').addEventListener('click', async () => {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) await carregarConta(data.session, ++versaoSessao);
});

if (!supabase) {
  submitButton.disabled = true;
  avisar('Configure VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local para ativar o cadastro.', 'info');
} else {
  supabase.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => { void mostrarSessao(sessao); }, 0);
  });
  void supabase.auth.getSession().then(({ data }) => mostrarSessao(data.session));
}
