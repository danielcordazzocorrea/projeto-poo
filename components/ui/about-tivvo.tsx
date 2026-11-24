import { t } from '@/frontend/idioma';
import { useId, useRef } from 'react';
import { ArrowRightLeft, ChartNoAxesCombined, History, ScanLine, UserRound, X } from 'lucide-react';

type AboutTivvoProps = {
  triggerClassName?: string;
  theme?: 'light' | 'dark';
};

export function AboutTivvo({ triggerClassName, theme = 'dark' }: AboutTivvoProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dialogId = useId();

  return <>
    <button
      type="button"
      className={`tivvo-about-trigger ${triggerClassName ?? ''}`}
      aria-haspopup="dialog"
      aria-controls={dialogId}
      onClick={() => dialogRef.current?.showModal()}
    >{t("Quem somos")}</button>
    <dialog ref={dialogRef} id={dialogId} className={`tivvo-about tivvo-about--${theme}`} aria-labelledby={titleId}>
      <div className="tivvo-about-heading">
        <span className="tivvo-about-brand">ti<span>vv</span>o</span>
        <button type="button" className="tivvo-about-close" aria-label={t("Fechar quem somos")} onClick={() => dialogRef.current?.close()}><X size={21} aria-hidden /></button>
      </div>
      <h2 id={titleId}>{t("Quem somos")}</h2>
      <p className="tivvo-about-lead">{t("Um espaço para conhecer, explorar e aprender.")}</p>
      <p>{t("A tivvo é um projeto acadêmico que simula a experiência de uma corretora. Nosso objetivo é tornar mais simples entender como uma conta e uma plataforma de investimentos funcionam.")}</p>
      <h3>{t("O que você encontra por aqui")}</h3>
      <dl className="tivvo-about-features">
        <div><UserRound size={22} aria-hidden /><div><dt>{t("Sua conta")}</dt><dd>{t("Crie seu cadastro, consulte seus dados e acompanhe o saldo simulado.")}</dd></div></div>
        <div><ChartNoAxesCombined size={22} aria-hidden /><div><dt>{t("Investimentos")}</dt><dd>{t("Transfira saldo para sua conta de investimentos, pesquise ativos, consulte cotações e gráficos de preços e compre ou venda ativos para montar sua carteira simulada.")}</dd></div></div>
        <div><ArrowRightLeft size={22} aria-hidden /><div><dt>{t("Moedas")}</dt><dd>{t("Converta seu saldo simulado entre real, dólar e euro com uma cotação de referência e confira os detalhes no comprovante.")}</dd></div></div>
        <div><ScanLine size={22} aria-hidden /><div><dt>Pix</dt><dd>{t("Envie e receba saldo simulado entre contas tivvo usando uma chave Pix de e-mail, com conversão automática entre as moedas das contas e comprovante de envio.")}</dd></div></div>
        <div><History size={22} aria-hidden /><div><dt>{t("Histórico de transações")}</dt><dd>{t("Acompanhe os Pix enviados e recebidos, as conversões de moeda e as compras e vendas de ativos, com filtros para consultar as transações mais recentes.")}</dd></div></div>
      </dl>
      <p className="tivvo-about-note">{t("Este é um ambiente de demonstração: não movimentamos dinheiro real e os valores apresentados são simulados.")}</p>
      <button type="button" className="tivvo-about-done" onClick={() => dialogRef.current?.close()}>{t("Voltar para a tivvo")}</button>
    </dialog>
  </>;
}
