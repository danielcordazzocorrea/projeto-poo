export type TipoAtivoMercado = 'ACAO' | 'ETF' | 'FII';
export type ResumoAtivo = { codigo: string; nome: string; tipo: TipoAtivoMercado };
export type CotacaoAtivo = ResumoAtivo & {
  preco_brl: string;
  cotacao_em: string | null;
  consultado_em: string;
  fonte: 'brapi';
};
export type BuscaAtivos = { ativos: ResumoAtivo[]; pagina: number; tem_proxima: boolean };

export class ErroMercado extends Error {
  constructor(public status: number, public codigo: string, mensagem: string) { super(mensagem); }
}
type Registro = Record<string, unknown>;
function objeto(valor: unknown): Registro {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErroMercado(502, 'RESPOSTA_INVALIDA', 'Resposta de mercado inválida.');
  }
  return valor as Registro;
}
function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}
function tipoAtivo(item: Registro): TipoAtivoMercado | null {
  // Fundos não são todos FIIs; o sufixo 11 também pode identificar ETF ou unit.
  const subtipo = item.subType;
  if (subtipo === 'etf') return 'ETF';
  if (subtipo === 'fii') return 'FII';
  if (subtipo === 'stock' || subtipo === 'unit' || (!subtipo && item.type === 'stock')) return 'ACAO';
  return null;
}
type Opcoes = {
  fetch?: typeof fetch;
  agora?: () => number;
  timeoutMs?: number;
  log?: (headers: Record<string, string>) => void;
};

export class MercadoBrapi {
  private readonly fetcher: typeof fetch;
  private readonly agora: () => number;
  private readonly timeoutMs: number;
  private readonly log: (headers: Record<string, string>) => void;
  private cache = new Map<string, { vence: number; valor: unknown }>();
  private pendentes = new Map<string, Promise<unknown>>();
  private bloqueadoAte = 0;

  constructor(private readonly token: string, opcoes: Opcoes = {}) {
    this.fetcher = opcoes.fetch ?? fetch;
    this.agora = opcoes.agora ?? Date.now;
    this.timeoutMs = opcoes.timeoutMs ?? 8000;
    this.log = opcoes.log ?? (headers => console.info('brapi: limites', headers));
  }

  private async memorizar<T>(chave: string, ttl: number, carregar: () => Promise<T>): Promise<T> {
    const salvo = this.cache.get(chave);
    if (salvo && salvo.vence > this.agora()) return salvo.valor as T;
    const pendente = this.pendentes.get(chave);
    if (pendente) return pendente as Promise<T>;
    const promessa = carregar().then(valor => {
      this.cache.delete(chave);
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(chave, { vence: this.agora() + ttl, valor });
      return valor;
    }).finally(() => this.pendentes.delete(chave));
    this.pendentes.set(chave, promessa);
    return promessa;
  }

  private async consultar(caminho: string, parametros: Record<string, string>): Promise<Registro> {
    if (!this.token.trim()) throw new ErroMercado(503, 'NAO_CONFIGURADO', 'Consulta de mercado ainda não configurada.');
    if (this.bloqueadoAte > this.agora()) throw new ErroMercado(429, 'LIMITE_BRAPI', 'Limite de consultas atingido. Tente novamente mais tarde.');
    const url = new URL(caminho, 'https://brapi.dev');
    for (const [nome, valor] of Object.entries(parametros)) url.searchParams.set(nome, valor);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resposta = await this.fetcher(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      });
      const limites: Record<string, string> = {};
      for (const nome of ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']) {
        const valor = resposta.headers.get(nome);
        if (valor !== null) limites[nome] = valor;
      }
      if (Object.keys(limites).length) this.log(limites);
      if (resposta.status === 429) {
        const retry = Number(resposta.headers.get('Retry-After'));
        this.bloqueadoAte = this.agora() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 3600) : 60) * 1000;
        throw new ErroMercado(429, 'LIMITE_BRAPI', 'Limite de consultas atingido. Tente novamente mais tarde.');
      }
      if (resposta.status === 401) throw new ErroMercado(503, 'TOKEN_INVALIDO', 'Credencial do provedor de mercado inválida.');
      if (resposta.status === 403) throw new ErroMercado(503, 'ACESSO_NEGADO', 'Consulta não autorizada pelo provedor. Verifique a credencial e a cobertura do plano.');
      if (resposta.status === 404) throw new ErroMercado(404, 'ATIVO_NAO_ENCONTRADO', 'Ativo não encontrado.');
      if (!resposta.ok) throw new ErroMercado(502, 'FALHA_BRAPI', 'Provedor de mercado indisponível.');
      return objeto(await resposta.json());
    } catch (erro) {
      if (erro instanceof ErroMercado) throw erro;
      if (controller.signal.aborted) throw new ErroMercado(504, 'TIMEOUT_BRAPI', 'O provedor demorou para responder. Tente novamente.');
      // Não propagar mensagens, corpo ou URL do provedor: podem conter credenciais.
      throw new ErroMercado(502, 'FALHA_BRAPI', 'Não foi possível consultar o provedor de mercado.');
    } finally { clearTimeout(timer); }
  }

  async buscar(busca: string, pagina = 1): Promise<BuscaAtivos> {
    const termo = busca.trim().toLocaleUpperCase('pt-BR');
    if (termo.length < 2 || termo.length > 80) throw new ErroMercado(400, 'BUSCA_INVALIDA', 'Digite entre 2 e 80 caracteres.');
    if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 1000) throw new ErroMercado(400, 'PAGINA_INVALIDA', 'Página inválida.');
    return this.memorizar(`busca:${termo}:${pagina}`, 300_000, async () => {
      const dados = await this.consultar('/api/quote/list', { search: termo, page: String(pagina), limit: '20' });
      if (!Array.isArray(dados.stocks) || typeof dados.hasNextPage !== 'boolean') {
        throw new ErroMercado(502, 'RESPOSTA_INVALIDA', 'Listagem de mercado inválida.');
      }
      const ativos: ResumoAtivo[] = [];
      for (const valor of dados.stocks) {
        const item = objeto(valor);
        const tipo = tipoAtivo(item);
        const codigo = texto(item.stock);
        const nome = texto(item.name);
        if (tipo && codigo && /^[A-Z]{4}[0-9]{1,2}$/.test(codigo) && nome) ativos.push({ codigo, nome, tipo });
      }
      return { ativos, pagina, tem_proxima: dados.hasNextPage };
    });
  }

  async cotar(ticker: string): Promise<CotacaoAtivo> {
    const codigo = ticker.trim().toUpperCase();
    if (!/^[A-Z]{4}[0-9]{1,2}$/.test(codigo)) throw new ErroMercado(400, 'TICKER_INVALIDO', 'Ticker inválido.');
    return this.memorizar(`cotacao:${codigo}`, 60_000, async () => {
      let pagina = 1;
      let ativo: ResumoAtivo | undefined;
      do {
        const resultado = await this.buscar(codigo, pagina++);
        ativo = resultado.ativos.find(item => item.codigo === codigo);
        if (ativo || !resultado.tem_proxima) break;
      } while (pagina <= 10);
      if (!ativo) throw new ErroMercado(404, 'ATIVO_NAO_ENCONTRADO', 'Ativo não encontrado entre ações, ETFs e FIIs identificados pelo provedor.');
      const dados = await this.consultar('/api/v2/stocks/quote', { symbols: codigo });
      if (!Array.isArray(dados.results)) throw new ErroMercado(502, 'RESPOSTA_INVALIDA', 'Cotação inválida.');
      const resultado = dados.results.map(objeto).find(item => item.symbol === codigo);
      if (!resultado) throw new ErroMercado(404, 'ATIVO_NAO_ENCONTRADO', 'Cotação não encontrada para o ticker solicitado.');
      const cotacao = objeto(resultado.data);
      const preco = cotacao.regularMarketPrice;
      if (typeof preco !== 'number' || !Number.isFinite(preco) || preco <= 0 || preco >= 1e12 || cotacao.currency !== 'BRL') {
        throw new ErroMercado(502, 'PRECO_INDISPONIVEL', 'Preço em BRL indisponível para este ativo.');
      }
      const horario = texto(cotacao.regularMarketTime);
      const instante = horario ? Date.parse(horario) : NaN;
      return { ...ativo, nome: texto(cotacao.longName) ?? texto(cotacao.shortName) ?? ativo.nome,
        preco_brl: preco.toFixed(2), cotacao_em: Number.isFinite(instante) ? new Date(instante).toISOString() : null,
        consultado_em: new Date(this.agora()).toISOString(), fonte: 'brapi' };
    });
  }
}
