import { t } from '@/frontend/idioma';
import { useState } from 'react';
import type { HistoricoAtivo } from '../supabase/functions/_shared/mercado-brapi';
import { PERIODOS_HISTORICO } from '../supabase/functions/_shared/mercado-periodos';

const reais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (data: string) => data.includes('T')
  ? new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : data.split('-').reverse().join('/');
const intervalos = { '5m': '5 minutos', '60m': '1 hora', '1d': '1 dia', '1wk': '1 semana', '1mo': '1 mês' };

export function GraficoAtivo({ historico }: { historico: HistoricoAtivo }) {
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const pontos = historico.pontos;
  if (pontos.length === 0) return <p role="status">{t("Sem histórico disponível para este ativo no período selecionado.")}</p>;
  const valores = pontos.map(ponto => Number(ponto.preco_brl));
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const margem = Math.max((maximo - minimo) * 0.1, maximo * 0.005, 0.01);
  const piso = Math.max(0, minimo - margem);
  const teto = maximo + margem;
  const x = (indice: number) => pontos.length === 1 ? 300 : 80 + indice / (pontos.length - 1) * 490;
  const y = (valor: number) => 190 - (valor - piso) / (teto - piso) * 170;
  const linha = valores.map((valor, indice) => `${indice === 0 ? 'M' : 'L'}${x(indice)},${y(valor)}`).join(' ');
  const indice = Math.min(selecionado ?? pontos.length - 1, pontos.length - 1);
  const atual = pontos[indice]!;
  const descricao = `${dataBr(atual.data)}: ${reais(Number(atual.preco_brl))}`;

  return <div className="market-history-chart">
    <p className="market-history-value" aria-live="polite">{descricao}</p>
    <svg viewBox="0 0 600 225" role="img" tabIndex={0} aria-label={`Histórico de ${historico.codigo}. ${PERIODOS_HISTORICO[historico.periodo].descricao}. ${descricao}. Use as setas para explorar as datas.`}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setSelecionado(event.key === 'Home' ? 0 : event.key === 'End' ? pontos.length - 1
          : Math.max(0, Math.min(pontos.length - 1, indice + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}
      onPointerMove={event => {
        const limites = event.currentTarget.getBoundingClientRect();
        const posicao = (event.clientX - limites.left) / limites.width * 600;
        setSelecionado(Math.max(0, Math.min(pontos.length - 1, Math.round((posicao - 80) / 490 * (pontos.length - 1)))));
      }} onPointerLeave={() => setSelecionado(null)}>
      {[piso, (piso + teto) / 2, teto].map((valor, i) => <g key={i}>
        <line x1="80" x2="570" y1={y(valor)} y2={y(valor)} className="market-history-grid" />
        <text x="72" y={y(valor) + 4} textAnchor="end">{reais(valor)}</text>
      </g>)}
      {pontos.length > 1 && <path d={`${linha} L${x(pontos.length - 1)},190 L${x(0)},190 Z`} className="market-history-area" />}
      <path d={linha} className="market-history-line" />
      <circle cx={x(indice)} cy={y(Number(atual.preco_brl))} r="5" className="market-history-point" />
      <text x="80" y="216">{dataBr(pontos[0]!.data)}</text>
      {pontos.length > 1 && <text x="570" y="216" textAnchor="end">{dataBr(pontos[pontos.length - 1]!.data)}</text>}
    </svg>
    <p className="market-history-note">Fonte: {historico.fonte === 'yahoo' ? 'Yahoo Finance (acesso não oficial)' : 'brapi'}. Preços de fechamento em BRL com intervalo de {intervalos[historico.intervalo]}; podem incluir ajustes por proventos e desdobramentos.
      {(historico.intervalo === '5m' || historico.intervalo === '60m') && ' Horários de Brasília.'}</p>
  </div>;
}
