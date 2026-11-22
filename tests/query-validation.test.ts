import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryError, readQueryResponse } from '../frontend/query-errors.ts';
import { validAccount, validInvestmentAccount, validInvestmentResult, validAssetSearch, validAssetQuote, validAssetHistory } from '../frontend/query-validation.ts';

const account = { id: 'account-test', saldo: '10.00', saldo_brl: null, moeda_saldo: 'USD', movimentacoes: [] };
const investment = { saldo: '0.00', acoes_investidas: '50.00', moeda: 'BRL', posicoes: [], transferencias: [] };
const asset = { codigo: 'PETR4', nome: 'Petrobras', tipo: 'ACAO' };
const search = { ativos: [asset], pagina: 1, tem_proxima: false };
const quote = { ...asset, preco_brl: '25.00', cotacao_em: null, consultado_em: '2026-11-16T15:00:00Z', fonte: 'brapi' };
const result = { investido: '50.00', valor_atual: '40.00', resultado: '-10.00', percentual: '-20.00',
  saldo_disponivel: '0.00', patrimonio_atual: '40.00', cotacao_em: null,
  consultado_em: '2026-11-16T15:00:00Z', ativos_sem_cotacao: [] };

test('aceita os dados das consultas, incluindo histórico vazio e horário de cotação ausente', () => {
  assert.ok(validAccount(account));
  assert.ok(validInvestmentAccount(investment));
  assert.ok(validInvestmentResult(result));
  assert.ok(validInvestmentResult({ ...result, valor_atual: null, resultado: null, percentual: null,
    patrimonio_atual: null, ativos_sem_cotacao: ['PETR4'] }));
  assert.ok(validAssetSearch(search));
  assert.ok(validAssetSearch({ ...search, ativos: [] }));
  assert.ok(validAssetQuote(quote));
});

test('rejeita campos incompletos e itens nulos que causariam falha na renderização', () => {
  for (const invalid of [null, [], {}, 'text']) {
    for (const validate of [validAccount, validInvestmentAccount, validInvestmentResult, validAssetSearch, validAssetQuote]) assert.equal(validate(invalid), false);
  }
  assert.equal(validAccount({ ...account, movimentacoes: [null] }), false);
  assert.equal(validAccount({ ...account, saldo: 10 }), false);
  assert.equal(validInvestmentAccount({ ...investment, posicoes: [{ codigo_ativo: 'PETR4' }] }), false);
  assert.equal(validInvestmentAccount({ ...investment, transferencias: [null] }), false);
  assert.equal(validAssetSearch({ ...search, ativos: [{ codigo: null }] }), false);
  assert.equal(validAssetQuote({ ...quote, preco_brl: 'not a price' }), false);
  assert.equal(validAssetQuote({ ...quote, cotacao_em: 'invalid' }), false);
  assert.equal(validInvestmentResult({ ...result, valor_atual: 'preço incorreto' }), false);
});

test('dados inválidos com HTTP 200 viram erro amigável de consulta', async () => {
  for (const [operation, validate] of [['account', validAccount], ['account', validInvestmentAccount],
    ['market', validAssetSearch], ['market', validAssetQuote]] as const) {
    await assert.rejects(readQueryResponse(Response.json({}), operation, validate), (error: unknown) => {
      assert.ok(error instanceof QueryError);
      assert.equal(error.notice.action, 'reload');
      return true;
    });
  }
});

test('preserva erro da API antes de validar o formato de sucesso', async () => {
  await assert.rejects(readQueryResponse(Response.json({ codigo: 'LIMITE_BRAPI' }, { status: 429 }), 'market', validAssetSearch), (error: unknown) => {
    assert.ok(error instanceof QueryError);
    assert.equal(error.notice.action, 'close');
    assert.equal(error.notice.title, 'Limite de consultas atingido');
    return true;
  });
});

test('aceita movimentos e transferências válidos em moedas diferentes', () => {
  assert.ok(validAccount({ ...account, movimentacoes: [{ id: 'movement', tipo: 'PIX_ENVIADO', valor: '5.00', moeda: 'USD',
    criada_em: '2026-11-16T15:00:00Z', moeda_destino: 'BRL', valor_destino: '25.00', contraparte_nome: 'Pessoa de teste' }] }));
  assert.ok(validInvestmentAccount({ ...investment, posicoes: [{ codigo_ativo: 'PETR4', quantidade: '1.123456' }],
    transferencias: [{ id: 'transfer', direcao: 'PARA_INVESTIMENTOS', valor_origem: '1.00', moeda_origem: 'USD',
      valor_destino: '5.00', moeda_destino: 'BRL', cotacao_em: null }] }));
});

test('histórico de um mês usa seu próprio contrato, sem exigir campos de cotação', async () => {
  const history = { codigo: 'PETR4', periodo: '1mo', intervalo: '1d', pontos: [{ data: '2026-11-16', preco_brl: '25.00' }], consultado_em: '2026-11-16T15:00:00Z', fonte: 'brapi' };
  assert.deepEqual(await readQueryResponse(Response.json(history), 'market', validAssetHistory), history);
  assert.equal(validAssetHistory({ ...history, pontos: [] }), true);
  for (const pontos of [[null], [{ data: 'invalid', preco_brl: '25.00' }], [{ data: '2026-11-16', preco_brl: '-1.00' }]]) {
    await assert.rejects(readQueryResponse(Response.json({ ...history, pontos }), 'market', validAssetHistory), QueryError);
  }
  assert.equal(validAssetHistory(quote), false);
});
