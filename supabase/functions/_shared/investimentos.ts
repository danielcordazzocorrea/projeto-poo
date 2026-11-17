import { Dinheiro, Quantidade, RegraDeNegocio, type TipoMoeda } from './dominio.ts';
import { buscarCotacoes, type Cotacoes } from './cotacoes.ts';

export type DirecaoTransferencia = 'PARA_INVESTIMENTOS' | 'PARA_PRINCIPAL';
export type ComprovanteCompra = {
  id: string;
  codigo_ativo: string;
  quantidade: string;
  preco_unitario: string;
  total_pago: string;
  cotacao_em: string | null;
  criada_em: string;
};
export type TransferenciaInvestimento = {
  id: string;
  direcao: DirecaoTransferencia;
  valor_origem: string;
  moeda_origem: TipoMoeda;
  valor_destino: string;
  moeda_destino: TipoMoeda;
  cotacao_em: string | null;
  criada_em?: string;
};
export type ContaInvestimento = {
  saldo: string;
  moeda: 'BRL';
  acoes_investidas: string;
  posicoes: Array<{ codigo_ativo: string; quantidade: string; preco_medio_compra?: string | null }>;
  transferencias: TransferenciaInvestimento[];
};

export interface RepositorioInvestimentos {
  consultarInvestimentos(): Promise<ContaInvestimento>;
  consultarMoedaPrincipal(): Promise<TipoMoeda>;
  transferirInvestimento(direcao: DirecaoTransferencia, centavos: bigint,
    moedaPrincipal: TipoMoeda, cotacoes: Cotacoes | null, requisicaoId: string): Promise<TransferenciaInvestimento>;
  comprarAtivo(codigo: string, quantidadeMicros: bigint, precoCentavos: bigint, requisicaoId: string, cotacaoEm: string | null): Promise<ComprovanteCompra>;
  venderAtivo(codigo: string, quantidadeMicros: bigint, precoCentavos: bigint, requisicaoId: string): Promise<void>;
}

export class Investimentos {
  constructor(private readonly repositorio: RepositorioInvestimentos,
    private readonly buscarTaxas: typeof buscarCotacoes = buscarCotacoes) {}

  consultarConta(): Promise<ContaInvestimento> {
    return this.repositorio.consultarInvestimentos();
  }

  async transferir(direcao: unknown, valor: unknown, requisicaoId: unknown) {
    if (direcao !== 'PARA_INVESTIMENTOS' && direcao !== 'PARA_PRINCIPAL') {
      throw new RegraDeNegocio('Direção da transferência inválida.');
    }
    if (typeof requisicaoId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requisicaoId)) {
      throw new RegraDeNegocio('Identificador da transferência inválido.');
    }
    const centavos = Dinheiro.positivo(valor).centavos;
    const moedaPrincipal = await this.repositorio.consultarMoedaPrincipal();
    const cotacoes = moedaPrincipal === 'BRL' ? null : await this.buscarTaxas();
    const comprovante = await this.repositorio.transferirInvestimento(
      direcao, centavos, moedaPrincipal, cotacoes, requisicaoId,
    );
    return { conta: await this.consultarConta(), comprovante };
  }

  async comprarAtivo(codigo: unknown, quantidade: unknown, preco: unknown, requisicaoId: unknown, cotacaoEm: string | null = null) {
    if (typeof codigo !== 'string' || !/^[A-Z]{4}[0-9]{1,2}$/.test(codigo)
      || typeof requisicaoId !== 'string' || !requisicaoId.trim()) {
      throw new RegraDeNegocio('Dados da compra inválidos.');
    }
    const comprovante = await this.repositorio.comprarAtivo(
      codigo, Quantidade.positiva(quantidade).micros, Dinheiro.positivo(preco).centavos, requisicaoId, cotacaoEm,
    );
    return { conta: await this.consultarConta(), comprovante };
  }

  async venderAtivo(codigo: unknown, quantidade: unknown, preco: unknown, requisicaoId: unknown) {
    if (typeof codigo !== 'string' || !/^[A-Z]{4}[0-9]{1,2}$/.test(codigo)
      || typeof requisicaoId !== 'string' || !requisicaoId.trim()
      ) {
      throw new RegraDeNegocio('Dados da venda inválidos.');
    }
    await this.repositorio.venderAtivo(
      codigo, Quantidade.positiva(quantidade).micros, Dinheiro.positivo(preco).centavos, requisicaoId,
    );
    return this.consultarConta();
  }
}
