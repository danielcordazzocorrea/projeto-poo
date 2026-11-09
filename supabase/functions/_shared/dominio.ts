/** Objetos de domínio compartilhados pelas Edge Functions. */

export class RegraDeNegocio extends Error {}
export class NaoEncontrado extends Error {}
export class FalhaDePersistencia extends Error {}

const MAXIMO_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);

function decimalPositivo(valor: unknown, casas: number, campo: string): bigint {
  if (typeof valor !== 'string' || !/^\d+(\.\d+)?$/.test(valor)) {
    throw new RegraDeNegocio(`${campo} deve ser um decimal positivo em texto.`);
  }
  const [inteiro = '', fracao = ''] = valor.split('.');
  if (fracao.length > casas || inteiro.length > 15) {
    throw new RegraDeNegocio(`${campo} aceita até ${casas} casas decimais.`);
  }
  const resultado = BigInt(inteiro) * 10n ** BigInt(casas)
    + BigInt(fracao.padEnd(casas, '0') || '0');
  if (resultado <= 0n || resultado > MAXIMO_SEGURO) {
    throw new RegraDeNegocio(`${campo} está fora do limite permitido.`);
  }
  return resultado;
}

function formatarDecimal(valor: bigint, casas: number): string {
  const escala = 10n ** BigInt(casas);
  return `${valor / escala}.${(valor % escala).toString().padStart(casas, '0')}`;
}

export function inteiroDoBanco(valor: unknown, campo: string): bigint {
  if ((typeof valor !== 'number' && typeof valor !== 'string')
    || !/^\d+$/.test(String(valor))) {
    throw new FalhaDePersistencia(`Valor inválido recebido do banco: ${campo}.`);
  }
  if (typeof valor === 'number' && !Number.isSafeInteger(valor)) {
    throw new FalhaDePersistencia(`Valor sem precisão recebido do banco: ${campo}.`);
  }
  const inteiro = BigInt(valor);
  if (inteiro > MAXIMO_SEGURO) {
    throw new FalhaDePersistencia(`Valor fora do limite recebido do banco: ${campo}.`);
  }
  return inteiro;
}

export class Dinheiro {
  private constructor(readonly centavos: bigint) {}
  static positivo(valor: unknown): Dinheiro {
    return new Dinheiro(decimalPositivo(valor, 2, 'valor'));
  }
  static doBanco(valor: unknown): Dinheiro {
    return new Dinheiro(inteiroDoBanco(valor, 'saldo/valor'));
  }
  formatar(): string { return formatarDecimal(this.centavos, 2); }
}

export class Quantidade {
  private constructor(readonly micros: bigint) {}
  static positiva(valor: unknown): Quantidade {
    return new Quantidade(decimalPositivo(valor, 6, 'quantidade'));
  }
  static doBanco(valor: unknown): Quantidade {
    return new Quantidade(inteiroDoBanco(valor, 'quantidade'));
  }
  formatar(): string { return formatarDecimal(this.micros, 6); }
}

export type TipoAtivo = 'ACAO' | 'MOEDA';

export class Ativo {
  constructor(
    readonly codigo: string,
    readonly nome: string,
    readonly tipo: TipoAtivo,
    readonly preco: Dinheiro,
  ) {}
  paraJson() {
    return { codigo: this.codigo, nome: this.nome, tipo: this.tipo, preco_brl: this.preco.formatar() };
  }
}

export class Posicao {
  constructor(readonly ativo: Ativo, readonly quantidade: Quantidade) {}
  paraJson() { return { ativo: this.ativo.paraJson(), quantidade: this.quantidade.formatar() }; }
}

export type TipoMovimentacao = 'DEPOSITO' | 'COMPRA' | 'VENDA';

export class Movimentacao {
  constructor(
    readonly id: string,
    readonly tipo: TipoMovimentacao,
    readonly valor: Dinheiro,
    readonly criadaEm: string,
    readonly codigoAtivo: string | null,
    readonly quantidade: Quantidade | null,
  ) {}
  paraJson() {
    return {
      id: this.id,
      tipo: this.tipo,
      valor_brl: this.valor.formatar(),
      criada_em: this.criadaEm,
      codigo_ativo: this.codigoAtivo,
      quantidade: this.quantidade?.formatar() ?? null,
    };
  }
}

export class Conta {
  constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly saldo: Dinheiro,
    readonly posicoes: Posicao[],
    readonly movimentacoes: Movimentacao[],
  ) {}
  paraJson() {
    return {
      id: this.id,
      usuario_id: this.usuarioId,
      saldo_brl: this.saldo.formatar(),
      posicoes: this.posicoes.map(p => p.paraJson()),
      movimentacoes: this.movimentacoes.map(m => m.paraJson()),
    };
  }
}
