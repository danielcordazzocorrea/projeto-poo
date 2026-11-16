import { mapAccountError, type AccountErrorContext, type AccountErrorNotice } from './account-errors.js';
import type { ContaInvestimento } from './investment-types.js';

export type TradeOperation = 'purchase' | 'sale';
export class InvestmentTradeError extends Error {
  readonly notice: AccountErrorNotice;
  constructor(error: unknown, operation: TradeOperation, outcome?: AccountErrorContext['outcome']) {
    super('Não foi possível concluir ou confirmar a operação.', { cause: error });
    this.name = 'InvestmentTradeError';
    this.notice = mapAccountError(error, { operation, outcome });
  }
}

type TradeRequest = { url: string; apiKey: string; token: string; operation: TradeOperation; ticker: string; quantity: string; requestId: string };

/** Shares the request path for buying/selling, retaining the existing idempotency key. */
export async function requestInvestmentTrade(input: TradeRequest, fetcher: typeof fetch = fetch): Promise<ContaInvestimento> {
  let response: Response;
  try {
    response = await fetcher(`${input.url}/functions/v1/corretora/investimentos/${input.operation === 'purchase' ? 'compras' : 'vendas'}`, {
      method: 'POST',
      headers: { apikey: input.apiKey, Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_ativo: input.ticker, quantidade: input.quantity, requisicao_id: input.requestId }),
    });
  } catch (error) { throw new InvestmentTradeError(error, input.operation, 'unconfirmed'); }
  if (!response.ok) {
    let error: unknown;
    try { error = await response.json(); } catch { /* Unknown failures remain unconfirmed. */ }
    if (response.status === 401) error = 'Sessão inválida. Entre novamente.';
    const outcome = [400, 401, 403, 404, 422, 429].includes(response.status) ? 'rejected' : undefined;
    throw new InvestmentTradeError(error, input.operation, outcome);
  }
  try {
    const result: unknown = await response.json();
    if (!isTradeResult(result)) throw new Error('Resposta da operação inválida.');
    return result;
  } catch (error) { throw new InvestmentTradeError(error, input.operation, 'unconfirmed'); }
}

function isTradeResult(value: unknown): value is ContaInvestimento {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ContaInvestimento>;
  const money = (value: unknown) => typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value);
  return result.moeda === 'BRL' && money(result.saldo) && money(result.acoes_investidas)
    && Array.isArray(result.transferencias) && Array.isArray(result.posicoes)
    && result.posicoes.every(position => position && typeof position.codigo_ativo === 'string'
      && typeof position.quantidade === 'string' && /^\d+(\.\d{1,6})?$/.test(position.quantidade));
}
