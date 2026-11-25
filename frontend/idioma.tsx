import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CatalogoDeIdioma, type Idioma } from './catalogo-de-idioma';

const chave = 'tivvo.idioma';
function idiomaSalvo(): Idioma {
  try {
    const valor = window.localStorage.getItem(chave);
    if (valor === 'en' || valor === 'es') return valor;
  } catch { /* O seletor também funciona sem armazenamento. */ }
  return 'pt-BR';
}

let catalogo = new CatalogoDeIdioma(idiomaSalvo());
const ouvintes = new Set<() => void>();
function observar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}
export function useIdioma() {
  return useSyncExternalStore(observar, () => catalogo.idioma);
}
export function t(texto: string) {
  return catalogo.traduzir(texto);
}
function selecionar(idioma: Idioma) {
  catalogo = new CatalogoDeIdioma(idioma);
  try { window.localStorage.setItem(chave, idioma); } catch { /* Preferência da sessão. */ }
  ouvintes.forEach(ouvinte => ouvinte());
}
const idiomas = [
  { valor: 'pt-BR', sigla: 'PT', nome: 'Português' },
  { valor: 'en', sigla: 'EN', nome: 'English' },
  { valor: 'es', sigla: 'ES', nome: 'Español' },
] as const;

export function SeletorIdioma() {
  const idioma = useIdioma();
  const grupo = useId();
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const [recuo, setRecuo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const opcoes = useRef<(HTMLButtonElement | null)[]>([]);
  const reduzirMovimento = useReducedMotion();
  const atual = idiomas.find(item => item.valor === idioma)!;

  useEffect(() => {
    if (aberto) opcoes.current[foco]?.focus();
  }, [aberto, foco]);

  useEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const limite = raiz.current?.getBoundingClientRect().right ?? 0;
      setRecuo(-Math.max(0, 20 + Math.min(240, window.innerWidth - 40) - limite));
    };
    posicionar();
    const fecharFora = (event: PointerEvent) => {
      if (!raiz.current?.contains(event.target as Node)) setAberto(false);
    };
    document.addEventListener('pointerdown', fecharFora);
    window.addEventListener('resize', posicionar);
    return () => {
      document.removeEventListener('pointerdown', fecharFora);
      window.removeEventListener('resize', posicionar);
    };
  }, [aberto]);

  function abrir(indice = idiomas.findIndex(item => item.valor === idioma)) {
    setFoco(indice);
    setAberto(true);
  }
  function teclado(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && aberto) {
      event.preventDefault();
      event.stopPropagation();
      setAberto(false);
      botao.current?.focus();
    }
    if (!aberto || event.target === botao.current) return;
    let proximo: number;
    if (event.key === 'ArrowDown') proximo = (foco + 1) % idiomas.length;
    else if (event.key === 'ArrowUp') proximo = (foco + idiomas.length - 1) % idiomas.length;
    else if (event.key === 'Home') proximo = 0;
    else if (event.key === 'End') proximo = idiomas.length - 1;
    else return;
    event.preventDefault();
    setFoco(proximo);
  }

  return <div ref={raiz} className="language-selector" onKeyDown={teclado}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAberto(false); }}>
    <button ref={botao} type="button" className="language-selector-trigger"
      id={`${grupo}-trigger`} aria-haspopup="menu" aria-expanded={aberto} aria-controls={`${grupo}-menu`}
      aria-label={`${t('Selecionar idioma')}: ${atual.nome} (${atual.sigla})`}
      onClick={() => aberto ? setAberto(false) : abrir()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          abrir(event.key === 'ArrowDown' ? 0 : idiomas.length - 1);
        }
      }}>
      <Globe2 size={18} strokeWidth={1.7} aria-hidden />
      <span>{atual.sigla}</span>
      <ChevronDown size={14} strokeWidth={1.7} aria-hidden className={aberto ? 'is-open' : undefined} />
    </button>
    <AnimatePresence>
      {aberto && <motion.div key="languages" id={`${grupo}-menu`} role="menu"
        aria-labelledby={`${grupo}-trigger`} className="language-selector-menu"
        style={{ right: recuo }}
        initial={{ opacity: 0, y: reduzirMovimento ? 0 : -5 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduzirMovimento ? 0 : -5 }} transition={{ duration: reduzirMovimento ? 0 : .16 }}>
        <p className="language-selector-heading" role="presentation">{t('Selecionar idioma')}</p>
        {idiomas.map(({ valor, sigla, nome }, indice) => (
          <button key={valor} ref={element => { opcoes.current[indice] = element; }} type="button"
            role="menuitemradio" aria-checked={idioma === valor} tabIndex={indice === foco ? 0 : -1}
            className="language-selector-option" lang={valor} onFocus={() => setFoco(indice)}
            onClick={() => { selecionar(valor); setAberto(false); botao.current?.focus(); }}>
            <span>{nome} <small>({sigla})</small></span>
            {idioma === valor && <Check size={17} strokeWidth={2} aria-hidden />}
          </button>
        ))}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
