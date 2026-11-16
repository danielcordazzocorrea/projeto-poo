import { mapAccountError, type AccountErrorContext, type AccountErrorNotice } from './account-errors.js';
import type { Conta, ConversionReceipt, TipoMoeda } from './moeda.js';

export class CurrencyConversionError extends Error {
  readonly notice: AccountErrorNotice;

  constructor(error: unknown, outcome?: AccountErrorContext['outcome']) {
    super('Não foi possível concluir ou confirmar a conversão.', { cause: error });
    this.name = 'CurrencyConversionError';
    this.notice = mapAccountError(error, { operation: 'conversion', outcome });
  }
}

type ConversionRequest = { url: string; apiKey: string; token: string; currency: TipoMoeda };
type ConversionResult = Conta & { comprovante?: { cotacao_em: string | null } };

/** Do not retry a conversion automatically: a lost response may follow a completed operation. */
export async function requestCurrencyConversion(input: ConversionRequest, fetcher: typeof fetch = fetch): Promise<ConversionReceipt> {
  let response: Response;
  try {
    response = await fetcher(`${input.url}/functions/v1/corretora/conta/converter`, {
      method: 'POST',
      headers: { apikey: input.apiKey, Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ moeda: input.currency }),
    });
  } catch (error) {
    throw new CurrencyConversionError(error, 'unconfirmed');
  }

  if (!response.ok) {
    let error: unknown;
    try { error = await response.json(); } catch { /* Preserve uncertainty for unknown server failures. */ }
    if (response.status === 401) error = 'Sessão inválida. Entre novamente.';
    const outcome = [400, 401, 403, 404, 422, 429].includes(response.status) ? 'rejected' : undefined;
    throw new CurrencyConversionError(error, outcome);
  }

  try {
    const result: unknown = await response.json();
    if (!isConversionResult(result, input.currency)) throw new Error('Resposta de conversão inválida.');
    return { conta: result, cotacaoEm: result.comprovante?.cotacao_em ?? null };
  } catch (error) {
    throw new CurrencyConversionError(error, 'unconfirmed');
  }
}

function isConversionResult(value: unknown, currency: TipoMoeda): value is ConversionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ConversionResult>;
  if (typeof result.id !== 'string' || typeof result.saldo !== 'string'
    || !/^\d+(\.\d{1,2})?$/.test(result.saldo) || result.moeda_saldo !== currency
    || !Array.isArray(result.movimentacoes)) return false;
  const receipt = result.comprovante;
  return receipt === undefined || (receipt !== null && typeof receipt === 'object'
    && (receipt.cotacao_em === null || (typeof receipt.cotacao_em === 'string' && !Number.isNaN(Date.parse(receipt.cotacao_em)))));
}
