import { useEffect, useState } from 'react';
import type { BuscaAtivos, CotacaoAtivo, HistoricoAtivo } from '../supabase/functions/_shared/mercado-brapi';
import { GraficoAtivo } from './mercado-grafico';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
const chave = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
async function consultar<T>(caminho: string, token: string, signal: AbortSignal): Promise<T> {
  const resposta = await fetch(`${url}/functions/v1/corretora/mercado/ativos${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${token}` }, signal,
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(typeof dados.erro === 'string' ? dados.erro : 'Não foi possível consultar o mercado.');
  return dados as T;
}
function horario(valor: string | null): string {
  return valor ? new Date(valor).toLocaleString('pt-BR', { timeZoneName: 'short' }) : 'Não informado pelo provedor';
}

export function MercadoAtivos({ token }: { token: string }) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<BuscaAtivos | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [cotacao, setCotacao] = useState<CotacaoAtivo | null>(null);
  const [erroBusca, setErroBusca] = useState('');
  const [erroCotacao, setErroCotacao] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [cotando, setCotando] = useState(false);
  const [historico, setHistorico] = useState<HistoricoAtivo | null>(null);
  const [erroHistorico, setErroHistorico] = useState('');
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [tentativaHistorico, setTentativaHistorico] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLista(null); setErroBusca('');
    if (busca.trim().length < 2) { setBuscando(false); return () => controller.abort(); }
    setBuscando(true);
    const timer = setTimeout(() => {
      void consultar<BuscaAtivos>(`?busca=${encodeURIComponent(busca.trim())}&pagina=${pagina}`, token, controller.signal)
        .then(dados => { if (!controller.signal.aborted) setLista(dados); })
        .catch(erro => { if (!controller.signal.aborted) setErroBusca(erro instanceof Error ? erro.message : 'Falha na busca.'); })
        .finally(() => { if (!controller.signal.aborted) setBuscando(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [busca, pagina, token]);

  useEffect(() => {
    const controller = new AbortController();
    setCotacao(null); setErroCotacao('');
    if (!ticker) { setCotando(false); return () => controller.abort(); }
    setCotando(true);
    void consultar<CotacaoAtivo>(`/${encodeURIComponent(ticker)}`, token, controller.signal)
      .then(dados => { if (!controller.signal.aborted) setCotacao(dados); })
      .catch(erro => { if (!controller.signal.aborted) setErroCotacao(erro instanceof Error ? erro.message : 'Falha na cotação.'); })
      .finally(() => { if (!controller.signal.aborted) setCotando(false); });
    return () => controller.abort();
  }, [ticker, token]);

  useEffect(() => {
    const controller = new AbortController();
    setHistorico(null); setErroHistorico('');
    if (!ticker) { setCarregandoHistorico(false); return () => controller.abort(); }
    setCarregandoHistorico(true);
    void consultar<HistoricoAtivo>(`/${encodeURIComponent(ticker)}/historico`, token, controller.signal)
      .then(dados => { if (!controller.signal.aborted) setHistorico(dados); })
      .catch(erro => { if (!controller.signal.aborted) setErroHistorico(erro instanceof Error ? erro.message : 'Falha ao consultar histórico.'); })
      .finally(() => { if (!controller.signal.aborted) setCarregandoHistorico(false); });
    return () => controller.abort();
  }, [ticker, token, tentativaHistorico]);

  return <div className="account-market">
    <p className="account-detail-intro">Pesquise ações, ETFs e FIIs por nome ou ticker.</p>
    <p className="account-pix-note">Cotações de referência com atraso, que pode ser de aproximadamente 30 minutos no plano gratuito. Confira o horário informado pela fonte.</p>
    <div className="account-pix-form">
      <label htmlFor="market-search">Nome ou ticker</label>
      <input id="market-search" type="search" value={busca} maxLength={80} placeholder="Ex.: PETR4 ou Petrobras" autoComplete="off"
        onChange={event => { setBusca(event.target.value); setPagina(1); setTicker(null); setCotacao(null); setLista(null); }} />
    </div>
    {busca.trim().length < 2 && <p>Digite pelo menos 2 caracteres.</p>}
    {buscando && <p role="status">Buscando ativos…</p>}
    {erroBusca && <p role="alert">{erroBusca}</p>}
    {lista && <section aria-label="Resultados da busca">
      {lista.ativos.length === 0 && <p>Nenhum ativo compatível nesta página.</p>}
      <ul className="market-results">{lista.ativos.map(ativo => <li key={ativo.codigo}>
        <button type="button" aria-pressed={ticker === ativo.codigo} onClick={() => setTicker(ativo.codigo)}>
          <strong>{ativo.codigo}</strong><span>{ativo.nome}</span><span>{ativo.tipo}</span>
        </button>
      </li>)}</ul>
      <nav className="market-pagination" aria-label="Páginas de ativos">
        <button type="button" disabled={pagina <= 1 || buscando} onClick={() => setPagina(valor => valor - 1)}>Anterior</button>
        <span>Página {pagina}</span>
        <button type="button" disabled={!lista.tem_proxima || buscando} onClick={() => setPagina(valor => valor + 1)}>Próxima</button>
      </nav>
    </section>}
    {cotando && <p role="status">Consultando {ticker}…</p>}
    {erroCotacao && <p role="alert">{erroCotacao} <button type="button" onClick={() => setTicker(null)}>Fechar</button></p>}
    {cotacao && <section aria-label="Cotação do ativo" aria-live="polite">
      <h2>{cotacao.codigo} · {cotacao.nome}</h2>
      <dl className="account-data">
        <div><dt>Tipo</dt><dd>{cotacao.tipo}</dd></div>
        <div><dt>Preço em BRL</dt><dd>{Number(cotacao.preco_brl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>
        <div><dt>Horário da cotação</dt><dd>{horario(cotacao.cotacao_em)}</dd></div>
        <div><dt>Consultado no servidor</dt><dd>{horario(cotacao.consultado_em)}</dd></div>
        <div><dt>Fonte</dt><dd>brapi</dd></div>
      </dl>
    </section>}
    {ticker && <section className="market-history-card" aria-label={`Evolução do preço de ${ticker}`} aria-busy={carregandoHistorico}>
      <div className="market-history-heading"><h3>Evolução do preço · {ticker}</h3><span>Último mês</span></div>
      {carregandoHistorico && <p role="status">Carregando histórico…</p>}
      {erroHistorico && <div role="alert"><p>Não foi possível carregar o gráfico. {erroHistorico}</p>
        <button type="button" onClick={() => setTentativaHistorico(valor => valor + 1)}>Tentar novamente</button>
      </div>}
      {historico?.codigo === ticker && !carregandoHistorico && !erroHistorico && <GraficoAtivo key={`${ticker}:${historico.consultado_em}`} historico={historico} />}
    </section>}
  </div>;
}
