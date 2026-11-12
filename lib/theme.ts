export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'corretora-poo-theme';

export function readSavedTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    // Storage can be blocked by the browser; keep the default theme usable.
    return 'dark';
  }
}
