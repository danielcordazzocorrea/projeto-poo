import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Ativo, Conta, formatarDecimal, NaoEncontrado, RegraDeNegocio } from './dominio.js';
import { Corretora } from './servico.js';

const corretora = new Corretora();

function ativoJson(ativo: Ativo) {
  return {
    codigo: ativo.codigo,
    nome: ativo.nome,
    tipo: ativo.tipo,
    preco_brl: formatarDecimal(ativo.precoCentavos, 2),
  };
}

function contaJson(conta: Conta) {
  return {
    id: conta.id,
    cliente_id: conta.clienteId,
    saldo_brl: formatarDecimal(conta.consultarSaldo(), 2),
    posicoes: conta.consultarPosicoes().map(posicao => ({
      ativo: ativoJson(posicao.ativo),
      quantidade: formatarDecimal(posicao.quantidade, 6),
    })),
    movimentacoes: conta.consultarMovimentacoes().map(movimento => ({
      id: movimento.id,
      tipo: movimento.tipo,
      valor_brl: formatarDecimal(movimento.valorCentavos, 2),
      codigo_ativo: movimento.codigoAtivo ?? null,
      quantidade: movimento.quantidade === undefined ? null : formatarDecimal(movimento.quantidade, 6),
    })),
  };
}

function responder(res: ServerResponse, status: number, dados: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
}

async function lerJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let corpo = '';
  for await (const parte of req) {
    corpo += parte.toString();
    if (corpo.length > 10_000) throw new RegraDeNegocio('JSON deve ter no máximo 10 KB.');
  }
  try {
    const dados: unknown = JSON.parse(corpo);
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error();
    return dados as Record<string, unknown>;
  } catch {
    throw new RegraDeNegocio('Envie um objeto JSON válido.');
  }
}

export const servidor = createServer(async (req, res) => {
  try {
    const rota = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'GET' && rota === '/ativos') {
      responder(res, 200, [...corretora.repositorio.ativos.values()].map(ativoJson));
      return;
    }
    if (req.method === 'POST' && rota === '/clientes') {
      const cliente = corretora.cadastrarCliente((await lerJson(req)).nome);
      responder(res, 201, { id: cliente.id, nome: cliente.nome });
      return;
    }
    if (req.method === 'POST' && rota === '/contas') {
      responder(res, 201, contaJson(corretora.abrirConta((await lerJson(req)).cliente_id)));
      return;
    }
    const consulta = /^\/contas\/([0-9a-f-]+)$/.exec(rota);
    if (req.method === 'GET' && consulta?.[1]) {
      responder(res, 200, contaJson(corretora.obterConta(consulta[1])));
      return;
    }
    const operacao = /^\/contas\/([0-9a-f-]+)\/(depositos|compras|vendas)$/.exec(rota);
    if (req.method === 'POST' && operacao?.[1]) {
      const [, id, tipo] = operacao;
      const dados = await lerJson(req);
      let conta: Conta;
      if (tipo === 'depositos') conta = corretora.depositar(id, dados.valor);
      else if (tipo === 'compras') conta = corretora.comprar(id, dados.codigo_ativo, dados.quantidade);
      else conta = corretora.vender(id, dados.codigo_ativo, dados.quantidade);
      responder(res, 200, contaJson(conta));
      return;
    }
    responder(res, 404, { erro: 'Rota não encontrada.' });
  } catch (erro) {
    if (erro instanceof NaoEncontrado) responder(res, 404, { erro: erro.message });
    else if (erro instanceof RegraDeNegocio) responder(res, 400, { erro: erro.message });
    else {
      console.error(erro);
      responder(res, 500, { erro: 'Erro interno.' });
    }
  }
});

if (process.env.NODE_ENV !== 'test') {
  servidor.listen(8000, '127.0.0.1', () => {
    console.log('API de demonstração em http://127.0.0.1:8000');
  });
}
