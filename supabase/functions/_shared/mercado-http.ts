import { ErroMercado, MercadoBrapi } from './mercado-brapi.ts';

// Chamado somente dentro do handler autenticado da corretora.
export async function responderMercado(req: Request, mercado: MercadoBrapi): Promise<Response | null> {
  const url = new URL(req.url);
  const caminho = url.pathname.match(/\/corretora(\/.*)?$/)?.[1] ?? '/';
  if (caminho !== '/mercado/ativos' && !caminho.startsWith('/mercado/ativos/')) return null;
  if (req.method !== 'GET') return Response.json({ erro: 'Método não permitido.' }, { status: 405, headers: { Allow: 'GET' } });
  try {
    const historico = caminho.match(/^\/mercado\/ativos\/([^/]+)\/historico$/);
    const dados = caminho === '/mercado/ativos'
      ? await mercado.buscar(url.searchParams.get('busca') ?? '', Number(url.searchParams.get('pagina') ?? '1'))
      : historico ? await mercado.historico(historico[1]!)
      : await mercado.cotar(caminho.slice('/mercado/ativos/'.length));
    return Response.json(dados, { headers: { 'Cache-Control': 'no-store' } });
  } catch (erro) {
    if (erro instanceof ErroMercado) return Response.json({ erro: erro.message, codigo: erro.codigo }, { status: erro.status, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ erro: 'Erro ao consultar mercado.' }, { status: 500 });
  }
}
