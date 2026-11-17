import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function SaldoDisponivel({ id, rotulo = 'Saldo disponível', saldo, className = 'account-operation-balance' }: {
  id?: string;
  rotulo?: string;
  saldo: string;
  className?: string;
}) {
  const [visivel, setVisivel] = useState(true);
  return <div id={id} className={`${className} operation-balance-toggle`}>
    <span>{rotulo}: <strong aria-live="polite">{visivel ? saldo : '••••••'}</strong></span>
    <button type="button" className="operation-balance-visibility" aria-label={`${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLocaleLowerCase('pt-BR')}`}
      title={visivel ? 'Ocultar saldo' : 'Mostrar saldo'} aria-pressed={!visivel}
      onClick={() => setVisivel(valor => !valor)}>
      {visivel ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
    </button>
  </div>;
}
