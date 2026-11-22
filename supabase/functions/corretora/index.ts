import { MercadoBrapi } from '../_shared/mercado-brapi.ts';
import { responderMercado } from '../_shared/mercado-http.ts';
import { withSupabase } from 'npm:@supabase/server@1';
import { Corretora } from '../_shared/servico.ts';
import { Investimentos } from '../_shared/investimentos.ts';
import { RepositorioSupabase } from '../_shared/repositorio-supabase.ts';
import { FalhaDePersistencia, NaoEncontrado, RegraDeNegocio } from '../_shared/dominio.ts';
import { conversarComAssistente } from '../_shared/assistente.ts';
import { calcularResultadoInvestimento } from '../_shared/resultado-investimento.ts';
import { MemoriaAssistente } from '../_shared/memoria-assistente.ts';
import { lerPerguntaAssistente } from '../_shared/mensagem-assistente.ts';

const mercado = new MercadoBrapi(Deno.env.get('BRAPI_TOKEN') ?? '');

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
  function corretoraComCambio(): Corretora {
    const usuarioId = ctx.userClaims?.id;
    if (!usuarioId) throw new RegraDeNegocio('Sessão inválida. Entre novamente.');
    return new Corretora(new RepositorioSupabase(ctx.supabase, ctx.supabaseAdmin, usuarioId));
  }
  function investimentos(): Investimentos {
    const usuarioId = ctx.userClaims?.id;
    if (!usuarioId) throw new RegraDeNegocio('Sessão inválida. Entre novamente.');
    return new Investimentos(new RepositorioSupabase(ctx.supabase, ctx.supabaseAdmin, usuarioId));
  }
  const caminho = new URL(req.url).pathname.match(/\/corretora(\/.*)?$/)?.[1] ?? '/';
  try {
    const respostaMercado = await responderMercado(req, mercado);
    if (respostaMercado) return respostaMercado;
    if (req.method === 'GET' && caminho === '/ativos') {
      return json(200, await corretora.listarAtivos());
    }
    if (req.method === 'GET' && caminho === '/investimentos/conta') {
      return json(200, await investimentos().consultarConta());
    }
    if (req.method === 'GET' && caminho === '/investimentos/resultado') {
      return json(200, await calcularResultadoInvestimento(await investimentos().consultarConta(), mercado));
    }
    if ((req.method === 'GET' || req.method === 'DELETE') && caminho === '/assistente/historico') {
      const usuarioId = ctx.userClaims?.id;
      if (!usuarioId) throw new RegraDeNegocio('Sessão inválida. Entre novamente.');
      const memoria = new MemoriaAssistente(ctx.supabase, ctx.supabaseAdmin, usuarioId);
      if (req.method === 'GET') return json(200, { mensagens: await memoria.listar() });
      await memoria.apagar();
      return new Response(null, { status: 204 });
    }
    if (req.method === 'POST' && caminho === '/assistente') {
      const usuarioId = ctx.userClaims?.id;
      if (!usuarioId) throw new RegraDeNegocio('Sessão inválida. Entre novamente.');
      try {
        const pergunta = lerPerguntaAssistente(await lerJson(req));
        const memoria = new MemoriaAssistente(ctx.supabase, ctx.supabaseAdmin, usuarioId);
        const mensagens = [...await memoria.listar(11), { role: 'user' as const, content: pergunta }];
        const resposta = await conversarComAssistente({ mensagens }, corretora, investimentos(),
          usuarioId, mercado, ctx.supabase);
        await memoria.salvar(pergunta, resposta.resposta);
        return json(200, resposta);
      } catch (erro) {
        if (erro instanceof RegraDeNegocio || erro instanceof NaoEncontrado) throw erro;
        console.error('Falha no assistente:', erro);
        return json(503, { erro: 'Não consegui responder agora. Tente novamente em instantes.' });
      }
    }
    if (req.method === 'POST' && caminho === '/investimentos/transferencias') {
      const dados = await lerJson(req);
      return json(200, await investimentos().transferir(dados.direcao, dados.valor, dados.requisicao_id));
    }
    if (req.method === 'POST' && caminho === '/investimentos/compras') {
      const dados = await lerJson(req);
      if (typeof dados.codigo_ativo !== 'string') throw new RegraDeNegocio('Código de ativo inválido.');
      const cotacao = await mercado.cotar(dados.codigo_ativo);
      return json(200, await investimentos().comprarAtivo(
        cotacao.codigo, dados.quantidade, cotacao.preco_brl, dados.requisicao_id, cotacao.cotacao_em,
      ));
    }
    if (req.method === 'POST' && caminho === '/investimentos/vendas') {
      const dados = await lerJson(req);
      if (typeof dados.codigo_ativo !== 'string') throw new RegraDeNegocio('Código de ativo inválido.');
      const cotacao = await mercado.cotar(dados.codigo_ativo);
      return json(200, await investimentos().venderAtivo(
        cotacao.codigo, dados.quantidade, cotacao.preco_brl, dados.requisicao_id,
      ));
    }
    if (req.method === 'POST' && caminho === '/conta') {
      return json(201, await corretora.abrirConta());
    }
    if (req.method === 'GET' && caminho === '/conta') {
      return json(200, await corretora.consultarConta());
    }
    if (req.method === 'POST' && caminho === '/conta/converter') {
      return json(200, await corretoraComCambio().converterSaldo((await lerJson(req)).moeda));
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
      return json(200, await corretoraComCambio().transferirPix(dados.chave_destino, dados.valor));
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
