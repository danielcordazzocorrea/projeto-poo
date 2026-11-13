import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiMoedas, formatarMoeda } from '../frontend/moedas.ts';

test('frontend mantém centavos e satoshis na apresentação, inclusive em saldos altos', () => {
  assert.equal(formatarMoeda('1234.56', 'BRL'), 'R$ 1.234,56');
  assert.equal(formatarMoeda('20.00', 'USD'), 'US$ 20,00');
  assert.equal(formatarMoeda('0.00000001', 'BTC'), 'BTC 0,00000001');
  assert.equal(formatarMoeda('90071992.54740991', 'BTC'), 'BTC 90.071.992,54740991');
});

test('transferência envia valor BRL como texto autenticado e usa o recebimento confirmado pelo servidor', async () => {
  let chamadas = 0;
  const api = new ApiMoedas('https://teste.supabase.co', 'publica-teste', 'jwt-teste', async (input, init) => {
    chamadas++;
    assert.equal(String(input), 'https://teste.supabase.co/functions/v1/corretora/transferencias');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer jwt-teste');
    assert.equal(headers.get('apikey'), 'publica-teste');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), { chave_destino: 'amigo@example.com', valor: '100.00' });
    return Response.json({ recebimento: { tipo_moeda: 'BTC', saldo: '0.00033333' }, conta: { id: '1', saldo_brl: '50.00' } });
  });
  const resultado = await api.transferir('amigo@example.com', '100.00');
  assert.equal(resultado.conta.saldo_brl, '50.00');
  assert.equal(formatarMoeda(resultado.recebimento.saldo, resultado.recebimento.tipo_moeda), 'BTC 0,00033333');
  assert.equal(chamadas, 1);
});

test('escolha de moeda e simulação usam rotas próprias e não criam transferências', async () => {
  const rotas: string[] = [];
  const api = new ApiMoedas('https://teste.supabase.co', 'publica', 'jwt', async (input, init) => {
    const rota = new URL(String(input)).pathname;
    rotas.push(rota);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tipo_moeda, 'USD');
    if (rota.endsWith('/conta/moeda')) {
      assert.equal(init?.method, 'PATCH');
      return Response.json({ id: '1', saldo_brl: '100.00', tipo_moeda: 'USD' });
    }
    assert.equal(body.valor, '100.00');
    return Response.json({ tipo_moeda: 'USD', saldo: '20.00', simulada: true });
  });
  assert.equal((await api.definirMoeda('USD')).tipo_moeda, 'USD');
  assert.equal((await api.simular('100.00', 'USD')).saldo, '20.00');
  assert.deepEqual(rotas, ['/functions/v1/corretora/conta/moeda', '/functions/v1/corretora/conversoes/simulacao']);
});

test('erro no envio é exibível e não provoca reenvio automático', async () => {
  let chamadas = 0;
  const api = new ApiMoedas('https://teste.supabase.co', 'publica', 'jwt', async () => {
    chamadas++;
    return Response.json({ erro: 'Saldo insuficiente' }, { status: 400 });
  });
  await assert.rejects(api.transferir('amigo@example.com', '100.00'), /Saldo insuficiente/);
  assert.equal(chamadas, 1);
  const offline = new ApiMoedas('https://teste.supabase.co', 'publica', 'jwt', async () => {
    throw new Error('Falha de conexão');
  });
  await assert.rejects(offline.transferir('amigo@example.com', '100.00'), /Falha de conexão/);
});
