import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  Ativo, Conta, Dinheiro, FalhaDePersistencia, Movimentacao,
  NaoEncontrado, Posicao, Quantidade, RegraDeNegocio,
  type TipoAtivo, type TipoMovimentacao,
} from './dominio.ts';
import type { RepositorioCorretora } from './servico.ts';

type ErroBanco = { code?: string; message: string } | null;

function verificarErro(erro: ErroBanco): void {
  if (!erro) return;
  if (erro.code === 'P0001') {
    if (erro.message.includes('não encontrada') || erro.message.includes('não encontrado')) {
      throw new NaoEncontrado(erro.message);
    }
    throw new RegraDeNegocio(erro.message);
  }
  throw new FalhaDePersistencia('Não foi possível acessar os dados da corretora.');
}

export class RepositorioSupabase implements RepositorioCorretora {
  constructor(private readonly banco: SupabaseClient) {}

  async listarAtivos(): Promise<Ativo[]> {
    const { data, error } = await this.banco.from('ativos')
      .select('codigo,nome,tipo,preco_centavos').order('codigo');
    verificarErro(error);
    return (data ?? []).map(row => new Ativo(
      row.codigo, row.nome, row.tipo as TipoAtivo, Dinheiro.doBanco(row.preco_centavos),
    ));
  }

  async abrirConta(): Promise<void> {
    const { error } = await this.banco.rpc('abrir_conta');
    verificarErro(error);
  }

  async consultarConta(): Promise<Conta> {
    const { data: conta, error: erroConta } = await this.banco.from('contas')
      .select('id,usuario_id,saldo_centavos').maybeSingle();
    verificarErro(erroConta);
    if (!conta) throw new NaoEncontrado('Conta não encontrada. Abra uma conta primeiro.');

    const [resultadoPosicoes, resultadoMovimentos, ativos] = await Promise.all([
      this.banco.from('posicoes').select('ativo_codigo,quantidade_micros').eq('conta_id', conta.id),
      this.banco.from('movimentacoes')
        .select('id,tipo,valor_centavos,ativo_codigo,quantidade_micros,criada_em')
        .eq('conta_id', conta.id).order('criada_em', { ascending: false }).limit(100),
      this.listarAtivos(),
    ]);
    verificarErro(resultadoPosicoes.error);
    verificarErro(resultadoMovimentos.error);
    const ativosPorCodigo = new Map(ativos.map(ativo => [ativo.codigo, ativo]));
    const posicoes = (resultadoPosicoes.data ?? []).map(row => {
      const ativo = ativosPorCodigo.get(row.ativo_codigo);
      if (!ativo) throw new FalhaDePersistencia('Posição contém ativo desconhecido.');
      return new Posicao(ativo, Quantidade.doBanco(row.quantidade_micros));
    });
    const movimentos = (resultadoMovimentos.data ?? []).map(row => new Movimentacao(
      row.id,
      row.tipo as TipoMovimentacao,
      Dinheiro.doBanco(row.valor_centavos),
      row.criada_em,
      row.ativo_codigo,
      row.quantidade_micros === null ? null : Quantidade.doBanco(row.quantidade_micros),
    ));
    return new Conta(conta.id, conta.usuario_id, Dinheiro.doBanco(conta.saldo_centavos), posicoes, movimentos);
  }

  async depositar(centavos: bigint): Promise<void> {
    const { error } = await this.banco.rpc('depositar', { p_valor_centavos: Number(centavos) });
    verificarErro(error);
  }

  async comprar(codigo: string, micros: bigint): Promise<void> {
    const { error } = await this.banco.rpc('comprar', {
      p_ativo_codigo: codigo,
      p_quantidade_micros: Number(micros),
    });
    verificarErro(error);
  }

  async vender(codigo: string, micros: bigint): Promise<void> {
    const { error } = await this.banco.rpc('vender', {
      p_ativo_codigo: codigo,
      p_quantidade_micros: Number(micros),
    });
    verificarErro(error);
  }
}
