import type { TipoMoeda } from '../supabase/functions/_shared/dominio.ts';
export type { TipoMoeda };

export const NOMES_MOEDAS: Record<TipoMoeda, string> = {
  BRL: 'Real', USD: 'Dólar', BTC: 'Bitcoin',
};
export type SaldoMoeda = { tipo_moeda: TipoMoeda; saldo: string };
export type Conta = {
  id: string;
  saldo_brl: string;
  chave_pix?: string;
  tipo_moeda?: TipoMoeda;
  saldos_moedas?: SaldoMoeda[];
};

// Formata o texto sem converter saldos BTC para ponto flutuante.
export function formatarMoeda(valor: string, moeda: TipoMoeda): string {
  const [inteiro = '0', fracao = ''] = valor.split('.');
  const casas = moeda === 'BTC' ? 8 : 2;
  const simbolo = moeda === 'BRL' ? 'R$' : moeda === 'USD' ? 'US$' : 'BTC';
  return `${simbolo} ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fracao.padEnd(casas, '0')}`;
}

export class ApiMoedas {
  constructor(private readonly url: string, private readonly chave: string,
    private readonly token: string, private readonly enviar: typeof fetch = fetch) {}

  private async chamar<T>(rota: string, metodo: string, corpo: unknown): Promise<T> {
    const response = await this.enviar(`${this.url}/functions/v1/corretora${rota}`, {
      method: metodo,
      headers: { apikey: this.chave, Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await response.json().catch(() => null);
    if (!response.ok) {
      const detalhe = dados?.erro ?? dados?.message;
      throw new Error(typeof detalhe === 'string' ? detalhe : `Erro HTTP ${response.status}`);
    }
    if (!dados) throw new Error('O servidor retornou uma resposta vazia.');
    return dados as T;
  }
  definirMoeda(tipo: TipoMoeda) {
    return this.chamar<Conta>('/conta/moeda', 'PATCH', { tipo_moeda: tipo });
  }
  simular(valor: string, tipo: TipoMoeda) {
    return this.chamar<SaldoMoeda>('/conversoes/simulacao', 'POST', { valor, tipo_moeda: tipo });
  }
  transferir(chaveDestino: string, valor: string) {
    return this.chamar<{ recebimento: SaldoMoeda; conta: Conta }>('/transferencias', 'POST', {
      chave_destino: chaveDestino, valor,
    });
  }
}
