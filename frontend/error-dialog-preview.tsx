import { useRef, useState } from 'react';
import { ArrowRightLeft, CloudOff, Clock, UserRoundX, Wallet } from 'lucide-react';
import { ErrorDialog, type ErrorDialogProps } from '@/components/ui/error-dialog';
import type { Theme } from '@/lib/theme';
import { mapAccountError } from './account-errors';
import './error-dialog-preview.css';

type Example = Pick<ErrorDialogProps, 'title' | 'description' | 'variant' | 'icon' | 'details' | 'actionLabel'> & {
  target?: 'value' | 'key';
};

const examples: Example[] = [
  {
    title: 'Saldo insuficiente',
    description: 'O valor informado é maior que seu saldo disponível.',
    icon: Wallet,
    details: [{ label: 'Valor solicitado', value: 'R$ 250,00' }, { label: 'Saldo disponível', value: 'R$ 100,00' }],
    actionLabel: 'Alterar valor', target: 'value',
  },
  {
    title: 'Destinatário não encontrado',
    description: 'Não encontramos uma conta com essa chave Pix. Confira o e-mail informado.',
    icon: UserRoundX,
    details: [{ label: 'Chave informada', value: 'pessoa@exemplo.com' }],
    actionLabel: 'Corrigir chave', target: 'key',
  },
  {
    ...mapAccountError('Não foi possível consultar a API de câmbio.', { operation: 'conversion' }),
    icon: ArrowRightLeft,
  },
  {
    ...mapAccountError(new TypeError('Failed to fetch'), { operation: 'conversion', outcome: 'unconfirmed' }),
    icon: Clock,
  },
  {
    ...mapAccountError('Valor inferior a um centavo na moeda de destino', { operation: 'conversion' }),
    icon: ArrowRightLeft,
  },
  {
    title: 'Não conseguimos carregar os dados',
    description: 'Houve uma falha ao carregar as informações da sua conta.',
    variant: 'warning', icon: CloudOff, actionLabel: 'Recarregar',
  },
];

/** Development-only gallery. Examples never call the account API. */
export function ErrorDialogPreview() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const valueRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const example = examples[selected ?? 0];

  return <main className="error-preview" data-theme={theme}>
    <div className="error-preview-container">
      <header className="error-preview-header">
        <a href="/" className="error-preview-brand" aria-label="Voltar para a Tivvo">ti<span>vv</span>o</a>
        <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          Usar tema {theme === 'dark' ? 'claro' : 'escuro'}
        </button>
      </header>
      <h1>Prévia dos popups de erro</h1>
      <p>Escolha um exemplo para testar. Os dados são fictícios e nenhuma operação é enviada.</p>
      <section className="error-preview-examples" aria-label="Exemplos de erro">
        {examples.map((item, index) => <button type="button" key={item.title} onClick={() => { setFeedback(''); setSelected(index); }}>
          <strong>{item.title}</strong><span>Abrir popup</span>
        </button>)}
      </section>
      <section className="error-preview-fields" aria-labelledby="preview-fields-title">
        <h2 id="preview-fields-title">Teste do retorno ao formulário</h2>
        <p>“Alterar valor” e “Corrigir chave” levam o foco aos campos abaixo, preservando o que você digitou. Os valores dos exemplos acima são fixos.</p>
        <label htmlFor="preview-key">Chave Pix de exemplo</label>
        <input ref={keyRef} id="preview-key" type="email" defaultValue="pessoa@exemplo.com" />
        <label htmlFor="preview-value">Valor de exemplo (R$)</label>
        <input ref={valueRef} id="preview-value" type="text" inputMode="decimal" defaultValue="250,00" />
      </section>
      <p className="error-preview-feedback" role="status">{feedback}</p>
      <p>Teste também fechar pelo X ou Escape, navegar com Tab e reduzir a largura da janela.</p>
      <ErrorDialog
        {...example}
        open={selected !== null}
        theme={theme}
        onClose={() => setSelected(null)}
        onAction={() => {
          if (example.target === 'value') valueRef.current?.focus();
          if (example.target === 'key') keyRef.current?.focus();
          setFeedback(example.actionLabel === 'Recarregar'
            ? 'Recarregamento simulado. Nenhuma requisição foi enviada.'
            : `Ação testada: ${example.actionLabel}.`);
        }}
      />
    </div>
  </main>;
}
