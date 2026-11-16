// Apenas o tipo do cliente Supabase é necessário aqui; o objeto vem da Edge Function.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
// Classes do domínio usadas para converter linhas do banco em objetos.
import {
  Ativo, Conta, Dinheiro, FalhaDePersistencia, Movimentacao,
  NaoEncontrado, Posicao, Quantidade, RegraDeNegocio,
  validarTipoMoeda,
  type TipoAtivo, type TipoMovimentacao, type TipoMoeda,
} from './dominio.ts';
import type { Cotacoes } from './cotacoes.ts';
// A classe abaixo promete cumprir o contrato que o serviço espera.
import type { RepositorioCorretora } from './servico.ts';
import type { ContaInvestimento, DirecaoTransferencia, RepositorioInvestimentos, TransferenciaInvestimento } from './investimentos.ts';

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
export class RepositorioSupabase implements RepositorioCorretora, RepositorioInvestimentos {
  // O cliente recebido representa a sessão do usuário desta requisição.
  constructor(private readonly banco: SupabaseClient,
    private readonly admin?: SupabaseClient, private readonly usuarioId?: string) {}

  private servico() {
    if (!this.admin || !this.usuarioId) throw new FalhaDePersistencia('Serviço de câmbio não configurado.');
    return { banco: this.admin, usuarioId: this.usuarioId };
  }

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
      .select('id,usuario_id,saldo_centavos,moeda_saldo').maybeSingle();
    verificarErro(erroConta);
    // A ausência da conta é diferente de falha de comunicação com o banco.
    if (!conta) throw new NaoEncontrado('Conta não encontrada. Abra uma conta primeiro.');

    // Faz quatro leituras independentes em paralelo para reduzir a espera.
    const [resultadoPosicoes, resultadoMovimentos, ativos, resultadoChavePix] = await Promise.all([
      // Lê as quantidades dos ativos pertencentes à conta encontrada.
      this.banco.from('posicoes').select('ativo_codigo,quantidade_micros').eq('conta_id', conta.id),
      // A tela mostra as dez transações de moeda e Pix mais recentes.
      this.banco.from('movimentacoes')
        .select('id,tipo,valor_centavos,ativo_codigo,quantidade_micros,criada_em,moeda,moeda_destino,valor_destino_centavos,cotacao_em,contraparte_nome')
        .eq('conta_id', conta.id).in('tipo', ['CONVERSAO', 'PIX_ENVIADO', 'PIX_RECEBIDO']).order('criada_em', { ascending: false }).limit(10),
      // Busca os dados completos dos ativos usados para montar as posições.
      this.listarAtivos(),
      // A RLS permite ler somente a chave pertencente ao usuário da sessão.
      this.banco.from('chaves_pix').select('chave').maybeSingle(),
    ]);
    // Cada consulta pode falhar separadamente; as duas respostas SQL são conferidas.
    verificarErro(resultadoPosicoes.error);
    verificarErro(resultadoMovimentos.error);
    verificarErro(resultadoChavePix.error);
    if (!resultadoChavePix.data?.chave) {
      throw new FalhaDePersistencia('Chave Pix não encontrada para esta conta.');
    }
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
      validarTipoMoeda(row.moeda),
      row.moeda_destino === null ? null : validarTipoMoeda(row.moeda_destino),
      row.valor_destino_centavos === null ? null : Dinheiro.doBanco(row.valor_destino_centavos),
      row.cotacao_em,
      row.contraparte_nome,
    ));
    // Composição: Conta recebe seu saldo, suas posições e suas movimentações.
    return new Conta(
      conta.id,
      conta.usuario_id,
      Dinheiro.doBanco(conta.saldo_centavos),
      resultadoChavePix.data.chave,
      posicoes,
      movimentos,
      validarTipoMoeda(conta.moeda_saldo),
    );
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

  async consultarMoedaDestinoPix(chaveDestino: string): Promise<TipoMoeda> {
    const { banco } = this.servico();
    const { data: chave, error: erroChave } = await banco.from('chaves_pix')
      .select('usuario_id').eq('chave', chaveDestino).maybeSingle();
    verificarErro(erroChave);
    if (!chave) throw new NaoEncontrado('Conta de destino não encontrada.');
    const { data: conta, error: erroConta } = await banco.from('contas')
      .select('moeda_saldo').eq('usuario_id', chave.usuario_id).maybeSingle();
    verificarErro(erroConta);
    if (!conta) throw new NaoEncontrado('Conta de destino não encontrada.');
    return validarTipoMoeda(conta.moeda_saldo);
  }

  async converterSaldo(destino: TipoMoeda, origem: TipoMoeda, cotacoes: Cotacoes | null): Promise<{ cotacao_em: string | null }> {
    const { banco, usuarioId } = this.servico();
    const { data, error } = await banco.rpc('converter_saldo', {
      p_usuario_id: usuarioId, p_moeda_destino: destino,
      p_moeda_origem: origem, p_cotacoes: cotacoes ?? {},
    });
    verificarErro(error);
    if (!data) throw new FalhaDePersistencia('Conversão sem comprovante.');
    return { cotacao_em: data.cotacao_em ?? null };
  }

  async transferirPix(chaveDestino: string, centavos: bigint, origem: TipoMoeda,
    destino: TipoMoeda, cotacoes: Cotacoes | null): Promise<{ moeda_recebida: TipoMoeda; valor_recebido: string; cotacao_em: string | null }> {
    const { banco, usuarioId } = this.servico();
    const { data, error } = await banco.rpc('transferir_pix_convertido', {
      p_usuario_id: usuarioId,
      p_chave_destino: chaveDestino,
      p_valor_centavos: Number(centavos),
      p_moeda_origem: origem, p_moeda_destino: destino, p_cotacoes: cotacoes ?? {},
    });
    verificarErro(error);
    if (!data) throw new FalhaDePersistencia('Pix sem comprovante.');
    return { moeda_recebida: validarTipoMoeda(data.moeda_recebida),
      valor_recebido: Dinheiro.doBanco(data.valor_recebido_centavos).formatar(),
      cotacao_em: data.cotacao_em ?? null };
  }

  async consultarMoedaPrincipal(): Promise<TipoMoeda> {
    const { data, error } = await this.banco.from('contas').select('moeda_saldo').maybeSingle();
    verificarErro(error);
    if (!data) throw new NaoEncontrado('Conta não encontrada.');
    return validarTipoMoeda(data.moeda_saldo);
  }

  async consultarInvestimentos(): Promise<ContaInvestimento> {
    const { data: principal, error: erroPrincipal } = await this.banco.from('contas').select('id').maybeSingle();
    verificarErro(erroPrincipal);
    if (!principal) throw new NaoEncontrado('Conta não encontrada.');
    const [conta, posicoes, movimentos] = await Promise.all([
      this.banco.from('contas_investimento').select('saldo_centavos')
        .eq('conta_principal_id', principal.id).maybeSingle(),
      this.banco.from('posicoes_investimento').select('ativo_codigo,quantidade_micros')
        .eq('conta_principal_id', principal.id).order('ativo_codigo'),
      this.banco.from('transferencias_investimento')
        .select('id,direcao,valor_origem_centavos,moeda_origem,valor_destino_centavos,moeda_destino,cotacao_em,criada_em')
        .eq('conta_principal_id', principal.id).order('criada_em', { ascending: false }).limit(50),
    ]);
    verificarErro(conta.error);
    verificarErro(posicoes.error);
    verificarErro(movimentos.error);
    if (!conta.data) throw new NaoEncontrado('Conta de investimentos não encontrada.');
    return {
      saldo: Dinheiro.doBanco(conta.data.saldo_centavos).formatar(), moeda: 'BRL',
      posicoes: (posicoes.data ?? []).map(row => ({
        codigo_ativo: row.ativo_codigo,
        quantidade: Quantidade.doBanco(row.quantidade_micros).formatar(),
      })),
      transferencias: (movimentos.data ?? []).map(row => ({
        id: row.id,
        direcao: row.direcao as DirecaoTransferencia,
        valor_origem: Dinheiro.doBanco(row.valor_origem_centavos).formatar(),
        moeda_origem: validarTipoMoeda(row.moeda_origem),
        valor_destino: Dinheiro.doBanco(row.valor_destino_centavos).formatar(),
        moeda_destino: validarTipoMoeda(row.moeda_destino),
        cotacao_em: row.cotacao_em,
        criada_em: row.criada_em,
      })),
    };
  }

  async transferirInvestimento(direcao: DirecaoTransferencia, centavos: bigint,
    moedaPrincipal: TipoMoeda, cotacoes: Cotacoes | null, requisicaoId: string): Promise<TransferenciaInvestimento> {
    const { banco, usuarioId } = this.servico();
    const { data, error } = await banco.rpc('transferir_conta_investimento', {
      p_usuario_id: usuarioId,
      p_direcao: direcao,
      p_valor_centavos: Number(centavos),
      p_moeda_principal: moedaPrincipal,
      p_cotacoes: cotacoes ?? {},
      p_requisicao_id: requisicaoId,
    });
    verificarErro(error);
    if (!data) throw new FalhaDePersistencia('Transferência sem comprovante.');
    return {
      id: data.id,
      direcao: data.direcao,
      valor_origem: Dinheiro.doBanco(data.valor_origem_centavos).formatar(),
      moeda_origem: validarTipoMoeda(data.moeda_origem),
      valor_destino: Dinheiro.doBanco(data.valor_destino_centavos).formatar(),
      moeda_destino: validarTipoMoeda(data.moeda_destino),
      cotacao_em: data.cotacao_em ?? null,
    };
  }
}
