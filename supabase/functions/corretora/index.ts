import { withSupabase } from 'npm:@supabase/server@1';
import { Corretora } from '../_shared/servico.ts';
import { RepositorioSupabase } from '../_shared/repositorio-supabase.ts';
import { FalhaDePersistencia, NaoEncontrado, RegraDeNegocio } from '../_shared/dominio.ts';

function json(status: number, dados: unknown): Response {
  return Response.json(dados, { status });
}

async function lerJson(req: Request): Promise<Record<string, unknown>> {
  const texto = await req.text();
  if (texto.length > 10_000) throw new RegraDeNegocio('JSON deve ter no máximo 10 KB.');
  try {
    const dados: unknown = JSON.parse(texto);
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error();
    return dados as Record<string, unknown>;
  } catch {
    throw new RegraDeNegocio('Envie um objeto JSON válido.');
  }
}

Deno.serve(withSupabase({ auth: 'user' }, async (req, ctx) => {
  const corretora = new Corretora(new RepositorioSupabase(ctx.supabase));
  const caminho = new URL(req.url).pathname.match(/\/corretora(\/.*)?$/)?.[1] ?? '/';
  try {
    if (req.method === 'GET' && caminho === '/ativos') {
      return json(200, await corretora.listarAtivos());
    }
    if (req.method === 'POST' && caminho === '/conta') {
      return json(201, await corretora.abrirConta());
    }
    if (req.method === 'GET' && caminho === '/conta') {
      return json(200, await corretora.consultarConta());
    }
    if (req.method === 'POST' && caminho === '/depositos') {
      return json(200, await corretora.depositar((await lerJson(req)).valor));
    }
    if (req.method === 'POST' && caminho === '/compras') {
      const dados = await lerJson(req);
      return json(200, await corretora.comprar(dados.codigo_ativo, dados.quantidade));
    }
    if (req.method === 'POST' && caminho === '/vendas') {
      const dados = await lerJson(req);
      return json(200, await corretora.vender(dados.codigo_ativo, dados.quantidade));
    }
    if (req.method === 'POST' && caminho === '/pix/transferencias') {
      const dados = await lerJson(req);
      return json(200, await corretora.transferirPix(dados.chave_destino, dados.valor));
    }
    return json(404, { erro: 'Rota não encontrada.' });
  } catch (erro) {
    if (erro instanceof NaoEncontrado) return json(404, { erro: erro.message });
    if (erro instanceof RegraDeNegocio) return json(400, { erro: erro.message });
    if (erro instanceof FalhaDePersistencia) return json(503, { erro: erro.message });
    console.error(erro);
    return json(500, { erro: 'Erro interno.' });
  }
}));
