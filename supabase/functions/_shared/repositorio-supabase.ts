// Apenas o tipo do cliente Supabase é necessário aqui; o objeto vem da Edge Function.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
// Classes do domínio usadas para converter linhas do banco em objetos.
import {
  Ativo, Conta, Dinheiro, FalhaDePersistencia, Movimentacao,
  NaoEncontrado, Posicao, Quantidade, RegraDeNegocio,
  type TipoAtivo, type TipoMovimentacao,
} from './dominio.ts';
// A classe abaixo promete cumprir o contrato que o serviço espera.
import type { RepositorioCorretora } from './servico.ts';

// Formato mínimo do erro que pode voltar de uma consulta Supabase.
type ErroBanco = { code?: string; message: string } | null;

// Traduz erros técnicos do banco em erros entendidos pela Edge Function.
function verificarErro(erro: ErroBanco): void {
  // `null` significa que a consulta terminou sem erro.
  if (!erro) return;
  // P0001 é o código usado pelos `raise exception` das funções SQL.
  if (erro.code === 'P0001') {
    // Mensagens de ausência viram HTTP 404 na camada de entrada.
    if (erro.message.includes('não encontrada') || erro.message.includes('não encontrado')) {
      throw new NaoEncontrado(erro.message);
    }
    // Outras regras recusadas pelo banco viram erro de negócio.
    throw new RegraDeNegocio(erro.message);
  }
  // Não expõe ao cliente detalhes inesperados de infraestrutura.
  throw new FalhaDePersistencia('Não foi possível acessar os dados da corretora.');
}

// Adaptador: implementa o contrato RepositorioCorretora usando Supabase.
export class RepositorioSupabase implements RepositorioCorretora {
  // O cliente recebido representa a sessão do usuário desta requisição.
  constructor(private readonly banco: SupabaseClient) {}

  // Lê o catálogo de ativos e devolve objetos da classe Ativo.
  async listarAtivos(): Promise<Ativo[]> {
    // SELECT escolhe as colunas necessárias; ORDER BY organiza pelo código.
    const { data, error } = await this.banco.from('ativos')
      .select('codigo,nome,tipo,preco_centavos').order('codigo');
    // Interrompe o fluxo se a consulta falhou.
    verificarErro(error);
    // `map` converte cada linha simples do banco em um objeto Ativo.
    return (data ?? []).map(row => new Ativo(
      // Cada propriedade vem de uma coluna; o preço vira objeto Dinheiro.
      row.codigo, row.nome, row.tipo as TipoAtivo, Dinheiro.doBanco(row.preco_centavos),
    ));
  }

  // Recupera uma conta ausente para um usuário antigo; o cadastro novo usa trigger.
  async abrirConta(): Promise<void> {
    // RPC chama uma função SQL, que usa auth.uid() para escolher o usuário.
    const { error } = await this.banco.rpc('abrir_conta');
    verificarErro(error);
  }

  // Reúne conta, carteira e histórico em um único objeto Conta.
  async consultarConta(): Promise<Conta> {
    // A política RLS do banco limita o SELECT à conta do usuário da sessão.
    const { data: conta, error: erroConta } = await this.banco.from('contas')
      .select('id,usuario_id,saldo_centavos').maybeSingle();
    verificarErro(erroConta);
    // A ausência da conta é diferente de falha de comunicação com o banco.
    if (!conta) throw new NaoEncontrado('Conta não encontrada. Abra uma conta primeiro.');

    // Faz três leituras independentes em paralelo para reduzir a espera.
    const [resultadoPosicoes, resultadoMovimentos, ativos] = await Promise.all([
      // Lê as quantidades dos ativos pertencentes à conta encontrada.
      this.banco.from('posicoes').select('ativo_codigo,quantidade_micros').eq('conta_id', conta.id),
      // Lê no máximo as 100 movimentações mais recentes da mesma conta.
      this.banco.from('movimentacoes')
        .select('id,tipo,valor_centavos,ativo_codigo,quantidade_micros,criada_em')
        .eq('conta_id', conta.id).order('criada_em', { ascending: false }).limit(100),
      // Busca os dados completos dos ativos usados para montar as posições.
      this.listarAtivos(),
    ]);
    // Cada consulta pode falhar separadamente; as duas respostas SQL são conferidas.
    verificarErro(resultadoPosicoes.error);
    verificarErro(resultadoMovimentos.error);
    // Map permite achar um Ativo pelo código sem percorrer a lista toda vez.
    const ativosPorCodigo = new Map(ativos.map(ativo => [ativo.codigo, ativo]));
    // Transforma cada linha de `posicoes` em um objeto Posicao.
    const posicoes = (resultadoPosicoes.data ?? []).map(row => {
      const ativo = ativosPorCodigo.get(row.ativo_codigo);
      // Uma posição com código desconhecido indica inconsistência de dados.
      if (!ativo) throw new FalhaDePersistencia('Posição contém ativo desconhecido.');
      return new Posicao(ativo, Quantidade.doBanco(row.quantidade_micros));
    });
    // Transforma cada linha do histórico em um objeto Movimentacao.
    const movimentos = (resultadoMovimentos.data ?? []).map(row => new Movimentacao(
      // A ordem dos argumentos acompanha o construtor de Movimentacao.
      row.id,
      row.tipo as TipoMovimentacao,
      Dinheiro.doBanco(row.valor_centavos),
      row.criada_em,
      row.ativo_codigo,
      // Depósitos têm quantidade nula; compras e vendas têm quantidade.
      row.quantidade_micros === null ? null : Quantidade.doBanco(row.quantidade_micros),
    ));
    // Composição: Conta recebe seu saldo, suas posições e suas movimentações.
    return new Conta(conta.id, conta.usuario_id, Dinheiro.doBanco(conta.saldo_centavos), posicoes, movimentos);
  }

  // Envia o depósito ao banco; a função SQL atualiza saldo e histórico junto.
  async depositar(centavos: bigint): Promise<void> {
    // A validação anterior garantiu que a conversão para Number é segura.
    const { error } = await this.banco.rpc('depositar', { p_valor_centavos: Number(centavos) });
    verificarErro(error);
  }

  // Compra o ativo identificado pelo código com quantidade em micros.
  async comprar(codigo: string, micros: bigint): Promise<void> {
    // A RPC verifica o saldo, desconta o custo e grava posição e histórico.
    const { error } = await this.banco.rpc('comprar', {
      // Nomes `p_*` correspondem aos parâmetros da função SQL.
      p_ativo_codigo: codigo,
      p_quantidade_micros: Number(micros),
    });
    verificarErro(error);
  }

  // Vende parte ou toda a posição do ativo.
  async vender(codigo: string, micros: bigint): Promise<void> {
    // A RPC verifica a posição, aumenta o saldo e registra a venda.
    const { error } = await this.banco.rpc('vender', {
      // A função SQL escolhe a conta usando auth.uid(), não um ID enviado aqui.
      p_ativo_codigo: codigo,
      p_quantidade_micros: Number(micros),
    });
    verificarErro(error);
  }
}
