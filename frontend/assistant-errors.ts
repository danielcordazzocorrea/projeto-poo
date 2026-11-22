export function mensagemErroAssistente(status?: number): string {
  if (status === 401 || status === 403) return 'Sua sessão expirou. Entre novamente na conta para conversar com a assistente.';
  return 'Não consegui responder agora. Tente novamente em instantes.';
}
