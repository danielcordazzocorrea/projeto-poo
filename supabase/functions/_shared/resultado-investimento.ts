import { Dinheiro, Quantidade } from './dominio.ts';
import type { ContaInvestimento } from './investimentos.ts';
import type { MercadoBrapi } from './mercado-brapi.ts';

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

type Cotador = Pick<MercadoBrapi, 'cotar'>;

function centavosNaoNegativos(valor: string): bigint {
  return valor === '0.00' ? 0n : Dinheiro.positivo(valor).centavos;
}

function dinheiroAssinado(centavos: bigint): string {
  return `${centavos < 0n ? '-' : ''}${Dinheiro.doBanco((centavos < 0n ? -centavos : centavos).toString()).formatar()}`;
}

function percentualAssinado(resultado: bigint, investido: bigint): string | null {
  if (investido === 0n) return null;
  const centesimos = resultado * 10000n / investido;
  const absoluto = centesimos < 0n ? -centesimos : centesimos;
  return `${centesimos < 0n ? '-' : ''}${absoluto / 100n}.${String(absoluto % 100n).padStart(2, '0')}`;
}

export async function calcularResultadoInvestimento(conta: ContaInvestimento,
  cotador: Cotador, agora: () => Date = () => new Date()): Promise<ResultadoInvestimento> {
  const investido = centavosNaoNegativos(conta.acoes_investidas);
  const saldo = centavosNaoNegativos(conta.saldo);
  const base = { investido: Dinheiro.doBanco(investido.toString()).formatar(),
    saldo_disponivel: Dinheiro.doBanco(saldo.toString()).formatar(), consultado_em: agora().toISOString() };
  const cotacoes = await Promise.allSettled(conta.posicoes.map(posicao => cotador.cotar(posicao.codigo_ativo)));
  const indisponiveis = conta.posicoes.flatMap((posicao, indice) => cotacoes[indice]?.status === 'fulfilled' ? [] : [posicao.codigo_ativo]);
  if (indisponiveis.length) return { ...base, valor_atual: null, resultado: null, percentual: null,
    patrimonio_atual: null, cotacao_em: null, ativos_sem_cotacao: indisponiveis };

  let atual = 0n;
  const horarios: string[] = [];
  for (let indice = 0; indice < conta.posicoes.length; indice++) {
    const posicao = conta.posicoes[indice]!;
    const cotacao = (cotacoes[indice] as PromiseFulfilledResult<Awaited<ReturnType<Cotador['cotar']>>>).value;
    const preco = Dinheiro.positivo(cotacao.preco_brl).centavos;
    const quantidade = Quantidade.positiva(posicao.quantidade).micros;
    atual += (preco * quantidade + 500000n) / 1000000n;
    if (cotacao.cotacao_em) horarios.push(cotacao.cotacao_em);
  }
  const resultado = atual - investido;
  return { ...base, valor_atual: Dinheiro.doBanco(atual.toString()).formatar(),
    resultado: dinheiroAssinado(resultado), percentual: percentualAssinado(resultado, investido),
    patrimonio_atual: Dinheiro.doBanco((saldo + atual).toString()).formatar(),
    cotacao_em: horarios.length === conta.posicoes.length && horarios.length > 0 ? horarios.sort()[0]! : null,
    ativos_sem_cotacao: [] };
}

export function perguntaSobreResultado(texto: string): boolean {
  return /investiment|carteira|rendimento|rentabilid|lucro|preju[ií]zo|valor atual|quanto (?:que )?(?:eu )?(?:investi|tenho investido|tenho agora|tenho atualmente|tenho hoje)|patrim[oô]nio/i.test(texto);
}

export function resumirResultado(resultado: ResultadoInvestimento): string {
  const br = (valor: string) => valor.replace('.', ',');
  if (resultado.valor_atual === null) return `Você tem R$ ${br(resultado.investido)} aplicados em ativos e R$ ${br(resultado.saldo_disponivel)} disponíveis. Não consegui consultar a cotação de ${resultado.ativos_sem_cotacao.join(', ')}; por isso o valor atual e o resultado estão indisponíveis.`;
  return `Você tem R$ ${br(resultado.investido)} aplicados em ativos. O valor estimado atual desses ativos é R$ ${br(resultado.valor_atual)}, com resultado de ${resultado.resultado?.startsWith('-') ? '-' : '+'}R$ ${br(resultado.resultado?.replace(/^-/, '') ?? '0.00')} (${br(resultado.percentual ?? '0.00')}%). O saldo disponível é R$ ${br(resultado.saldo_disponivel)}, e o total estimado da conta é R$ ${br(resultado.patrimonio_atual ?? '0.00')}.`;
}
