export type TipoMoeda = 'BRL' | 'USD' | 'EUR';
export type PixReceipt = { moeda_recebida: TipoMoeda; valor_recebido: string } | null;
export type TipoMovimentacao = 'DEPOSITO' | 'COMPRA' | 'VENDA' | 'PIX_ENVIADO' | 'PIX_RECEBIDO' | 'CONVERSAO';
export type Movimentacao = {
  id: string;
  tipo: TipoMovimentacao;
  valor: string;
  moeda: TipoMoeda;
  moeda_destino: TipoMoeda | null;
  valor_destino: string | null;
  cotacao_em: string | null;
  contraparte_nome: string | null;
  criada_em: string;
};
export type Conta = {
  id: string;
  saldo: string;
  saldo_brl: string | null;
  moeda_saldo: TipoMoeda;
  movimentacoes: Movimentacao[];
};

export type ConversionReceipt = {
  conta: Conta;
  cotacaoEm: string | null;
};

export function formatarSaldo(valor: string, moeda: TipoMoeda): string {
  const [inteiro = '0', centavos = '00'] = valor.split('.');
  const simbolo = { BRL: 'R$', USD: 'US$', EUR: '€' }[moeda];
  return `${simbolo} ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos.padEnd(2, '0')}`;
}
