// Validate the fields used by the screens before accepting a successful query response.
type Data = Record<string, unknown>;
function object(value: unknown): value is Data {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function money(value: unknown): boolean {
  return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value);
}
function currency(value: unknown): boolean { return value === 'BRL' || value === 'USD' || value === 'EUR'; }
function date(value: unknown): boolean {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}
function quantity(value: unknown): boolean {
  return typeof value === 'string' && /^\d+(\.\d{1,6})?$/.test(value);
}
function movement(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' && typeof value.tipo === 'string'
    && money(value.valor) && currency(value.moeda) && date(value.criada_em)
    && (value.moeda_destino === null || currency(value.moeda_destino))
    && (value.valor_destino === null || money(value.valor_destino))
    && (value.contraparte_nome === null || typeof value.contraparte_nome === 'string');
}
export function validAccount(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' && money(value.saldo) && currency(value.moeda_saldo)
    && (value.saldo_brl === null || money(value.saldo_brl))
    && Array.isArray(value.movimentacoes) && value.movimentacoes.every(movement);
}
export function validInvestmentAccount(value: unknown): boolean {
  return object(value) && money(value.saldo) && money(value.acoes_investidas) && value.moeda === 'BRL'
    && Array.isArray(value.posicoes) && value.posicoes.every(position => object(position)
      && typeof position.codigo_ativo === 'string' && quantity(position.quantidade))
    && Array.isArray(value.transferencias) && value.transferencias.every(transfer => object(transfer)
      && typeof transfer.id === 'string' && money(transfer.valor_origem) && money(transfer.valor_destino)
      && currency(transfer.moeda_origem) && currency(transfer.moeda_destino)
      && (transfer.direcao === 'PARA_PRINCIPAL' || transfer.direcao === 'PARA_INVESTIMENTOS')
      && date(transfer.cotacao_em) && (transfer.criada_em === undefined || date(transfer.criada_em)));
}
function asset(value: unknown): boolean {
  return object(value) && typeof value.codigo === 'string' && typeof value.nome === 'string'
    && ['ACAO', 'ETF', 'FII'].includes(String(value.tipo));
}
export function validAssetSearch(value: unknown): boolean {
  return object(value) && Array.isArray(value.ativos) && value.ativos.every(asset)
    && typeof value.pagina === 'number' && Number.isInteger(value.pagina) && value.pagina >= 1
    && typeof value.tem_proxima === 'boolean';
}
export function validAssetQuote(value: unknown): boolean {
  return object(value) && asset(value) && money(value.preco_brl) && Number(value.preco_brl) > 0
    && date(value.cotacao_em) && typeof value.consultado_em === 'string' && date(value.consultado_em)
    && value.fonte === 'brapi';
}
