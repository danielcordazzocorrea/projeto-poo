export type TipoMoeda = 'BRL' | 'USD' | 'EUR';
export type Conta = {
  id: string;
  saldo: string;
  saldo_brl: string | null;
  moeda_saldo: TipoMoeda;
};

export function formatarSaldo(valor: string, moeda: TipoMoeda): string {
  const [inteiro = '0', centavos = '00'] = valor.split('.');
  const simbolo = { BRL: 'R$', USD: 'US$', EUR: '€' }[moeda];
  return `${simbolo} ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos.padEnd(2, '0')}`;
}
