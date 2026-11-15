import { FalhaDePersistencia } from './dominio.ts';

export type Cotacao = { bid: string; ask: string; timestamp: string };
export type Cotacoes = { USD: Cotacao; EUR: Cotacao };

// Endpoint público de cotações atuais, sem chave de API.
const URL_COTACOES = 'https://api.coinbase.com/v2/exchange-rates?currency=USD';
const ESCALA = 10n ** 16n;
const CACHE_MS = 30_000;
let cache: { cotacoes: Cotacoes; consultadaEm: number } | null = null;

function unidades(valor: unknown, moeda: string): bigint {
  if (typeof valor !== 'string' || !/^\d{1,8}(\.\d{1,16})?$/.test(valor)) {
    throw new FalhaDePersistencia(`Cotação de ${moeda} inválida.`);
  }
  const [inteiro = '0', fracao = ''] = valor.split('.');
  const resultado = BigInt(inteiro) * ESCALA + BigInt(fracao.padEnd(16, '0') || '0');
  if (resultado <= 0n || resultado > 10_000n * ESCALA) {
    throw new FalhaDePersistencia(`Cotação de ${moeda} fora do limite.`);
  }
  return resultado;
}

function decimal8(valor: bigint): string {
  const reduzido = valor / 100_000_000n;
  if (reduzido <= 0n) throw new FalhaDePersistencia('Cotação pequena demais.');
  return `${reduzido / 100_000_000n}.${(reduzido % 100_000_000n).toString().padStart(8, '0')}`;
}

export async function buscarCotacoes(
  buscar: typeof fetch = fetch, agora: number = Date.now(),
): Promise<Cotacoes> {
  if (buscar === fetch && cache && agora - cache.consultadaEm < CACHE_MS) return cache.cotacoes;
  let resposta: Response;
  try {
    resposta = await buscar(URL_COTACOES, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    throw new FalhaDePersistencia('Não foi possível consultar a API de câmbio.');
  }
  if (!resposta.ok) throw new FalhaDePersistencia(`API de câmbio indisponível (HTTP ${resposta.status}).`);
  let dados: unknown;
  try { dados = await resposta.json(); }
  catch { throw new FalhaDePersistencia('Resposta inválida da API de câmbio.'); }
  if (!dados || typeof dados !== 'object' || !('data' in dados)) {
    throw new FalhaDePersistencia('Resposta inválida da API de câmbio.');
  }
  const corpo = dados.data;
  if (!corpo || typeof corpo !== 'object' || !('currency' in corpo) || corpo.currency !== 'USD'
    || !('rates' in corpo) || !corpo.rates || typeof corpo.rates !== 'object') {
    throw new FalhaDePersistencia('Resposta inválida da API de câmbio.');
  }
  const taxas = corpo.rates as Record<string, unknown>;
  const usdBrl = unidades(taxas.BRL, 'BRL');
  const usdEur = unidades(taxas.EUR, 'EUR');
  const hora = new Date(agora).toISOString();
  const dolar = decimal8(usdBrl);
  // A API informa BRL e EUR por USD. EUR/BRL = (BRL por USD) / (EUR por USD).
  const euro = decimal8(usdBrl * ESCALA / usdEur);
  const cotacoes: Cotacoes = {
    USD: { bid: dolar, ask: dolar, timestamp: hora },
    EUR: { bid: euro, ask: euro, timestamp: hora },
  };
  if (buscar === fetch) cache = { cotacoes, consultadaEm: agora };
  return cotacoes;
}
