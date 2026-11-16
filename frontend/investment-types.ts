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
  posicoes: Array<{ codigo_ativo: string; quantidade: string }>;
  transferencias: TransferenciaInvestimento[];
};

