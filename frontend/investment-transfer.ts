import { mapAccountError, type AccountErrorContext, type AccountErrorNotice } from './account-errors.js';
import type { ContaInvestimento, DirecaoTransferencia, TransferenciaInvestimento } from './investment-types.js';

export class InvestmentTransferError extends Error {
  readonly notice: AccountErrorNotice;
  constructor(error: unknown, outcome?: AccountErrorContext['outcome']) {
    super('Não foi possível concluir ou confirmar a transferência.', { cause: error });
    this.name = 'InvestmentTransferError';
    this.notice = mapAccountError(error, { operation: 'investment-transfer', outcome });
  }
}

type TransferRequest = { url: string; apiKey: string; token: string; direction: DirecaoTransferencia; value: string; requestId: string };
type TransferResult = { conta: ContaInvestimento; comprovante: TransferenciaInvestimento };

/** Reuses the caller's idempotency key. No automatic retries or new identifiers here. */
export async function requestInvestmentTransfer(input: TransferRequest, fetcher: typeof fetch = fetch): Promise<TransferResult> {
  let response: Response;
  try {
    response = await fetcher(`${input.url}/functions/v1/corretora/investimentos/transferencias`, {
      method: 'POST',
      headers: { apikey: input.apiKey, Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ direcao: input.direction, valor: input.value, requisicao_id: input.requestId }),
    });
  } catch (error) { throw new InvestmentTransferError(error, 'unconfirmed'); }
  if (!response.ok) {
    let error: unknown;
    try { error = await response.json(); } catch { /* Unknown failures remain unconfirmed. */ }
    if (response.status === 401) error = 'Sessão inválida. Entre novamente.';
    const outcome = [400, 401, 403, 404, 422, 429].includes(response.status) ? 'rejected' : undefined;
    throw new InvestmentTransferError(error, outcome);
  }
  try {
    const result: unknown = await response.json();
    if (!isTransferResult(result, input.direction)) throw new Error('Resposta de transferência inválida.');
    return result;
  } catch (error) { throw new InvestmentTransferError(error, 'unconfirmed'); }
}

function isTransferResult(value: unknown, direction: DirecaoTransferencia): value is TransferResult {
  if (!value || typeof value !== 'object') return false;
  const { conta, comprovante } = value as Partial<TransferResult>;
  const money = (value: unknown) => typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value);
  return !!conta && conta.moeda === 'BRL' && money(conta.saldo) && money(conta.acoes_investidas)
    && Array.isArray(conta.posicoes) && Array.isArray(conta.transferencias)
    && !!comprovante && typeof comprovante.id === 'string' && comprovante.direcao === direction
    && money(comprovante.valor_origem) && money(comprovante.valor_destino)
    && ['BRL', 'USD', 'EUR'].includes(comprovante.moeda_origem)
    && ['BRL', 'USD', 'EUR'].includes(comprovante.moeda_destino)
    && (comprovante.cotacao_em === null || (typeof comprovante.cotacao_em === 'string' && !Number.isNaN(Date.parse(comprovante.cotacao_em))));
}
