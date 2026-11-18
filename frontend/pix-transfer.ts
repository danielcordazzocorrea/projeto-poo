import { mapAccountError, type AccountErrorContext, type AccountErrorNotice } from './account-errors.js';
import type { Conta, PixReceipt } from './moeda.js';

export class PixTransferError extends Error {
  readonly notice: AccountErrorNotice;

  constructor(error: unknown, outcome?: AccountErrorContext['outcome']) {
    super('Não foi possível concluir ou confirmar o Pix.', { cause: error });
    this.name = 'PixTransferError';
    this.notice = mapAccountError(error, { operation: 'pix', outcome });
  }
}

type PixResult = Conta & { comprovante?: NonNullable<PixReceipt> };
type PixRequest = { url: string; apiKey: string; token: string; key: string; value: string };

/** A lost response is not proof that the transfer was refused. Never retry a POST here. */
export async function requestPixTransfer(input: PixRequest, fetcher: typeof fetch = fetch): Promise<PixResult> {
  let response: Response;
  try {
    response = await fetcher(`${input.url}/functions/v1/corretora/pix/transferencias`, {
      method: 'POST',
      headers: { apikey: input.apiKey, Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave_destino: input.key, valor: input.value }),
    });
  } catch (error) {
    throw new PixTransferError(error, 'unconfirmed');
  }

  if (!response.ok) {
    let error: unknown;
    try { error = await response.json(); } catch { /* Unknown server failures remain unconfirmed. */ }
    if (response.status === 401) error = 'Sessão inválida. Entre novamente.';
    const outcome = [400, 401, 403, 404, 422, 429].includes(response.status) ? 'rejected' : undefined;
    throw new PixTransferError(error, outcome);
  }

  try {
    const result: unknown = await response.json();
    if (!isPixResult(result)) throw new Error('Resposta de Pix inválida.');
    return result;
  } catch (error) {
    // The POST succeeded but confirmation could not be read. Do not clear the form.
    throw new PixTransferError(error, 'unconfirmed');
  }
}

function isPixResult(value: unknown): value is PixResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<PixResult>;
  if (typeof result.id !== 'string' || typeof result.saldo !== 'string'
    || !/^\d+(\.\d{1,2})?$/.test(result.saldo)
    || !['BRL', 'USD', 'EUR'].includes(result.moeda_saldo ?? '')
    || !Array.isArray(result.movimentacoes)) return false;
  const receipt = result.comprovante;
  return receipt === undefined || (receipt !== null && typeof receipt === 'object'
    && ['BRL', 'USD', 'EUR'].includes(receipt.moeda_recebida)
    && typeof receipt.valor_recebido === 'string' && /^\d+(\.\d{1,2})?$/.test(receipt.valor_recebido));
}
