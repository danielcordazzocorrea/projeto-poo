import { useId, useRef } from 'react';
import { ChartNoAxesCombined, ScanLine, UserRound, X } from 'lucide-react';

export function AboutTivvo() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dialogId = useId();

  return <>
    <button
      type="button"
      className="tivvo-about-trigger"
      aria-haspopup="dialog"
      aria-controls={dialogId}
      onClick={() => dialogRef.current?.showModal()}
    >Quem somos</button>
    <dialog ref={dialogRef} id={dialogId} className="tivvo-about" aria-labelledby={titleId}>
      <div className="tivvo-about-heading">
        <span className="tivvo-about-brand">ti<span>vv</span>o</span>
        <button type="button" className="tivvo-about-close" aria-label="Fechar quem somos" onClick={() => dialogRef.current?.close()}><X size={21} aria-hidden /></button>
      </div>
      <h2 id={titleId}>Quem somos</h2>
      <p className="tivvo-about-lead">Um espaço para conhecer, explorar e aprender.</p>
      <p>A tivvo é um projeto acadêmico que simula a experiência de uma corretora. Nosso objetivo é tornar mais simples entender como uma conta e uma plataforma de investimentos funcionam.</p>
      <h3>O que você encontra por aqui</h3>
      <dl className="tivvo-about-features">
        <div><UserRound size={22} aria-hidden /><div><dt>Sua conta</dt><dd>Crie seu cadastro, consulte seus dados e acompanhe o saldo simulado.</dd></div></div>
        <div><ChartNoAxesCombined size={22} aria-hidden /><div><dt>Investimentos <span>Em desenvolvimento</span></dt><dd>Uma área dedicada à consulta de ativos e à construção de uma carteira simulada. As operações ainda não estão disponíveis na interface.</dd></div></div>
        <div><ScanLine size={22} aria-hidden /><div><dt>Pix <span>Em desenvolvimento</span></dt><dd>O espaço para transferências e chaves está em preparação. Ainda não é possível enviar ou receber Pix.</dd></div></div>
      </dl>
      <p className="tivvo-about-note">Este é um ambiente de demonstração: não movimentamos dinheiro real e os valores apresentados são simulados.</p>
      <button type="button" className="tivvo-about-done" onClick={() => dialogRef.current?.close()}>Voltar para a tivvo</button>
    </dialog>
  </>;
}
