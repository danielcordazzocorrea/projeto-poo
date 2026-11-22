import { Dinheiro, Quantidade, RegraDeNegocio } from '../supabase/functions/_shared/dominio.ts';

export type PurchaseReview = {
  codigo: string;
  quantidade: string;
  precoUnitario: string;
  total: string;
  saldoAntes: string;
  saldoDepois: string;
  cotacaoEm: string | null;
};

export function prepararRevisaoCompra(codigo: string, quantidadeInformada: string, precoInformado: string,
  saldoInformado: string, cotacaoEm: string | null): PurchaseReview {
  const quantidade = Quantidade.positiva(quantidadeInformada);
  const preco = Dinheiro.positivo(precoInformado);
  const total = preco.multiplicar(quantidade, 'cima');
  if (!/^\d+\.\d{2}$/.test(saldoInformado)) throw new RegraDeNegocio('Saldo de investimentos indisponível. Atualize a conta.');
  const saldo = Dinheiro.doBanco(saldoInformado.replace('.', ''));
  if (!saldo.cobre(total)) throw new RegraDeNegocio('Saldo insuficiente na conta de investimentos.');
  return {
    codigo, quantidade: quantidade.formatar(), precoUnitario: preco.formatar(),
    total: total.formatar(), saldoAntes: saldo.formatar(), saldoDepois: saldo.subtrair(total).formatar(),
    cotacaoEm,
  };
}
