import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { CONFIGURATION_NOTICE, submitCredentials } from '../frontend/auth.ts';

function clientWithFetch(fetch: typeof globalThis.fetch) {
  return createClient('https://signup-test.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

test('cadastro envia primeiro nome, e-mail e senha ao Supabase', async () => {
  let requests = 0;
  const client = clientWithFetch(async (input, init) => {
    requests++;
    const url = new URL(String(input));
    assert.equal(url.pathname, '/auth/v1/signup');
    assert.equal(url.searchParams.get('redirect_to'), 'https://corretora.example');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.email, 'aluno@example.com');
    assert.equal(body.password, 'senha-de-teste');
    assert.equal(body.data.first_name, 'João');
    assert.equal(body.data.last_name, 'Silva');
    assert.equal(body.data.birth_date, '2000-01-20');
    return Response.json({ user: { id: 'user-test', email: body.email }, session: null });
  });
  const session = await submitCredentials(client, 'signup', {
    email: ' aluno@example.com ', password: 'senha-de-teste', firstName: ' João ', lastName: ' Silva ', birthDate: '2000-01-20', passwordConfirmation: 'senha-de-teste',
  }, 'https://corretora.example');
  assert.equal(requests, 1);
  assert.equal(session, null, 'a confirmação por e-mail não precisa retornar uma sessão');
});

test('cadastro retorna a sessão quando a confirmação de e-mail está desativada', async () => {
  const client = clientWithFetch(async () => Response.json({
    access_token: 'test-access-token', refresh_token: 'test-refresh-token',
    expires_in: 3600, token_type: 'bearer', user: { id: 'user-test' },
  }));
  const session = await submitCredentials(client, 'signup', {
    email: 'aluno@example.com', password: 'senha-de-teste', firstName: 'João', lastName: 'Silva', birthDate: '2000-01-20', passwordConfirmation: 'senha-de-teste',
  }, 'https://corretora.example');
  assert.equal(session?.user.id, 'user-test');
});

test('configuração ausente gera erro em vez de ignorar o cadastro', async () => {
  await assert.rejects(submitCredentials(null, 'signup', {
    email: 'aluno@example.com', password: 'senha-de-teste',
  }, 'https://corretora.example'), { message: CONFIGURATION_NOTICE });
});

test('erro do Supabase é propagado para ser exibido no formulário', async () => {
  const client = clientWithFetch(async () => Response.json({
    msg: 'Signups not allowed for this instance',
  }, { status: 422 }));
  await assert.rejects(submitCredentials(client, 'signup', {
    email: 'aluno@example.com', password: 'senha-de-teste', firstName: 'João', lastName: 'Silva', birthDate: '2000-01-20', passwordConfirmation: 'senha-de-teste',
  }, 'https://corretora.example'), /Signups not allowed/);
});

test('cadastro rejeita nome ausente ou apenas espaços sem enviar ao Supabase', async () => {
  const client = clientWithFetch(async () => { assert.fail('Não deveria enviar o cadastro sem nome'); });
  for (const firstName of [undefined, '   ']) {
    await assert.rejects(submitCredentials(client, 'signup', {
      email: 'aluno@example.com', password: 'senha-de-teste', firstName, lastName: 'Silva', birthDate: '2000-01-20', passwordConfirmation: 'senha-de-teste',
    }, 'https://corretora.example'), /Informe seu primeiro nome/);
  }
});

test('login continua usando o endpoint de senha, sem criar outro usuário', async () => {
  const client = clientWithFetch(async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/auth/v1/token');
    assert.equal(url.searchParams.get('grant_type'), 'password');
    return Response.json({ msg: 'Invalid login credentials' }, { status: 400 });
  });
  await assert.rejects(submitCredentials(client, 'login', {
    email: 'aluno@example.com', password: 'senha-de-teste',
  }, 'https://corretora.example'), /E-mail ou senha incorretos/);
});

test('cadastro exige data válida e confirmação igual à senha', async () => {
  const client = clientWithFetch(async () => { assert.fail('Não deveria enviar cadastro inválido'); });
  await assert.rejects(submitCredentials(client, 'signup', {
    email: 'aluno@example.com', password: 'senha-de-teste', passwordConfirmation: 'outra-senha', firstName: 'João', lastName: 'Silva', birthDate: '2000-01-20',
  }, 'https://corretora.example'), /As senhas não conferem/);
  await assert.rejects(submitCredentials(client, 'signup', {
    email: 'aluno@example.com', password: 'senha-de-teste', passwordConfirmation: 'senha-de-teste', firstName: 'João', lastName: 'Silva', birthDate: '2000-02-31',
  }, 'https://corretora.example'), /Data de nascimento inválida\./);
});

test('cadastro só aceita idade entre 18 e 119 anos', async () => {
  const client = clientWithFetch(async () => { assert.fail('Não deveria enviar cadastro fora da faixa etária'); });
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  for (const [year, expectedMessage] of [
    [today.getFullYear() - 17, /Data de nascimento inválida, menor de 18 anos\./],
    [today.getFullYear() - 120, /Data de nascimento inválida\./],
  ] as const) {
    await assert.rejects(submitCredentials(client, 'signup', {
      email: 'aluno@example.com', password: 'senha-de-teste', passwordConfirmation: 'senha-de-teste', firstName: 'João', lastName: 'Silva', birthDate: `${year}-${month}-${day}`,
    }, 'https://corretora.example'), expectedMessage);
  }
});
