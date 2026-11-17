import { LiveOrb as Orb } from '@/components/ui/live-orb';
import type { Theme } from '@/lib/theme';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';

const orbColors = {
  light: { body: '#a9c9a3', eyes: '#172b1d' },
  dark: { body: '#466a4c', eyes: '#f4f6f2' },
} as const;

export function LiveOrb({ theme }: { theme: Theme }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    setMessages(current => [...current, text]);
    setQuestion('');
    input.current?.focus();
  }

  return <aside className="live-orb">
    {open && <section id="tivvo-chat" className="mascot-chat" role="dialog" aria-modal="false" aria-labelledby="tivvo-chat-title"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className="mascot-chat-header">
        <span className="mascot-chat-icon"><MessageCircle size={20} aria-hidden /></span>
        <div><h2 id="tivvo-chat-title">Converse com a tivvo</h2><p>Seu espaço para perguntas</p></div>
        <button type="button" onClick={close} aria-label="Fechar chat"><X size={19} aria-hidden /></button>
      </header>
      <div className="mascot-chat-messages" role="log" aria-label="Mensagens do chat" aria-live="polite">
        <p className="mascot-chat-message mascot-chat-message-assistant">Olá! Você já pode escrever suas perguntas por aqui. As respostas automáticas estarão disponíveis em breve.</p>
        {messages.map((message, index) => <p key={index} className="mascot-chat-message mascot-chat-message-user"><span className="sr-only">Você: </span>{message}</p>)}
        <div ref={end} />
      </div>
      <p className="mascot-chat-status">Respostas automáticas em preparação</p>
      <form className="mascot-chat-composer" onSubmit={send}>
        <label className="sr-only" htmlFor="tivvo-chat-question">Sua pergunta</label>
        <input ref={input} id="tivvo-chat-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} placeholder="Digite sua pergunta…" autoComplete="off" />
        <button type="submit" disabled={!question.trim()} aria-label="Adicionar pergunta ao chat"><Send size={18} aria-hidden /></button>
      </form>
    </section>}
    <button ref={trigger} type="button" className="live-orb-trigger" aria-label={open ? 'Fechar chat da tivvo' : 'Abrir chat da tivvo'}
      aria-expanded={open} aria-controls="tivvo-chat" aria-haspopup="dialog" onClick={() => open ? close() : setOpen(true)}>
      <span aria-hidden><Orb
        className="live-orb-character"
        variant="custom"
        theme={theme}
        color={orbColors[theme].body}
        eyeColor={orbColors[theme].eyes}
      /></span>
    </button>
  </aside>;
}
