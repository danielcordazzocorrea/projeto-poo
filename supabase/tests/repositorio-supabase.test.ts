import assert from 'node:assert/strict';
import { RepositorioSupabase } from '../functions/_shared/repositorio-supabase.ts';
import { OrdemNegociacao } from '../functions/_shared/negociacao.ts';

type Resultado = { data: unknown; error: null };
type Chamada = [string, ...unknown[]];

class ConsultaFalsa implements PromiseLike<Resultado> {
  readonly chamadas: Chamada[] = [];

  constructor(readonly tabela: string, private readonly responder: (consulta: ConsultaFalsa) => Resultado) {}

  select(colunas: string): this { this.chamadas.push(['select', colunas]); return this; }
  eq(coluna: string, valor: unknown): this { this.chamadas.push(['eq', coluna, valor]); return this; }
  in(coluna: string, valores: unknown[]): this { this.chamadas.push(['in', coluna, valores]); return this; }
  order(coluna: string, opcoes?: unknown): this { this.chamadas.push(['order', coluna, opcoes]); return this; }
  limit(valor: number): this { this.chamadas.push(['limit', valor]); return this; }
  maybeSingle(): this { this.chamadas.push(['maybeSingle']); return this; }

  then<TResult1 = Resultado, TResult2 = never>(
    onfulfilled?: ((value: Resultado) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.responder(this)).then(onfulfilled, onrejected);
  }
}

function linhaMovimento(id: string, tipo: 'PIX_ENVIADO' | 'PIX_RECEBIDO' | 'CONVERSAO', criadaEm: string) {
  return {
    id, tipo, valor_centavos: 100, ativo_codigo: null, quantidade_micros: null,
    criada_em: criadaEm, moeda: 'BRL', moeda_destino: 'BRL', valor_destino_centavos: 100,
    cotacao_em: null, contraparte_nome: 'Pessoa Teste',
  };
}

Deno.test('repositório reconstitui ordem anterior no cliente com sessão e filtra o identificador', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  let existe = true;
  const consultas: ConsultaFalsa[] = [];
  const banco = { from(tabela: string) {
    const consulta = new ConsultaFalsa(tabela, () => ({ data: existe
      ? { ativo_codigo: 'PETR4', quantidade_micros: 500000, preco_centavos: 4443 } : null, error: null }));
    consultas.push(consulta); return consulta;
  } };
  const repositorio = new RepositorioSupabase(banco as never);
  for (const tipo of ['COMPRA', 'VENDA'] as const) {
    const ordem = await repositorio.consultarNegociacao(tipo, id);
    assert.ok(ordem instanceof OrdemNegociacao);
    assert.equal(ordem.tipo, tipo);
    assert.equal(ordem.total.formatar(), tipo === 'COMPRA' ? '22.22' : '22.21');
  }
  assert.deepEqual(consultas.map(c => c.tabela), ['compras_investimento', 'vendas_investimento']);
  for (const consulta of consultas) assert.deepEqual(consulta.chamadas.find(c => c[0] === 'eq'), ['eq', 'requisicao_id', id]);
  existe = false;
  assert.equal(await repositorio.consultarNegociacao('COMPRA', id), null);
});

Deno.test('histórico reúne dez registros de cada fonte e ordena compras, vendas, Pix e conversões', async () => {
  const pix = Array.from({ length: 10 }, (_, indice) => linhaMovimento(
    `pix-${indice}`, indice % 2 === 0 ? 'PIX_ENVIADO' : 'PIX_RECEBIDO', `2026-11-16T10:${String(indice).padStart(2, '0')}:00Z`,
  ));
  const conversoes = Array.from({ length: 10 }, (_, indice) => linhaMovimento(
    `conversao-${indice}`, 'CONVERSAO', `2026-11-16T11:${String(indice).padStart(2, '0')}:00Z`,
  ));
  const consultas: ConsultaFalsa[] = [];
  const compras = Array.from({ length: 10 }, (_, indice) => ({
    id: `compra-${indice}`, ativo_codigo: 'PETR4', quantidade_micros: 2000000, custo_centavos: 8886,
    criada_em: `2026-11-16T12:${String(indice).padStart(2, '0')}:00Z`, cotacao_em: null,
  }));
  const vendas = Array.from({ length: 10 }, (_, indice) => ({
    id: `venda-${indice}`, ativo_codigo: 'ITUB4', quantidade_micros: 500000, valor_centavos: 2056,
    criada_em: `2026-11-16T13:${String(indice).padStart(2, '0')}:00Z`,
  }));
  const banco = {
    from(tabela: string) {
      const consulta = new ConsultaFalsa(tabela, atual => {
        if (tabela === 'contas') return { data: { id: 'conta-1', usuario_id: 'usuario-1', saldo_centavos: 1000, moeda_saldo: 'BRL' }, error: null };
        if (tabela === 'posicoes' || tabela === 'ativos') return { data: [], error: null };
        if (tabela === 'chaves_pix') return { data: { chave: 'usuario@example.com' }, error: null };
        if (tabela === 'compras_investimento') return { data: compras, error: null };
        if (tabela === 'vendas_investimento') return { data: vendas, error: null };
        const consultaPix = atual.chamadas.some(chamada => chamada[0] === 'in' && chamada[1] === 'tipo');
        return { data: consultaPix ? pix : conversoes, error: null };
      });
      consultas.push(consulta);
      return consulta;
    },
  };

  const repositorio = new RepositorioSupabase(banco as never);
  const conta = await repositorio.consultarConta();
  const consultasMovimentos = consultas.filter(consulta => consulta.tabela === 'movimentacoes');

  assert.equal(conta.movimentacoes.length, 40);
  assert.equal(conta.movimentacoes[0].tipo, 'VENDA');
  assert.equal(conta.movimentacoes[0].valor.formatar(), '20.56');
  assert.equal(conta.movimentacoes[10].codigoAtivo, 'PETR4');
  assert.equal(conta.movimentacoes[10].quantidade?.formatar(), '2.000000');
  assert.equal(conta.movimentacoes[10].valor.formatar(), '88.86');
  for (const tabela of ['compras_investimento', 'vendas_investimento']) {
    const consulta = consultas.find(item => item.tabela === tabela)!;
    assert.deepEqual(consulta.chamadas.find(item => item[0] === 'eq'), ['eq', 'conta_principal_id', 'conta-1']);
    assert.deepEqual(consulta.chamadas.find(item => item[0] === 'limit'), ['limit', 10]);
  }
  assert.equal(consultasMovimentos.length, 2);
  assert.deepEqual(consultasMovimentos.map(consulta => consulta.chamadas.find(chamada => chamada[0] === 'limit')), [
    ['limit', 10], ['limit', 10],
  ]);
  assert.deepEqual(consultasMovimentos[0]?.chamadas.find(chamada => chamada[0] === 'in'), [
    'in', 'tipo', ['PIX_ENVIADO', 'PIX_RECEBIDO'],
  ]);
  assert.deepEqual(consultasMovimentos[1]?.chamadas.find(chamada => chamada[0] === 'eq' && chamada[1] === 'tipo'), [
    'eq', 'tipo', 'CONVERSAO',
  ]);
});
