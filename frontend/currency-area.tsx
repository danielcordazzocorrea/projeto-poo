import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRightLeft, Check } from 'lucide-react';
import { formatarMoeda, NOMES_MOEDAS, type Conta, type SaldoMoeda, type TipoMoeda } from './moedas';

type Props = {
  conta: Conta | null;
  loading: boolean;
  onSave: (moeda: TipoMoeda) => Promise<void>;
  onSimulate: (valor: string, moeda: TipoMoeda) => Promise<SaldoMoeda>;
  onTransfer: (chave: string, valor: string) => Promise<SaldoMoeda>;
};
const tipos = Object.keys(NOMES_MOEDAS) as TipoMoeda[];
const decimal = '(0|[1-9][0-9]*)([.,][0-9]{1,2})?';

function OpcoesMoedas() {
  return tipos.map(tipo => <option value={tipo} key={tipo}>{NOMES_MOEDAS[tipo]} ({tipo})</option>);
}

export function CurrencyArea({ conta, loading, onSave, onSimulate, onTransfer }: Props) {
  const [preferencia, setPreferencia] = useState<TipoMoeda>(conta?.tipo_moeda ?? 'BRL');
  const [simulacaoMoeda, setSimulacaoMoeda] = useState<TipoMoeda>('USD');
  const [simulacaoValor, setSimulacaoValor] = useState('100.00');
  const [previa, setPrevia] = useState<SaldoMoeda | null>(null);
  const [chave, setChave] = useState('');
  const [valor, setValor] = useState('');
  const [comprovante, setComprovante] = useState<SaldoMoeda | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const disponivel = !!conta?.tipo_moeda && Array.isArray(conta.saldos_moedas);
  const bloqueado = loading || ocupado || !disponivel;
  useEffect(() => { setPreferencia(conta?.tipo_moeda ?? 'BRL'); }, [conta?.tipo_moeda]);

  async function executar(event: FormEvent, acao: () => Promise<void>) {
    event.preventDefault();
    if (bloqueado) return;
    setOcupado(true); setErro(null); setSalvo(false);
    try { await acao(); }
    catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível concluir a operação.'); }
    finally { setOcupado(false); }
  }

  return <div className="account-currencies">
    <p className="account-detail-intro">Receba em real, dólar ou bitcoin. Todos os valores e as cotações são simulados.</p>
    {!disponivel && <p className="account-notice" role="status">{loading ? 'Carregando suas moedas…' : 'As moedas ainda não estão disponíveis nesta conta. Tente atualizar os dados em instantes.'}</p>}
    <div className="account-currency-grid">
      <form className="account-pix-form account-currency-panel" onSubmit={event => void executar(event, async () => {
        await onSave(preferencia); setSalvo(true);
      })}>
        <h2>Como você quer receber?</h2>
        <p className="account-pix-note">As transferências com conversão chegam na moeda escolhida. Seus saldos atuais são preservados.</p>
        <label htmlFor="receiving-currency">Moeda de recebimento</label>
        <select id="receiving-currency" value={preferencia} disabled={bloqueado} onChange={event => { setPreferencia(event.target.value as TipoMoeda); setSalvo(false); }}><OpcoesMoedas /></select>
        <button className="account-pix-submit" disabled={bloqueado || preferencia === conta?.tipo_moeda}>Salvar moeda</button>
        {salvo && <p className="account-currency-success" role="status"><Check size={16} aria-hidden />Moeda de recebimento atualizada.</p>}
        <p className="account-pix-note">Sua chave para receber: <strong>{conta?.chave_pix ?? 'Indisponível'}</strong></p>
      </form>

      <form className="account-pix-form account-currency-panel" onSubmit={event => void executar(event, async () => {
        setPrevia(null); setPrevia(await onSimulate(simulacaoValor.replace(',', '.'), simulacaoMoeda));
      })}>
        <h2>Simular câmbio</h2>
        <label htmlFor="simulation-value">Valor em reais</label>
        <div className="account-pix-value"><span>R$</span><input id="simulation-value" inputMode="decimal" pattern={decimal} value={simulacaoValor} required disabled={bloqueado} onChange={event => { setSimulacaoValor(event.target.value); setPrevia(null); }} /></div>
        <label htmlFor="simulation-currency">Converter para</label>
        <select id="simulation-currency" value={simulacaoMoeda} disabled={bloqueado} onChange={event => { setSimulacaoMoeda(event.target.value as TipoMoeda); setPrevia(null); }}><OpcoesMoedas /></select>
        <button className="account-pix-submit" disabled={bloqueado}>Calcular conversão</button>
        {previa && <p className="account-conversion-result" role="status">Valor estimado <strong>{formatarMoeda(previa.saldo, previa.tipo_moeda)}</strong></p>}
        <p className="account-pix-note">Esta simulação não movimenta saldo. A taxa é recalculada no envio.</p>
      </form>

      <form className="account-pix-form account-currency-panel account-currency-transfer" onSubmit={event => void executar(event, async () => {
        setComprovante(null);
        const recebido = await onTransfer(chave, valor.replace(',', '.'));
        setComprovante(recebido); setChave(''); setValor('');
      })}>
        <h2><ArrowRightLeft size={20} aria-hidden />Enviar com conversão</h2>
        <p className="account-pix-note">Você envia reais do seu saldo BRL. O destinatário recebe na moeda que escolheu na própria conta.</p>
        <label htmlFor="currency-transfer-key">Chave do destinatário (e-mail)</label>
        <input id="currency-transfer-key" type="email" autoComplete="email" value={chave} required maxLength={255} disabled={bloqueado} placeholder="amigo@exemplo.com" onChange={event => { setChave(event.target.value); setComprovante(null); }} />
        <label htmlFor="currency-transfer-value">Valor a enviar em reais</label>
        <div className="account-pix-value"><span>R$</span><input id="currency-transfer-value" inputMode="decimal" pattern={decimal} value={valor} required disabled={bloqueado} placeholder="0,00" onChange={event => { setValor(event.target.value); setComprovante(null); }} /></div>
        <button className="account-pix-submit" disabled={bloqueado}>{ocupado ? 'Processando…' : 'Enviar com conversão'}</button>
        {comprovante && <p className="account-conversion-result" role="status">Transferência concluída. O destinatário recebeu <strong>{formatarMoeda(comprovante.saldo, comprovante.tipo_moeda)}</strong></p>}
        <p className="account-pix-note">Confira o e-mail e o valor antes de enviar. USD e BTC recebidos ficam disponíveis para consulta nesta versão.</p>
      </form>
    </div>
    {erro && <p className="account-notice" role="alert">{erro}</p>}
  </div>;
}
