import { LiveOrb as Orb } from '@/components/ui/live-orb';
import type { Theme } from '@/lib/theme';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send, Trash2, X } from 'lucide-react';
import { formatarSaldo, type PixReceipt, type TipoMoeda } from './moeda';
import { mensagemErroAssistente } from './assistant-errors';

const orbColors = {
  light: { clouds: ['#83c96e', '#ffffff', '#b8ef91'], eyes: '#172b1d' },
  dark: { clouds: ['#4c9330', '#0c0d0c', '#14291e'], eyes: '#f4f6f2' },
} as const;

type PixDraft = { chave_destino: string; valor: string; moeda: TipoMoeda };
type ChatMessage = { role: 'user' | 'assistant'; content: string; pix?: PixDraft | null; sent?: boolean };
type ChatResponse = { resposta: string; pix: PixDraft | null };

export function LiveOrb({ theme, token, onPixTransfer }: {
  theme: Theme; token: string; onPixTransfer: (key: string, value: string) => Promise<PixReceipt>;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://pzaakefnbhwlhatgzgea.supabase.co';
  const apiKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();

  async function loadHistory(): Promise<ChatMessage[] | null> {
    setLoadingHistory(true);
    setHistoryError(false);
    try {
      const response = await fetch(`${url}/functions/v1/corretora/assistente/historico`, {
        headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('mensagens' in body) || !Array.isArray(body.mensagens)
        || !body.mensagens.every((item: unknown) => item && typeof item === 'object'
          && 'role' in item && (item.role === 'user' || item.role === 'assistant')
          && 'content' in item && typeof item.content === 'string')) throw new Error();
      const saved = body.mensagens as ChatMessage[];
      setMessages(saved);
      return saved;
    } catch {
      setHistoryError(true);
      return null;
    } finally { setLoadingHistory(false); }
  }

  useEffect(() => { void loadHistory(); }, []);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy, open]);

  function close() { setOpen(false); trigger.current?.focus(); }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy || confirming || loadingHistory || historyError) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setQuestion('');
    setBusy(true);
    try {
      const response = await fetch(`${url}/functions/v1/corretora/assistente`, {
        method: 'POST', headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: text }),
      });
      if (!response.ok) throw new Error(mensagemErroAssistente(response.status));
      const body: ChatResponse = await response.json();
      if (typeof body.resposta !== 'string' || !body.resposta.trim()) throw new Error(mensagemErroAssistente());
      setMessages(current => [...current, { role: 'assistant', content: body.resposta, pix: body.pix }]);
    } catch (error) {
      const saved = await loadHistory();
      if (saved?.at(-2)?.role === 'user' && saved.at(-2)?.content === text
        && saved.at(-1)?.role === 'assistant') return;
      const content = error instanceof Error && error.message === mensagemErroAssistente(401)
        ? error.message : mensagemErroAssistente();
      setMessages(current => [...current, { role: 'assistant', content }]);
    } finally { setBusy(false); input.current?.focus(); }
  }

  async function clearHistory() {
    if (busy || confirming || loadingHistory || !messages.length
      || !window.confirm('Apagar toda a conversa salva da sua conta?')) return;
    setBusy(true);
    try {
      const response = await fetch(`${url}/functions/v1/corretora/assistente/historico`, {
        method: 'DELETE', headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      setMessages([]);
      setHistoryError(false);
    } catch {
      setMessages(current => [...current, { role: 'assistant', content: 'Não consegui apagar a conversa agora. Tente novamente.' }]);
    } finally { setBusy(false); }
  }

  async function confirmPix(index: number, pix: PixDraft) {
    if (busy || confirming) return;
    setConfirming(true);
    // Um resultado de rede ambíguo não deve oferecer um segundo envio do mesmo rascunho.
    setMessages(current => current.map((message, position) => position === index ? { ...message, sent: true } : message));
    try {
      const receipt = await onPixTransfer(pix.chave_destino, pix.valor);
      setMessages(current => [...current,
        { role: 'assistant', content: `Pix simulado enviado para ${pix.chave_destino}. ${receipt ? `Destinatário recebeu ${formatarSaldo(receipt.valor_recebido, receipt.moeda_recebida)}.` : ''}` }]);
    } catch {
      setMessages(current => [...current, { role: 'assistant', content: 'Não consegui confirmar o Pix. Confira o histórico antes de tentar novamente.' }]);
    } finally { setConfirming(false); }
  }

  return <aside className="live-orb">
    {open && <section id="tivvo-chat" className="mascot-chat" role="dialog" aria-modal="false" aria-labelledby="tivvo-chat-title"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className="mascot-chat-header">
        <span className="mascot-chat-icon"><MessageCircle size={20} aria-hidden /></span>
        <div><h2 id="tivvo-chat-title">Converse com a tivvo</h2><p>Assistente da sua conta simulada</p></div>
        <div className="mascot-chat-actions">
          <button type="button" onClick={() => void clearHistory()} aria-label="Apagar conversa" title="Apagar conversa"
            disabled={busy || confirming || loadingHistory || !messages.length}><Trash2 size={17} aria-hidden /></button>
          <button type="button" onClick={close} aria-label="Fechar chat"><X size={19} aria-hidden /></button>
        </div>
      </header>
      <div className="mascot-chat-messages" role="log" aria-label="Mensagens do chat" aria-live="polite">
        <p className="mascot-chat-message mascot-chat-message-assistant">Olá! Posso consultar seu saldo, histórico e investimentos, ou preparar um Pix para você confirmar.</p>
        {messages.map((message, index) => <div key={index} className={`mascot-chat-message mascot-chat-message-${message.role}`}>
          <span className="sr-only">{message.role === 'user' ? 'Você: ' : 'Assistente: '}</span>{message.content}
          {message.pix && <div className="mascot-chat-pix">
            <strong>Pix simulado · {formatarSaldo(message.pix.valor, message.pix.moeda)}</strong>
            <span>Para {message.pix.chave_destino}</span>
            <button type="button" disabled={message.sent || busy || confirming} onClick={() => void confirmPix(index, message.pix!)}>
              {message.sent ? 'Pix enviado' : confirming ? 'Enviando…' : 'Confirmar envio do Pix'}
            </button>
          </div>}
        </div>)}
        {loadingHistory && <p className="mascot-chat-message mascot-chat-message-assistant" role="status">Carregando sua conversa…</p>}
        {historyError && <div className="mascot-chat-history-error" role="alert">Não consegui carregar a conversa. <button type="button" onClick={() => void loadHistory()}>Tentar novamente</button></div>}
        {busy && <p className="mascot-chat-message mascot-chat-message-assistant" role="status">Consultando sua conta…</p>}
        <div ref={end} />
      </div>
      <p className="mascot-chat-status">Perguntas e respostas salvas na sua conta. Rascunhos de Pix não ficam ativos após recarregar.</p>
      <form className="mascot-chat-composer" onSubmit={event => void send(event)}>
        <label className="sr-only" htmlFor="tivvo-chat-question">Sua pergunta</label>
        <input ref={input} id="tivvo-chat-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} placeholder="Pergunte sobre sua conta…" autoComplete="off" disabled={busy || confirming || loadingHistory || historyError} />
        <button type="submit" disabled={!question.trim() || busy || confirming || loadingHistory || historyError} aria-label="Enviar mensagem"><Send size={18} aria-hidden /></button>
      </form>
    </section>}
    <button ref={trigger} type="button" className="live-orb-trigger" aria-label={open ? 'Fechar chat da tivvo' : 'Abrir chat da tivvo'}
      aria-expanded={open} aria-controls="tivvo-chat" aria-haspopup="dialog" onClick={() => open ? close() : setOpen(true)}>
      <span aria-hidden><Orb className="live-orb-character" variant="webgl" theme={theme}
        colors={[...orbColors[theme].clouds]} eyeColor={orbColors[theme].eyes} /></span>
    </button>
  </aside>;
}
