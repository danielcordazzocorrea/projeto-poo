/** Pure presentation data: no React, requests, navigation or login validation. */
export type AccountErrorOperation = 'pix' | 'conversion' | 'investment-transfer' | 'account' | 'market';
export type AccountErrorAction = 'close' | 'edit-value' | 'edit-key' | 'select-currency' | 'check-balances' | 'reload' | 'edit-search' | 'sign-in';
export type AccountErrorIcon = 'alert' | 'wallet' | 'recipient' | 'exchange' | 'connection' | 'clock' | 'search';

export type AccountErrorNotice = {
  title: string;
  description: string;
  variant: 'error' | 'warning';
  icon: AccountErrorIcon;
  action: AccountErrorAction;
  actionLabel: string;
};

export type AccountErrorContext = {
  operation: AccountErrorOperation;
  /** Use unconfirmed after a lost response or a failure following a successful write.
   * Only use rejected when the operation is known not to have completed. */
  outcome?: 'rejected' | 'unconfirmed';
};

const actionLabels: Record<AccountErrorAction, string> = {
  close: 'Entendi', 'edit-value': 'Alterar valor', 'edit-key': 'Corrigir chave',
  'select-currency': 'Escolher moeda', 'check-balances': 'Conferir saldos',
  reload: 'Recarregar', 'edit-search': 'Revisar busca', 'sign-in': 'Entrar novamente',
};

function notice(title: string, description: string, icon: AccountErrorIcon = 'alert',
  action: AccountErrorAction = 'close', variant: AccountErrorNotice['variant'] = 'error'): AccountErrorNotice {
  return { title, description, icon, action, actionLabel: actionLabels[action], variant };
}

function normalize(message: string): string {
  return message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[.!]+$/, '');
}

// Accept raw Error instances, strings and API response bodies. Never display raw technical errors.
function readError(error: unknown): { message: string; code: string } {
  if (typeof error === 'string') return { message: normalize(error), code: '' };
  if (!error || typeof error !== 'object') return { message: '', code: '' };
  const body = error as { erro?: unknown; message?: unknown; codigo?: unknown };
  const message = typeof body.erro === 'string' ? body.erro : body.message;
  return { message: typeof message === 'string' ? normalize(message) : '', code: typeof body.codigo === 'string' ? body.codigo : '' };
}

function unconfirmed(operation: AccountErrorOperation): AccountErrorNotice {
  const title = operation === 'pix' ? 'Não foi possível confirmar o Pix'
    : operation === 'conversion' ? 'Não foi possível confirmar a conversão'
      : 'Não foi possível confirmar a transferência';
  return notice(title, 'Confira os saldos e o histórico antes de tentar novamente.', 'clock', 'check-balances', 'warning');
}

/** Pass the original error, before adding prefixes such as "Não foi possível enviar o Pix".
 * Exact known messages are temporary aliases until the account API supplies stable codes.
 * Action/icon identifiers are interpreted by the screen when integrating ErrorDialog.
 * Unknown write failures remain unconfirmed unless the caller explicitly knows they were rejected.
 */
export function mapAccountError(error: unknown, context: AccountErrorContext): AccountErrorNotice {
  const { operation, outcome } = context;
  const writing = operation === 'pix' || operation === 'conversion' || operation === 'investment-transfer';
  if (writing && outcome === 'unconfirmed') return unconfirmed(operation);
  const { message, code } = readError(error);
  const matches = (...messages: string[]) => messages.some(candidate => normalize(candidate) === message);

  if (matches('Sessão inválida. Entre novamente.', 'Autenticação obrigatória',
    'Entre na conta para enviar um Pix.', 'Entre na conta para converter o saldo.', 'Entre na conta para transferir.')) {
    return notice('Entre novamente', 'Sua sessão não está disponível. Entre na conta para continuar.', 'alert', 'sign-in', 'warning');
  }

  if (operation === 'pix') {
    if (matches('Conta de destino não encontrada', 'Chave Pix não encontrada', 'Conta Pix não encontrada')) {
      return notice('Destinatário não encontrado', 'Não encontramos uma conta com essa chave Pix. Confira o e-mail informado.', 'recipient', 'edit-key');
    }
    if (matches('Chave Pix inválida', 'Chave de destino inválida')) {
      return notice('Confira a chave Pix', 'Informe um e-mail válido como chave Pix de destino.', 'recipient', 'edit-key');
    }
    if (matches('Não é possível enviar Pix para a própria chave', 'Não é possível transferir para a própria conta')) {
      return notice('Escolha outro destinatário', 'Você informou a chave da sua própria conta. Informe a chave de outra pessoa.', 'recipient', 'edit-key');
    }
  }

  if (operation === 'pix' || operation === 'investment-transfer') {
    if (matches('Saldo insuficiente', 'Saldo insuficiente na conta principal', 'Saldo insuficiente na conta de investimentos')) {
      const source = matches('Saldo insuficiente na conta principal') ? 'na conta principal'
        : matches('Saldo insuficiente na conta de investimentos') ? 'na conta de investimentos' : 'na conta de origem';
      return notice('Saldo insuficiente', `O valor informado é maior que o saldo disponível ${source}.`, 'wallet', 'edit-value');
    }
    if (matches('Valor inválido', 'Valor deve ser um decimal positivo em texto', 'Valor aceita até 2 casas decimais', 'Valor está fora do limite permitido')) {
      return notice('Confira o valor', 'Informe um valor maior que zero, com até duas casas decimais e dentro do limite permitido.', 'wallet', 'edit-value');
    }
    if (matches('Valor inferior a um centavo na moeda de destino')) {
      return notice('Valor muito baixo', 'Após a conversão, o valor precisa representar pelo menos um centavo na moeda de destino.', 'wallet', 'edit-value');
    }
  }

  if (operation === 'conversion' && matches('O saldo já está nesta moeda', 'Selecione uma moeda de destino diferente', 'Moeda deve ser BRL, USD ou EUR')) {
    return notice('Confira a moeda de destino', 'Escolha uma moeda disponível diferente da moeda atual do saldo.', 'exchange', 'select-currency');
  }
  if (operation === 'conversion' && matches('Valor inferior a um centavo na moeda de destino')) {
    return notice('Saldo muito baixo para converter', 'O saldo convertido seria inferior a um centavo. Escolha outra moeda ou aguarde até ter saldo suficiente.', 'exchange', 'select-currency');
  }
  if (writing && matches('Moeda da conta mudou. Atualize e tente novamente')) {
    return notice('O saldo foi atualizado', 'A moeda da conta mudou. Recarregue os dados antes de continuar.', 'exchange', 'reload', 'warning');
  }
  if (writing && matches('Limite de saldo excedido', 'Limite de saldo excedido para a conta destinatária')) {
    return notice('Limite de saldo excedido', 'Esta operação ultrapassa o limite de saldo permitido para uma das contas.', 'wallet');
  }

  // Currency lookup failures happen before the write. Do not treat arbitrary server errors as refusals.
  if (writing && (matches('Não foi possível consultar a API de câmbio', 'Resposta inválida da API de câmbio',
    'Serviço de câmbio não configurado', 'Cotação inválida', 'Cotação inválida ou desatualizada', 'Cotação pequena demais')
    || /^api de cambio indisponivel \(http \d{3}\)$/.test(message)
    || /^cotacao de (brl|usd|eur) (invalida|fora do limite)$/.test(message))) {
    return notice('Cotação indisponível', 'Não conseguimos consultar uma cotação válida agora. Tente novamente em instantes.', 'exchange', 'close', 'warning');
  }

  if (operation === 'account') {
    return notice('Não conseguimos carregar os dados', 'Houve uma falha ao carregar as informações da sua conta.', 'connection', 'reload', 'warning');
  }
  if (operation === 'market') {
    if (code === 'LIMITE_BRAPI' || matches('Limite de consultas atingido. Tente novamente mais tarde')) {
      return notice('Limite de consultas atingido', 'Aguarde um pouco antes de consultar o mercado novamente.', 'clock', 'close', 'warning');
    }
    if (code === 'ATIVO_NAO_ENCONTRADO' || matches('Ativo não encontrado', 'Cotação não encontrada para o ticker solicitado',
      'Ativo não encontrado entre ações, ETFs e FIIs identificados pelo provedor')) {
      return notice('Ativo não encontrado', 'Confira o código do ativo e faça uma nova busca.', 'search', 'edit-search');
    }
    if (code === 'BUSCA_INVALIDA' || code === 'TICKER_INVALIDO' || matches('Digite entre 2 e 80 caracteres', 'Ticker inválido')) {
      return notice('Confira sua busca', 'Informe um termo entre 2 e 80 caracteres ou revise o código do ativo selecionado.', 'search', 'edit-search');
    }
    return notice('Consulta indisponível', 'Não conseguimos consultar os dados de mercado agora. Tente novamente em instantes.', 'connection', 'reload', 'warning');
  }

  if (writing && outcome !== 'rejected') return unconfirmed(operation);
  const title = operation === 'pix' ? 'Não foi possível enviar o Pix'
    : operation === 'conversion' ? 'Não foi possível converter' : 'Não foi possível transferir';
  return notice(title, 'Não foi possível concluir esta operação. Confira os dados informados.', 'alert');
}
