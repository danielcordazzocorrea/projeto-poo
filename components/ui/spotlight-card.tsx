import { useEffect } from 'react';

// Use the existing cards so the effect doesn't change their layout or semantics.
const cards = [
  '.login-form-panel',
  '.account-overview',
  '.account-destination',
  '.account-detail',
  '.account-currency-choice-content',
  '.account-notice',
  '.account-transactions-state',
  '.investment-category',
  '.investment-portfolio',
  '.investment-positions-trigger',
  '.investment-balances > div',
  '.investment-receipt',
  '.investment-positions-empty',
  '.market-search-panel',
  '.market-search-results',
  '.market-results button',
  '.market-quote-card',
  '.account-pix-dialog',
  '.tivvo-about',
  '.mascot-chat',
  '.language-selector-menu',
].join(',');

/** One shared pointer listener, including cards mounted after navigation. */
export function useSpotlightCards() {
  useEffect(() => {
    const marked = new Set<HTMLElement>();
    let active: HTMLElement | null = null;
    let frame = 0;
    let pointer: { element: HTMLElement; x: number; y: number } | null = null;

    function clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      active?.removeAttribute('data-spotlight-active');
      active = null;
    }

    function paint() {
      frame = 0;
      if (!pointer) return;
      const { element, x, y } = pointer;
      const style = getComputedStyle(element);
      // Em contêineres com rolagem, o pseudo-elemento termina no scrollport e
      // desenha um canto falso antes do fim do conteúdo (como em modais altos).
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll')
        && element.scrollHeight > element.clientHeight + 1) {
        clear();
        return;
      }
      if (active !== element) {
        active?.removeAttribute('data-spotlight-active');
        active = element;
      }
      if (!marked.has(element)) {
        if (style.position === 'static') element.setAttribute('data-spotlight-static', '');
        element.setAttribute('data-spotlight-card', '');
        marked.add(element);
      }
      const bounds = element.getBoundingClientRect();
      element.style.setProperty('--spotlight-x', `${x - bounds.left}px`);
      element.style.setProperty('--spotlight-y', `${y - bounds.top}px`);
      element.setAttribute('data-spotlight-active', '');
    }

    function move(event: PointerEvent) {
      if (event.pointerType === 'touch') return;
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>(cards) : null;
      if (!element) { clear(); return; }
      pointer = { element, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    }
    function leave(event: PointerEvent) {
      if (!event.relatedTarget) clear();
    }

    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', leave);
    window.addEventListener('blur', clear);
    window.addEventListener('scroll', clear, { passive: true, capture: true });
    return () => {
      clear();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', clear);
      window.removeEventListener('scroll', clear, true);
      for (const element of marked) {
        element.removeAttribute('data-spotlight-card');
        element.removeAttribute('data-spotlight-static');
        element.style.removeProperty('--spotlight-x');
        element.style.removeProperty('--spotlight-y');
      }
    };
  }, []);
}
