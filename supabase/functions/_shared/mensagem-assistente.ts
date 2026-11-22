import { RegraDeNegocio } from './dominio.ts';

export function lerPerguntaAssistente(dados: Record<string, unknown>): string {
  // Compatibilidade temporária com o cliente antigo: só a última pergunta é
  // aproveitada. O histórico enviado pelo navegador nunca vira memória confiável.
  const antiga = Array.isArray(dados.mensagens) ? dados.mensagens.at(-1) : null;
  const valor = dados.mensagem ?? (antiga && typeof antiga === 'object' && antiga.role === 'user' ? antiga.content : null);
  if (typeof valor !== 'string' || !valor.trim() || valor.length > 2000) {
    throw new RegraDeNegocio('Envie uma pergunta de até 2000 caracteres.');
  }
  return valor.trim();
}
