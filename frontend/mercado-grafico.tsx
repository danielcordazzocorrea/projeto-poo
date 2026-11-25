import { t } from '@/frontend/idioma';
import { useEffect, useRef, useState } from 'react';
import type { HistoricoAtivo } from '../supabase/functions/_shared/mercado-brapi';
import { PERIODOS_HISTORICO } from '../supabase/functions/_shared/mercado-periodos';

const reais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (data: string) => data.includes('T')
  ? new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : data.split('-').reverse().join('/');
const intervalos = { '5m': '5 minutos', '60m': '1 hora', '1d': '1 dia', '1wk': '1 semana', '1mo': '1 mês' };

export function GraficoAtivo({ historico }: { historico: HistoricoAtivo }) {
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [largura, setLargura] = useState(600);
  const container = useRef<HTMLDivElement>(null);
  const pontos = historico.pontos;
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setLargura(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [pontos.length]);
  if (pontos.length === 0) return <p role="status">{t("Sem histórico disponível para este ativo no período selecionado.")}</p>;
  const valores = pontos.map(ponto => Number(ponto.preco_brl));
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const margem = Math.max((maximo - minimo) * 0.1, maximo * 0.005, 0.01);
  const piso = Math.max(0, minimo - margem);
  const teto = maximo + margem;
  const inicioX = 80;
  const fimX = largura - 20;
  const x = (indice: number) => pontos.length === 1 ? (inicioX + fimX) / 2 : inicioX + indice / (pontos.length - 1) * (fimX - inicioX);
  const y = (valor: number) => 190 - (valor - piso) / (teto - piso) * 170;
  const linha = valores.map((valor, indice) => `${indice === 0 ? 'M' : 'L'}${x(indice)},${y(valor)}`).join(' ');
  const indice = Math.min(selecionado ?? pontos.length - 1, pontos.length - 1);
  const atual = pontos[indice]!;
  const descricao = `${dataBr(atual.data)}: ${reais(Number(atual.preco_brl))}`;

  return <div ref={container} className="market-history-chart">
    <p className="market-history-value" aria-live="polite">{descricao}</p>
    <svg viewBox={`0 0 ${largura} 205`} role="img" tabIndex={0} aria-label={`Histórico de ${historico.codigo}. ${PERIODOS_HISTORICO[historico.periodo].descricao}. ${descricao}. Use as setas para explorar as datas.`}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setSelecionado(event.key === 'Home' ? 0 : event.key === 'End' ? pontos.length - 1
          : Math.max(0, Math.min(pontos.length - 1, indice + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}
      onPointerMove={event => {
        const limites = event.currentTarget.getBoundingClientRect();
        const posicao = (event.clientX - limites.left) / limites.width * largura;
        setSelecionado(Math.max(0, Math.min(pontos.length - 1, Math.round((posicao - inicioX) / (fimX - inicioX) * (pontos.length - 1)))));
      }} onPointerLeave={() => setSelecionado(null)}>
      {[piso, (piso + teto) / 2, teto].map((valor, i) => <g key={i}>
        <line x1={inicioX} x2={fimX} y1={y(valor)} y2={y(valor)} className="market-history-grid" />
        <text x="72" y={y(valor) + 4} textAnchor="end">{reais(valor)}</text>
      </g>)}
      {pontos.length > 1 && <path d={`${linha} L${x(pontos.length - 1)},190 L${x(0)},190 Z`} className="market-history-area" />}
      <path d={linha} className="market-history-line" />
      <circle cx={x(indice)} cy={y(Number(atual.preco_brl))} r="5" className="market-history-point" />
    </svg>
    <div className="market-history-dates"><span>{dataBr(pontos[0]!.data)}</span>
      {pontos.length > 1 && <span>{dataBr(pontos[pontos.length - 1]!.data)}</span>}
    </div>
    <p className="market-history-note">Fonte: {historico.fonte === 'yahoo' ? 'Yahoo Finance (acesso não oficial)' : 'brapi'}. Preços de fechamento em BRL com intervalo de {intervalos[historico.intervalo]}; podem incluir ajustes por proventos e desdobramentos.
      {(historico.intervalo === '5m' || historico.intervalo === '60m') && ' Horários de Brasília.'}</p>
  </div>;
}
