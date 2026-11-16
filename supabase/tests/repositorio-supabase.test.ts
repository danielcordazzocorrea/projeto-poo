import assert from 'node:assert/strict';
import { RepositorioSupabase } from '../functions/_shared/repositorio-supabase.ts';

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

Deno.test('histórico consulta dez Pix e dez conversões separadamente', async () => {
  const pix = Array.from({ length: 10 }, (_, indice) => linhaMovimento(
    `pix-${indice}`, indice % 2 === 0 ? 'PIX_ENVIADO' : 'PIX_RECEBIDO', `2026-11-16T10:${String(indice).padStart(2, '0')}:00Z`,
  ));
  const conversoes = Array.from({ length: 10 }, (_, indice) => linhaMovimento(
    `conversao-${indice}`, 'CONVERSAO', `2026-11-16T11:${String(indice).padStart(2, '0')}:00Z`,
  ));
  const consultas: ConsultaFalsa[] = [];
  const banco = {
    from(tabela: string) {
      const consulta = new ConsultaFalsa(tabela, atual => {
        if (tabela === 'contas') return { data: { id: 'conta-1', usuario_id: 'usuario-1', saldo_centavos: 1000, moeda_saldo: 'BRL' }, error: null };
        if (tabela === 'posicoes' || tabela === 'ativos') return { data: [], error: null };
        if (tabela === 'chaves_pix') return { data: { chave: 'usuario@example.com' }, error: null };
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

  assert.equal(conta.movimentacoes.length, 20);
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
