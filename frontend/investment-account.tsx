import { useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from 'lucide-react';
import { formatarSaldo, type Conta, type TipoMoeda } from './moeda';

export type DirecaoTransferencia = 'PARA_INVESTIMENTOS' | 'PARA_PRINCIPAL';
export type TransferenciaInvestimento = {
  id: string;
  direcao: DirecaoTransferencia;
  valor_origem: string;
  moeda_origem: TipoMoeda;
  valor_destino: string;
  moeda_destino: TipoMoeda;
  cotacao_em: string | null;
  criada_em?: string;
};
export type ContaInvestimento = {
  saldo: string;
  moeda: 'BRL';
  posicoes: Array<{ codigo_ativo: string; quantidade: string }>;
  transferencias: TransferenciaInvestimento[];
};

type Props = {
  principal: Conta | null;
  investimento: ContaInvestimento | null;
  loading: boolean;
  onRefresh: () => void;
  onTransfer: (direcao: DirecaoTransferencia, valor: string) => Promise<TransferenciaInvestimento>;
};

export function InvestmentAccount({ principal, investimento, loading, onRefresh, onTransfer }: Props) {
  const [direcao, setDirecao] = useState<DirecaoTransferencia>('PARA_INVESTIMENTOS');
  const [valor, setValor] = useState('');
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<TransferenciaInvestimento | null>(null);
  const moedaOrigem = direcao === 'PARA_INVESTIMENTOS' ? principal?.moeda_saldo ?? 'BRL' : 'BRL';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setReceipt(null);
    try {
      const result = await onTransfer(direcao, valor.trim().replace(',', '.'));
      setReceipt(result);
      setValor('');
    } catch { /* O aviso compartilhado da conta mostra o erro. */ }
    finally { setSending(false); }
  }

  return <div className="investment-account" aria-busy={loading || sending}>
    <p className="account-detail-intro">Sua conta de investimentos tem saldo próprio em reais. Transfira entre ela e sua conta principal para organizar seu dinheiro simulado.</p>
    <div className="investment-balances">
      <div><span>Conta principal · {principal?.moeda_saldo ?? 'BRL'}</span><strong>{principal ? formatarSaldo(principal.saldo, principal.moeda_saldo) : 'Carregando…'}</strong></div>
      <div><span>Conta de investimentos · BRL</span><strong>{investimento ? formatarSaldo(investimento.saldo, 'BRL') : 'Carregando…'}</strong></div>
    </div>
    <form className="account-pix-form investment-transfer-form" onSubmit={event => void submit(event)}>
      <h2>Transferir entre contas</h2>
      <div className="investment-directions" role="group" aria-label="Direção da transferência">
        <button type="button" className={direcao === 'PARA_INVESTIMENTOS' ? 'is-selected' : ''} aria-pressed={direcao === 'PARA_INVESTIMENTOS'} onClick={() => { setDirecao('PARA_INVESTIMENTOS'); setReceipt(null); }}><ArrowDownToLine size={17} aria-hidden />Para investimentos</button>
        <button type="button" className={direcao === 'PARA_PRINCIPAL' ? 'is-selected' : ''} aria-pressed={direcao === 'PARA_PRINCIPAL'} onClick={() => { setDirecao('PARA_PRINCIPAL'); setReceipt(null); }}><ArrowUpFromLine size={17} aria-hidden />Para conta principal</button>
      </div>
      <label htmlFor="investment-value">Valor em {moedaOrigem}</label>
      <input id="investment-value" type="text" inputMode="decimal" value={valor} onChange={event => setValor(event.target.value)} placeholder="0,00" required disabled={loading || sending || !principal || !investimento} />
      {principal?.moeda_saldo !== 'BRL' && <p className="account-pix-note">A conversão entre {principal?.moeda_saldo} e BRL é automática nesta transferência. O valor convertido será mostrado no comprovante.</p>}
      <button type="submit" className="account-pix-submit" disabled={loading || sending || !principal || !investimento}>{sending && <RefreshCw size={16} className="account-spin" aria-hidden />}{sending ? 'Transferindo…' : 'Confirmar transferência'}</button>
    </form>
    {receipt && <div className="investment-receipt" role="status"><strong>Transferência concluída</strong><span>{formatarSaldo(receipt.valor_origem, receipt.moeda_origem)} → {formatarSaldo(receipt.valor_destino, receipt.moeda_destino)}</span>{receipt.cotacao_em && <small>Cotação consultada em {new Date(receipt.cotacao_em).toLocaleString('pt-BR')}</small>}</div>}
    <div className="investment-history-heading"><h2>Minha carteira</h2></div>
    {investimento?.posicoes.length ? <ul className="investment-history">{investimento.posicoes.map(posicao => <li key={posicao.codigo_ativo}><strong>{posicao.codigo_ativo}</strong><span>{posicao.quantidade} cotas</span></li>)}</ul> : <p className="account-pix-note">Sua carteira ainda não tem ativos.</p>}
    <div className="investment-history-heading"><h2>Transferências recentes</h2><button type="button" className="account-detail-refresh" onClick={onRefresh} disabled={loading || sending}><RefreshCw size={16} className={loading ? 'account-spin' : ''} aria-hidden />Atualizar</button></div>
    {investimento?.transferencias.length ? <ul className="investment-history">{investimento.transferencias.map(item => <li key={item.id}><span><strong>{item.direcao === 'PARA_INVESTIMENTOS' ? 'Para investimentos' : 'Para conta principal'}</strong><small>{item.criada_em ? new Date(item.criada_em).toLocaleString('pt-BR') : 'Transferência concluída'}</small></span><span>{formatarSaldo(item.valor_origem, item.moeda_origem)} → {formatarSaldo(item.valor_destino, item.moeda_destino)}</span></li>)}</ul> : <p className="account-pix-note">Nenhuma transferência ainda.</p>}
    <p className="account-pix-note">Valores e transferências são simulados. As operações de compra e venda serão adicionadas separadamente.</p>
  </div>;
}
