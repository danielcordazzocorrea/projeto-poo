import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { FalhaDePersistencia, RegraDeNegocio } from './dominio.ts';

export type TipoFiltro = 'TODOS' | 'PIX' | 'PIX_ENVIADO' | 'PIX_RECEBIDO' | 'TRANSFERENCIA' | 'COMPRA' | 'VENDA' | 'CONVERSAO' | 'DEPOSITO';
export type FiltroHistorico = { inicio: string; fim: string; tipo: TipoFiltro; limite: number };
export type Registro = { tipo: string; valor: bigint; moeda: string; data: string; contraparte?: string | null;
  destino?: bigint | null; moedaDestino?: string | null; codigo?: string | null; quantidade?: string | null;
  direcao?: string | null };

const zona = 'America/Sao_Paulo';
const diaMs = 86400000;

export function validarFiltroHistorico(dados: Record<string, unknown>): FiltroHistorico {
  const inicio = dados.inicio;
  const fim = dados.fim;
  const tipo = dados.tipo;
  const limite = dados.limite;
  const dataValida = (valor: unknown): valor is string => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const data = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  };
  if (!dataValida(inicio) || !dataValida(fim) || fim < inicio
    || (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / diaMs > 366
    || !['TODOS', 'PIX', 'PIX_ENVIADO', 'PIX_RECEBIDO', 'TRANSFERENCIA', 'COMPRA', 'VENDA', 'CONVERSAO', 'DEPOSITO'].includes(String(tipo))
    || typeof limite !== 'number' || !Number.isInteger(limite) || limite < 1 || limite > 20) {
    throw new RegraDeNegocio('Informe um período válido de até 12 meses e até 20 lançamentos.');
  }
  return { inicio, fim, tipo: tipo as TipoFiltro, limite };
}

// Converte meia-noite em São Paulo para UTC usando a zona IANA, inclusive em datas com mudança de horário.
export function inicioDoDiaEmSaoPaulo(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const alvo = Date.UTC(ano!, mes! - 1, dia!);
  let instante = alvo + 3 * 3600000;
  const formato = new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const partes = Object.fromEntries(formato.formatToParts(new Date(instante)).map(p => [p.type, p.value]));
    const local = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day),
      Number(partes.hour), Number(partes.minute), Number(partes.second));
    instante += alvo - local;
  }
  return new Date(instante).toISOString();
}

function proximoDia(data: string): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + diaMs).toISOString().slice(0, 10);
}

export function dinheiro(centavos: bigint, moeda: string): string {
  const simbolo = moeda === 'USD' ? 'US$' : moeda === 'EUR' ? '€' : 'R$';
  const inteiro = (centavos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${simbolo} ${inteiro},${(centavos % 100n).toString().padStart(2, '0')}`;
}

function dataHora(valor: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: zona, dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

function linha(registro: Registro): string {
  const valor = dinheiro(registro.valor, registro.moeda);
  const pessoa = registro.contraparte?.trim() || 'pessoa não identificada';
  const detalhe = registro.tipo === 'PIX_ENVIADO' ? `Pix enviado de ${valor} para ${pessoa}`
    : registro.tipo === 'PIX_RECEBIDO' ? `Pix recebido de ${pessoa}: ${valor}`
    : registro.tipo === 'TRANSFERENCIA' ? `Transferência ${registro.direcao === 'PARA_INVESTIMENTOS' ? 'da conta principal para investimentos' : 'de investimentos para a conta principal'}: ${valor}${registro.destino !== null && registro.destino !== undefined && registro.moedaDestino ? ` → ${dinheiro(registro.destino, registro.moedaDestino)}` : ''}`
    : registro.tipo === 'CONVERSAO' ? `Conversão: ${valor}${registro.destino !== null && registro.destino !== undefined && registro.moedaDestino ? ` → ${dinheiro(registro.destino, registro.moedaDestino)}` : ''}`
    : registro.tipo === 'COMPRA' || registro.tipo === 'VENDA' ? `${registro.tipo === 'COMPRA' ? 'Compra' : 'Venda'} de ${registro.codigo ?? 'ativo'}${registro.quantidade ? ` (${registro.quantidade} unidades)` : ''}: ${valor}`
    : `Depósito: ${valor}`;
  return `• ${dataHora(registro.data)} — ${detalhe}.`;
}

export function formatarRegistrosRecentes(conta: { movimentacoes: Array<{ tipo: string; valor: string; moeda: string;
  moeda_destino?: string | null; valor_destino?: string | null; contraparte_nome?: string | null;
  criada_em: string; codigo_ativo?: string | null; quantidade?: string | null }> },
  investimento: { transferencias: Array<{ direcao: string; valor_origem: string; moeda_origem: string;
    valor_destino: string; moeda_destino: string; criada_em?: string }> }): string[] {
  const parse = (valor: string) => BigInt(valor.replace('.', ''));
  const registros: Registro[] = [
    ...conta.movimentacoes.map(item => ({ tipo: item.tipo, valor: parse(item.valor), moeda: item.moeda,
      data: item.criada_em, contraparte: item.contraparte_nome, codigo: item.codigo_ativo,
      quantidade: item.quantidade, destino: item.valor_destino ? parse(item.valor_destino) : null,
      moedaDestino: item.moeda_destino })),
    ...investimento.transferencias.filter(item => item.criada_em).map(item => ({ tipo: 'TRANSFERENCIA',
      valor: parse(item.valor_origem), moeda: item.moeda_origem, data: item.criada_em!,
      destino: parse(item.valor_destino), moedaDestino: item.moeda_destino, direcao: item.direcao })),
  ];
  return registros.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 20).map(linha);
}

function corresponde(tipo: TipoFiltro, registro: Registro): boolean {
  return tipo === 'TODOS' || tipo === registro.tipo || tipo === 'PIX' && registro.tipo.startsWith('PIX_');
}

export function resumirHistorico(registros: Registro[], filtro: FiltroHistorico, incompleto = false): string {
  const selecionados = registros.filter(registro => corresponde(filtro.tipo, registro))
    .sort((a, b) => b.data.localeCompare(a.data));
  const periodo = `${filtro.inicio.slice(8, 10)}/${filtro.inicio.slice(5, 7)}/${filtro.inicio.slice(0, 4)} a ${filtro.fim.slice(8, 10)}/${filtro.fim.slice(5, 7)}/${filtro.fim.slice(0, 4)}`;
  if (!selecionados.length) return `Não encontrei transações desse tipo no período de ${periodo}.`;
  const totais = new Map<string, bigint>();
  for (const item of selecionados) {
    const chave = `${item.tipo}|${item.moeda}`;
    totais.set(chave, (totais.get(chave) ?? 0n) + item.valor);
  }
  const resumo = [...totais].map(([chave, valor]) => {
    const [tipo, moeda] = chave.split('|');
    const rotulo = { PIX_ENVIADO: 'Pix enviados', PIX_RECEBIDO: 'Pix recebidos',
      TRANSFERENCIA: 'Transferências entre contas', COMPRA: 'Compras', VENDA: 'Vendas',
      CONVERSAO: 'Conversões', DEPOSITO: 'Depósitos' }[tipo!] ?? tipo;
    return `${rotulo}: ${dinheiro(valor, moeda!)}`;
  }).join(' · ');
  const cabecalho = `De ${periodo}, encontrei ${selecionados.length} transação(ões). ${incompleto ? 'Há mais registros; reduza o período para obter totais completos.' : resumo}`;
  return `${cabecalho}\n${selecionados.slice(0, filtro.limite).map(linha).join('\n')}`;
}

export async function consultarHistoricoPeriodo(banco: SupabaseClient, contaId: string,
  filtro: FiltroHistorico): Promise<string> {
  const inicio = inicioDoDiaEmSaoPaulo(filtro.inicio);
  const fim = inicioDoDiaEmSaoPaulo(proximoDia(filtro.fim));
  const limiteFonte = 1000;
  const [movimentos, transferencias, compras, vendas] = await Promise.all([
    banco.from('movimentacoes').select('tipo,valor_centavos,moeda,moeda_destino,valor_destino_centavos,contraparte_nome,criada_em,ativo_codigo,quantidade_micros', { count: 'exact' })
      .eq('conta_id', contaId).in('tipo', ['PIX_ENVIADO', 'PIX_RECEBIDO', 'CONVERSAO', 'DEPOSITO'])
      .gte('criada_em', inicio).lt('criada_em', fim).order('criada_em', { ascending: false }).limit(limiteFonte),
    banco.from('transferencias_investimento').select('direcao,valor_origem_centavos,moeda_origem,valor_destino_centavos,moeda_destino,criada_em', { count: 'exact' })
      .eq('conta_principal_id', contaId).gte('criada_em', inicio).lt('criada_em', fim).order('criada_em', { ascending: false }).limit(limiteFonte),
    banco.from('compras_investimento').select('ativo_codigo,quantidade_micros,custo_centavos,criada_em', { count: 'exact' })
      .eq('conta_principal_id', contaId).gte('criada_em', inicio).lt('criada_em', fim).order('criada_em', { ascending: false }).limit(limiteFonte),
    banco.from('vendas_investimento').select('ativo_codigo,quantidade_micros,valor_centavos,criada_em', { count: 'exact' })
      .eq('conta_principal_id', contaId).gte('criada_em', inicio).lt('criada_em', fim).order('criada_em', { ascending: false }).limit(limiteFonte),
  ]);
  for (const resposta of [movimentos, transferencias, compras, vendas]) {
    if (resposta.error) throw new FalhaDePersistencia('Não foi possível consultar o histórico.');
  }
  const registros: Registro[] = [
    ...(movimentos.data ?? []).map(row => ({ tipo: row.tipo, valor: BigInt(row.valor_centavos), moeda: row.moeda,
      data: row.criada_em, contraparte: row.contraparte_nome, destino: row.valor_destino_centavos === null ? null : BigInt(row.valor_destino_centavos),
      moedaDestino: row.moeda_destino, codigo: row.ativo_codigo,
      quantidade: row.quantidade_micros === null ? null : (Number(row.quantidade_micros) / 1000000).toLocaleString('pt-BR') })),
    ...(transferencias.data ?? []).map(row => ({ tipo: 'TRANSFERENCIA', valor: BigInt(row.valor_origem_centavos),
      moeda: row.moeda_origem, data: row.criada_em, destino: BigInt(row.valor_destino_centavos),
      moedaDestino: row.moeda_destino, direcao: row.direcao })),
    ...(compras.data ?? []).map(row => ({ tipo: 'COMPRA', valor: BigInt(row.custo_centavos), moeda: 'BRL',
      data: row.criada_em, codigo: row.ativo_codigo, quantidade: (Number(row.quantidade_micros) / 1000000).toLocaleString('pt-BR') })),
    ...(vendas.data ?? []).map(row => ({ tipo: 'VENDA', valor: BigInt(row.valor_centavos), moeda: 'BRL',
      data: row.criada_em, codigo: row.ativo_codigo, quantidade: (Number(row.quantidade_micros) / 1000000).toLocaleString('pt-BR') })),
  ];
  const incompleto = [movimentos, transferencias, compras, vendas].some(item => (item.count ?? 0) > limiteFonte);
  return resumirHistorico(registros, filtro, incompleto);
}
