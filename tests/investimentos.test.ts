import assert from 'node:assert/strict';
import test from 'node:test';
import { Investimentos, type RepositorioInvestimentos } from '../supabase/functions/_shared/investimentos.ts';
import type { Cotacoes } from '../supabase/functions/_shared/cotacoes.ts';
import type { TipoMoeda } from '../supabase/functions/_shared/dominio.ts';

const requisicaoId = '11111111-1111-4111-8111-111111111111';
const cotacoes: Cotacoes = {
  USD: { bid: '5.10000000', ask: '5.10000000', timestamp: '2026-11-15T12:00:00.000Z' },
  EUR: { bid: '5.50000000', ask: '5.50000000', timestamp: '2026-11-15T12:00:00.000Z' },
};

function criarRepositorio(moeda: TipoMoeda) {
  const chamadas: Array<{ direcao: string; centavos: bigint; moeda: TipoMoeda; taxas: Cotacoes | null; id: string }> = [];
  const repositorio: RepositorioInvestimentos = {
    async consultarInvestimentos() { return { saldo: '0.00', moeda: 'BRL', acoes_investidas: '0.00', posicoes: [], transferencias: [] }; },
    async consultarMoedaPrincipal() { return moeda; },
    async transferirInvestimento(direcao, centavos, moedaPrincipal, taxas, id) {
      chamadas.push({ direcao, centavos, moeda: moedaPrincipal, taxas, id });
      return { id, direcao, valor_origem: '10.00', moeda_origem: moedaPrincipal,
        valor_destino: '51.00', moeda_destino: 'BRL', cotacao_em: null };
    },
    async comprarAtivo() {},
    async venderAtivo() {},
  };
  return { repositorio, chamadas };
}

test('transferência com conta principal em USD pede câmbio e envia somente valor e direção ao repositório', async () => {
  const { repositorio, chamadas } = criarRepositorio('USD');
  let buscas = 0;
  const servico = new Investimentos(repositorio, async () => { buscas++; return cotacoes; });
  const resultado = await servico.transferir('PARA_INVESTIMENTOS', '10.00', requisicaoId);
  assert.equal(buscas, 1);
  assert.deepEqual(chamadas, [{ direcao: 'PARA_INVESTIMENTOS', centavos: 1000n,
    moeda: 'USD', taxas: cotacoes, id: requisicaoId }]);
  assert.equal(resultado.conta.moeda, 'BRL');
});

test('transferência em BRL dispensa API de câmbio e rejeita entradas inválidas', async () => {
  const { repositorio, chamadas } = criarRepositorio('BRL');
  const servico = new Investimentos(repositorio, async () => { throw new Error('não deve consultar câmbio'); });
  await servico.transferir('PARA_PRINCIPAL', '0.01', requisicaoId);
  assert.equal(chamadas[0]?.taxas, null);
  await assert.rejects(() => servico.transferir('PARA_PRINCIPAL', '0', requisicaoId));
  await assert.rejects(() => servico.transferir('OUTRA', '1.00', requisicaoId));
  await assert.rejects(() => servico.transferir('PARA_INVESTIMENTOS', '1.00', 'id-invalido'));
  assert.equal(chamadas.length, 1);
});
