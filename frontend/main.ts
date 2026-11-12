import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './app';

const element = document.querySelector<HTMLDivElement>('#app');
if (!element) throw new Error('Elemento #app não encontrado.');
createRoot(element).render(createElement(StrictMode, null, createElement(App)));
