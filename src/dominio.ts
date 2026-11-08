import { randomUUID } from 'node:crypto';

export class RegraDeNegocio extends Error {}
export class NaoEncontrado extends Error {}

// Dinheiro em centavos e quantidade em milionésimos, sem erros de ponto flutuante.
const ESCALA = 1_000_000n;

function decimalPositivo(valor: unknown, casas: number, campo: string): bigint {
  if (typeof valor !== 'string' || !/^\d+(\.\d+)?$/.test(valor)) {
    throw new RegraDeNegocio(`${campo} deve ser um número decimal positivo em texto.`);
  }
  const [inteiro = '', fracao = ''] = valor.split('.');
  if (fracao.length > casas || inteiro.length > 15) {
    throw new RegraDeNegocio(`${campo} aceita até ${casas} casas decimais e 15 dígitos inteiros.`);
  }
  const resultado = BigInt(inteiro) * 10n ** BigInt(casas) + BigInt(fracao.padEnd(casas, '0') || '0');
  if (resultado <= 0n) throw new RegraDeNegocio(`${campo} deve ser positivo.`);
  return resultado;
}

export const lerValor = (valor: unknown): bigint => decimalPositivo(valor, 2, 'valor');
export const lerQuantidade = (valor: unknown): bigint => decimalPositivo(valor, 6, 'quantidade');

export function formatarDecimal(valor: bigint, casas: number): string {
  const escala = 10n ** BigInt(casas);
  const inteiro = valor / escala;
  const fracao = (valor % escala).toString().padStart(casas, '0');
  return `${inteiro}.${fracao}`;
}

export class Cliente {
  readonly id = randomUUID();
  constructor(readonly nome: string) {
    if (!nome.trim()) throw new RegraDeNegocio('Informe o nome do cliente.');
    this.nome = nome.trim();
  }
}

export type TipoAtivo = 'ACAO' | 'MOEDA';

export class Ativo {
  constructor(
    readonly codigo: string,
    readonly nome: string,
    readonly tipo: TipoAtivo,
    readonly precoCentavos: bigint,
  ) {}
}

export interface Posicao {
  ativo: Ativo;
  quantidade: bigint;
}

export interface Movimentacao {
  id: string;
  tipo: 'DEPOSITO' | 'COMPRA' | 'VENDA';
  valorCentavos: bigint;
  codigoAtivo?: string;
  quantidade?: bigint;
}

export class Conta {
  readonly id = randomUUID();
  private saldoCentavos = 0n;
  private readonly posicoes = new Map<string, Posicao>();
  private readonly movimentacoes: Movimentacao[] = [];

  constructor(readonly clienteId: string) {}

  consultarSaldo(): bigint { return this.saldoCentavos; }
  consultarPosicoes(): Posicao[] { return [...this.posicoes.values()].map(p => ({ ...p })); }
  consultarMovimentacoes(): Movimentacao[] { return this.movimentacoes.map(m => ({ ...m })); }

  depositar(valorCentavos: bigint): void {
    this.saldoCentavos += valorCentavos;
    this.movimentacoes.push({ id: randomUUID(), tipo: 'DEPOSITO', valorCentavos });
  }

  comprar(ativo: Ativo, quantidade: bigint): void {
    const total = this.calcularTotal(ativo, quantidade);
    if (total > this.saldoCentavos) throw new RegraDeNegocio('Saldo insuficiente para a compra.');
    this.saldoCentavos -= total;
    const posicao = this.posicoes.get(ativo.codigo);
    if (posicao) posicao.quantidade += quantidade;
    else this.posicoes.set(ativo.codigo, { ativo, quantidade });
    this.movimentacoes.push({ id: randomUUID(), tipo: 'COMPRA', valorCentavos: total, codigoAtivo: ativo.codigo, quantidade });
  }

  vender(ativo: Ativo, quantidade: bigint): void {
    const posicao = this.posicoes.get(ativo.codigo);
    if (!posicao || posicao.quantidade < quantidade) {
      throw new RegraDeNegocio('Quantidade insuficiente para a venda.');
    }
    const total = this.calcularTotal(ativo, quantidade);
    posicao.quantidade -= quantidade;
    if (posicao.quantidade === 0n) this.posicoes.delete(ativo.codigo);
    this.saldoCentavos += total;
    this.movimentacoes.push({ id: randomUUID(), tipo: 'VENDA', valorCentavos: total, codigoAtivo: ativo.codigo, quantidade });
  }

  private calcularTotal(ativo: Ativo, quantidade: bigint): bigint {
    // Arredondamento de meio centavo para cima.
    const total = (ativo.precoCentavos * quantidade + ESCALA / 2n) / ESCALA;
    if (total < 1n) throw new RegraDeNegocio('O total da operação deve ser de pelo menos R$ 0,01.');
    return total;
  }
}
