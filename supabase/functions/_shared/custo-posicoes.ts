import { FalhaDePersistencia } from './dominio.ts';

export type OperacaoPosicao = {
  id: string;
  tipo: 'COMPRA' | 'VENDA';
  codigo: string;
  quantidade_micros: string | number;
  custo_centavos?: string | number;
  criada_em: string;
};

export function calcularCustoPosicoes(operacoes: OperacaoPosicao[]): Map<string, { quantidade: bigint; custo: bigint }> {
  const posicoes = new Map<string, { quantidade: bigint; custo: bigint }>();
  const ordenadas = [...operacoes].sort((a, b) => a.criada_em.localeCompare(b.criada_em) || a.id.localeCompare(b.id));
  for (const operacao of ordenadas) {
    const anterior = posicoes.get(operacao.codigo) ?? { quantidade: 0n, custo: 0n };
    const quantidade = BigInt(operacao.quantidade_micros);
    if (quantidade <= 0n) throw new FalhaDePersistencia('Quantidade de investimento inválida.');
    if (operacao.tipo === 'COMPRA') {
      const custo = BigInt(operacao.custo_centavos ?? 0);
      if (custo <= 0n) throw new FalhaDePersistencia('Custo de investimento inválido.');
      posicoes.set(operacao.codigo, { quantidade: anterior.quantidade + quantidade, custo: anterior.custo + custo });
    } else {
      if (quantidade > anterior.quantidade) throw new FalhaDePersistencia('Histórico de investimento inconsistente.');
      const remanescente = anterior.quantidade - quantidade;
      const custoRemovido = remanescente === 0n ? anterior.custo
        : (anterior.custo * quantidade + anterior.quantidade / 2n) / anterior.quantidade;
      posicoes.set(operacao.codigo, { quantidade: remanescente,
        custo: remanescente === 0n ? 0n : anterior.custo - custoRemovido });
    }
  }
  return posicoes;
}
