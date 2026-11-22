export const RESPOSTA_FORA_DO_ESCOPO = 'Posso ajudar apenas com a sua conta tivvo e assuntos bancários, como saldo, Pix, histórico, moedas e investimentos.';
export const RESPOSTA_SIMULACAO_INDISPONIVEL = 'Não faço simulações de operações. Posso consultar seus saldos, histórico e investimentos ou preparar um Pix para você conferir e confirmar.';

export function pedidoDeSimulacao(texto: string): boolean {
  return /\bsimul\w*|\bpr[eé]via\b|\bestimativa\b|\bproje[cç][aã]o\b|\bquanto (?:eu )?(?:pagaria|receberia|gastaria|ficaria)\b/i.test(texto);
}

// Esta primeira barreira evita enviar pedidos claramente alheios ao banco à IA.
// Pedidos que passam por ela ainda são classificados antes de qualquer consulta à conta.
export function assuntoBancarioPossivel(texto: string): boolean {
  return /saldo|pix|banc|conta|tivvo|dinheiro|extrato|hist[oó]ric|transa[cç]|movimenta[cç]|transfer[eê]nc|invest|carteira|posi[cç][aã]o|cota[cç][aã]o|rendiment|rentabilid|lucro|preju[ií]zo|patrim[oô]nio|a[cç][aõ]es|ativo|a[cç][aã]o|moeda|c[aâ]mbio|convers[aã]o|dep[oó]sito|pagamento|comprovante|recebi|enviei|gastei|quanto (?:eu )?tenho|\b[A-Z]{4}\d{1,2}\b/i.test(texto);
}

type MensagemEscopo = { role: 'user' | 'assistant'; content: string };

// Respostas como "sim" dependem da última oferta da assistente. Ela é usada
// apenas como contexto para a classificação, nunca como autorização para sair do banco.
export function contextoBancarioDaResposta(mensagens: readonly MensagemEscopo[]): string | null {
  const atual = mensagens.at(-1);
  const anterior = mensagens.at(-2);
  if (atual?.role !== 'user' || anterior?.role !== 'assistant'
    || anterior.content === RESPOSTA_FORA_DO_ESCOPO
    || !assuntoBancarioPossivel(anterior.content)) return null;
  return anterior.content;
}
