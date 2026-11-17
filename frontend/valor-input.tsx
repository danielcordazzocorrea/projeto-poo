import type { InputHTMLAttributes } from 'react';
import { digitosParaValor, exibirValorMonetario } from './valor-monetario';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: string;
  onValueChange: (valor: string) => void;
};

export function ValorInput({ value, onValueChange, ...props }: Props) {
  return <input {...props} type="text" inputMode="numeric" autoComplete="off"
    value={exibirValorMonetario(value)}
    onChange={event => {
      const valor = digitosParaValor(event.target.value);
      if (valor !== null) onValueChange(valor);
      const input = event.currentTarget;
      requestAnimationFrame(() => {
        if (document.activeElement === input) input.setSelectionRange(input.value.length, input.value.length);
      });
    }} />;
}
