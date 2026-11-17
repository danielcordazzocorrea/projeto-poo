import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const experimental = mode === 'yahoo-test';
  const plugins = [react(), tailwindcss()];
  if (experimental) {
    const { yahooTeste } = await import('./scripts/yahoo-vite');
    const url = env.VITE_SUPABASE_URL || 'https://pzaakefnbhwlhatgzgea.supabase.co';
    const chave = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!chave) throw new Error('Configure a chave pública do Supabase em .env.local.');
    plugins.push(yahooTeste(url, chave));
  }
  return {
  plugins,
  define: { 'import.meta.env.VITE_YAHOO_TEST': JSON.stringify(experimental ? 'true' : 'false') },
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
}; });
