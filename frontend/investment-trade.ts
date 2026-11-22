import { mapAccountError, type AccountErrorContext, type AccountErrorNotice } from './account-errors.js';
import type { ContaInvestimento, ResultadoCompra } from './investment-types.js';
import { validInvestmentAccount, validPurchaseReceipt } from './query-validation.js';

export type TradeOperation = 'purchase' | 'sale';
export class InvestmentTradeError extends Error {
  readonly notice: AccountErrorNotice;
  constructor(error: unknown, operation: TradeOperation, outcome?: AccountErrorContext['outcome']) {
    super('Não foi possível concluir ou confirmar a operação.', { cause: error });
    this.name = 'InvestmentTradeError';
    this.notice = mapAccountError(error, { operation, outcome });
  }
}

type TradeRequest = { url: string; apiKey: string; token: string; operation: TradeOperation; ticker: string; quantity: string;
  requestId: string; confirmedPrice?: string };

/** Shares the request path for buying/selling, retaining the existing idempotency key. */
export function requestInvestmentTrade(input: TradeRequest & { operation: 'purchase' }, fetcher?: typeof fetch): Promise<ResultadoCompra>;
export function requestInvestmentTrade(input: TradeRequest & { operation: 'sale' }, fetcher?: typeof fetch): Promise<ContaInvestimento>;
export function requestInvestmentTrade(input: TradeRequest, fetcher?: typeof fetch): Promise<ResultadoCompra | ContaInvestimento>;
export async function requestInvestmentTrade(input: TradeRequest, fetcher: typeof fetch = fetch): Promise<ResultadoCompra | ContaInvestimento> {
  let response: Response;
  try {
    response = await fetcher(`${input.url}/functions/v1/corretora/investimentos/${input.operation === 'purchase' ? 'compras' : 'vendas'}`, {
      method: 'POST',
      headers: { apikey: input.apiKey, Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_ativo: input.ticker, quantidade: input.quantity, requisicao_id: input.requestId,
        ...(input.operation === 'purchase' && input.confirmedPrice ? { preco_confirmado: input.confirmedPrice } : {}) }),
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
    if (input.operation === 'purchase') {
      const purchase = result as Partial<ResultadoCompra> | null;
      if (!purchase || !validInvestmentAccount(purchase.conta) || !validPurchaseReceipt(purchase.comprovante)) throw new Error('Resposta da compra inválida.');
      return purchase as ResultadoCompra;
    }
    if (!validInvestmentAccount(result)) throw new Error('Resposta da venda inválida.');
    return result as ContaInvestimento;
  } catch (error) { throw new InvestmentTradeError(error, input.operation, 'unconfirmed'); }
}
