import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consultarHistoricoYahoo } from '../frontend/historico-cliente.ts';

const args = { url: 'https://projeto.supabase.co/', chave: 'publica', token: 'sessao', ticker: 'BBAS3', periodo: '6mo' as const, signal: new AbortController().signal };
const historico = { codigo: 'BBAS3', periodo: '6mo', intervalo: '1d', fonte: 'yahoo', consultado_em: '2026-11-17T12:00:00Z', pontos: [{ data: '2026-11-16', preco_brl: '20.00' }] };
test('cliente chama Edge Function Yahoo autenticada sem passar credenciais na URL', async () => {
  const resultado = await consultarHistoricoYahoo({ ...args, fetcher: async (input, init) => {
    assert.equal(String(input), 'https://projeto.supabase.co/functions/v1/yahoo-historico?ticker=BBAS3&periodo=6mo');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), 'publica'); assert.equal(headers.get('Authorization'), 'Bearer sessao');
    assert.equal(init?.signal, args.signal);
    return Response.json(historico);
  } });
  assert.deepEqual(resultado, historico);
});
test('modo local continua usando middleware e não consulta Supabase para histórico', async () => {
  await consultarHistoricoYahoo({ ...args, local: true, fetcher: async input => {
    assert.equal(input, '/api/yahoo-history?ticker=BBAS3&periodo=6mo'); return Response.json(historico);
  } });
});
test('cliente informa erros de sessão, serviço ausente, provedor e resposta não JSON', async () => {
  for (const [status, texto] of [[401, 'sessão expirou'], [404, 'não está disponível'], [502, 'falha Yahoo']] as const) {
    await assert.rejects(consultarHistoricoYahoo({ ...args, fetcher: async () => Response.json({ erro: 'falha Yahoo' }, { status }) }), new RegExp(texto));
  }
  await assert.rejects(consultarHistoricoYahoo({ ...args, fetcher: async () => new Response('<html>erro</html>') }), /resposta inválida/);
});
test('cliente rejeita dados de outro ativo, período, fonte ou preço inválido', async () => {
  for (const dados of [{ ...historico, codigo: 'VALE3' }, { ...historico, periodo: '1mo' }, { ...historico, fonte: 'brapi' }, { ...historico, pontos: [{ data: '2026-11-16', preco_brl: 'NaN' }] }]) {
    await assert.rejects(consultarHistoricoYahoo({ ...args, fetcher: async () => Response.json(dados) }), /incompatível/);
  }
});
