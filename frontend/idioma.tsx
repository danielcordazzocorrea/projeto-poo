import { useId, useSyncExternalStore } from 'react';
import { Globe2 } from 'lucide-react';
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
  return <fieldset className="language-selector">
    <legend className="sr-only">{t('Idioma')}</legend>
    <Globe2 size={16} strokeWidth={1.7} aria-hidden />
    {idiomas.map(({ valor, sigla, nome }) => (
      <label key={valor} title={nome} lang={valor}>
        <input type="radio" name={grupo} value={valor} checked={idioma === valor}
          aria-label={nome} onChange={() => selecionar(valor)} />
        <span aria-hidden>{sigla}</span>
      </label>
    ))}
  </fieldset>;
}
