import { Ativo, Dinheiro, Posicao, Quantidade, RegraDeNegocio } from './dominio.ts';

/** Ordem validada: preços em centavos e quantidades em milionésimos. Sem HTTP ou banco. */
export class OrdemNegociacao {
  readonly quantidade: Quantidade;
  readonly preco: Dinheiro;
  readonly total: Dinheiro;
  constructor(readonly tipo: 'COMPRA' | 'VENDA', readonly codigo: string,
    quantidade: unknown, preco: unknown, readonly requisicaoId: string) {
    if (!/^[A-Z]{4}\d{1,2}$/.test(codigo) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requisicaoId)) {
      throw new RegraDeNegocio('Dados da negociação inválidos.');
    }
    this.quantidade = Quantidade.positiva(quantidade);
    this.preco = Dinheiro.positivo(preco);
    // A compra arredonda para cima; venda para baixo, como a transação no banco.
    this.total = this.preco.multiplicar(this.quantidade, tipo === 'COMPRA' ? 'cima' : 'baixo');
  }
  validarRepeticao(anterior: OrdemNegociacao): void {
    if (this.requisicaoId !== anterior.requisicaoId || this.tipo !== anterior.tipo || this.codigo !== anterior.codigo ||
        this.quantidade.micros !== anterior.quantidade.micros || this.preco.centavos !== anterior.preco.centavos) {
      throw new RegraDeNegocio('Identificador de negociação já utilizado com outros dados.');
    }
  }
}

/** Agregado de domínio imutável: uma falha nunca deixa saldo e posições parcialmente alterados. */
export class CarteiraInvestimentos {
  private readonly posicoes: ReadonlyMap<string, Posicao>;
  constructor(readonly saldo: Dinheiro, posicoes: readonly Posicao[] = []) {
    const mapa = new Map<string, Posicao>();
    for (const posicao of posicoes) {
      if (mapa.has(posicao.ativo.codigo)) throw new RegraDeNegocio('Posição duplicada na carteira.');
      mapa.set(posicao.ativo.codigo, posicao);
    }
    this.posicoes = mapa;
  }
  static reconstituir(dados: { saldo: string; posicoes: readonly { codigo_ativo: string; quantidade: string }[] }): CarteiraInvestimentos {
    // Reconstrução de saldo/quantidade permite zero, diferentemente da entrada de uma operação.
    const dinheiro = (valor: string) => {
      if (!/^\d+\.\d{2}$/.test(valor)) throw new RegraDeNegocio('Saldo da carteira inválido.');
      return Dinheiro.doBanco(valor.replace('.', ''));
    };
    return new CarteiraInvestimentos(dinheiro(dados.saldo), dados.posicoes.map(p =>
      new Posicao(new Ativo(p.codigo_ativo, p.codigo_ativo, 'ACAO', Dinheiro.zero()), Quantidade.positiva(p.quantidade))));
  }
  quantidade(codigo: string): Quantidade { return this.posicoes.get(codigo)?.quantidade ?? Quantidade.zero(); }
  executar(ordem: OrdemNegociacao): CarteiraInvestimentos {
    const atual = this.posicoes.get(ordem.codigo) ?? new Posicao(
      new Ativo(ordem.codigo, ordem.codigo, 'ACAO', ordem.preco), Quantidade.zero());
    const posicao = ordem.tipo === 'COMPRA' ? atual.comprar(ordem.quantidade) : atual.vender(ordem.quantidade);
    if (ordem.tipo === 'COMPRA' && !this.saldo.cobre(ordem.total)) {
      throw new RegraDeNegocio('Saldo insuficiente na conta de investimentos.');
    }
    const saldo = ordem.tipo === 'COMPRA' ? this.saldo.subtrair(ordem.total) : this.saldo.somar(ordem.total);
    const novas = new Map(this.posicoes);
    if (posicao.quantidade.micros === 0n) novas.delete(ordem.codigo);
    else novas.set(ordem.codigo, posicao);
    return new CarteiraInvestimentos(saldo, [...novas.values()]);
  }
  retirar(valor: Dinheiro): CarteiraInvestimentos {
    valor.exigirPositivo();
    if (!this.saldo.cobre(valor)) throw new RegraDeNegocio('Saldo insuficiente na conta de investimentos.');
    return new CarteiraInvestimentos(this.saldo.subtrair(valor), [...this.posicoes.values()]);
  }
  aportar(valor: Dinheiro): CarteiraInvestimentos {
    valor.exigirPositivo();
    return new CarteiraInvestimentos(this.saldo.somar(valor), [...this.posicoes.values()]);
  }
}
