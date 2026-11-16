import { mapAccountError, type AccountErrorNotice } from './account-errors.js';

export type QueryOperation = 'account' | 'market';

export class QueryError extends Error {
  readonly notice: AccountErrorNotice;
  constructor(error: unknown, operation: QueryOperation) {
    super('Não foi possível consultar os dados.', { cause: error });
    this.name = 'QueryError';
    this.notice = mapAccountError(error, { operation });
  }
}

/** Keeps API codes for friendly messages; never exposes raw server bodies. */
export async function readQueryResponse<T>(response: Response, operation: QueryOperation): Promise<T> {
  if (response.status === 401) throw new QueryError('Sessão inválida. Entre novamente.', operation);
  let body: unknown;
  try { body = await response.json(); }
  catch (error) { throw new QueryError(error, operation); }
  if (!response.ok || !body || typeof body !== 'object') throw new QueryError(body, operation);
  return body as T;
}

export function queryErrorNotice(error: unknown, operation: QueryOperation): AccountErrorNotice {
  return error instanceof QueryError ? error.notice : mapAccountError(error, { operation });
}
