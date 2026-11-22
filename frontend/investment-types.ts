import type { TipoMoeda } from './moeda.js';

export type DirecaoTransferencia = 'PARA_INVESTIMENTOS' | 'PARA_PRINCIPAL';
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

export type ResultadoInvestimento = {
  investido: string;
  valor_atual: string | null;
  resultado: string | null;
  percentual: string | null;
  saldo_disponivel: string;
  patrimonio_atual: string | null;
  cotacao_em: string | null;
  consultado_em: string;
  ativos_sem_cotacao: string[];
};

export type ComprovanteCompra = {
  id: string;
  codigo_ativo: string;
  quantidade: string;
  preco_unitario: string;
  total_pago: string;
  cotacao_em: string | null;
  criada_em: string;
};
export type ResultadoCompra = { conta: ContaInvestimento; comprovante: ComprovanteCompra };
