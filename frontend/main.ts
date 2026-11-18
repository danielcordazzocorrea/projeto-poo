import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './app';

const element = document.querySelector<HTMLDivElement>('#app');
if (!element) throw new Error('Elemento #app não encontrado');
const root = createRoot(element);
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'error-dialog') {
  void import('./error-dialog-preview').then(({ ErrorDialogPreview }) => {
    root.render(createElement(StrictMode, null, createElement(ErrorDialogPreview)));
  });
} else {
  root.render(createElement(StrictMode, null, createElement(App)));
}
