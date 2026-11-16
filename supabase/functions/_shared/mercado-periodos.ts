export const PERIODOS_HISTORICO = {
  '1d': { rotulo: '1 D', descricao: 'Último dia', intervalo: '5m' },
  '5d': { rotulo: '5 D', descricao: 'Últimos 5 dias', intervalo: '60m' },
  '1mo': { rotulo: '1 M', descricao: 'Último mês', intervalo: '1d' },
  '6mo': { rotulo: '6 M', descricao: 'Últimos 6 meses', intervalo: '1d' },
  ytd: { rotulo: 'YTD', descricao: 'Desde o início do ano', intervalo: '1d' },
  '1y': { rotulo: '1 A', descricao: 'Último ano', intervalo: '1d' },
  '5y': { rotulo: '5 A', descricao: 'Últimos 5 anos', intervalo: '1wk' },
  max: { rotulo: 'Máx', descricao: 'Todo o histórico disponível', intervalo: '1mo' },
} as const;

export type PeriodoHistorico = keyof typeof PERIODOS_HISTORICO;
export type IntervaloHistorico = typeof PERIODOS_HISTORICO[PeriodoHistorico]['intervalo'];

export function periodoValido(valor: string): valor is PeriodoHistorico {
  return Object.prototype.hasOwnProperty.call(PERIODOS_HISTORICO, valor);
}
