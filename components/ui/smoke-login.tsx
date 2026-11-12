/** A split authentication screen with a WebGL shader panel. */
'use client';

import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Theme } from '@/lib/theme';
import AnoAI from '@/components/ui/animated-shader-background';

export type SmokeLoginProps = {
  brand?: string;
  title?: ReactNode;
  subtitle?: string;
  submitLabel?: string;
  mode?: 'login' | 'signup';
  disabled?: boolean;
  notice?: { text: string; kind: 'ok' | 'erro' | 'info' } | null;
  onSubmit?: (values: { email: string; password: string }) => void | Promise<void>;
  forgotPasswordHref?: string;
  signUpHref?: string;
  onSignUpClick?: () => void;
  defaultTheme?: Theme;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  className?: string;
  footer?: ReactNode;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const THEMES: Record<Theme, Record<string, string>> = {
  light: { '--bg': '#efede7', '--paper': '#f7f6f2', '--sheet': '#e6e3db', '--ink': '#141513', '--muted': '#6f716b', '--line': '#dcd9d0', '--field': '#fbfaf7', '--accent': '#3f8f00', '--btn': '#141513', '--btn-ink': '#f7f6f2' },
  dark: { '--bg': '#0c0d0c', '--paper': '#121412', '--sheet': '#1a1c1a', '--ink': '#ecede8', '--muted': '#8d908a', '--line': '#262925', '--field': '#161816', '--accent': '#9dff3a', '--btn': '#9dff3a', '--btn-ink': '#0c0d0c' },
};

export function SmokeLogin({
  brand = 'Foomster', title = 'Welcome back', subtitle = 'Sign in to pick up where you left off',
  submitLabel = 'Sign in', onSubmit = () => wait(700),
  mode = 'login', disabled = false, notice,
  forgotPasswordHref = '#', signUpHref = '#', onSignUpClick, defaultTheme = 'dark', className, footer,
  theme: controlledTheme, onThemeChange,
}: SmokeLoginProps) {
  const [localTheme, setLocalTheme] = useState<Theme>(defaultTheme);
  const theme = controlledTheme ?? localTheme;
  const changeTheme = (nextTheme: Theme) => {
    if (controlledTheme === undefined) setLocalTheme(nextTheme);
    onThemeChange?.(nextTheme);
  };
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const reducedMotion = useReducedMotion();
  const dark = theme === 'dark';
  const rise = (index: number) => ({
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(10px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: 0.7, delay: 0.1 + index * 0.06, ease: [0.22, 1, 0.36, 1] as const },
  });
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || disabled) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try { await onSubmit({ email: String(data.get('email')), password: String(data.get('password')) }); }
    finally { setBusy(false); }
  };

  return (
    <main data-theme={theme} style={{ ...THEMES[theme], colorScheme: theme } as CSSProperties} className={cn('login-shell grid min-h-dvh w-full grid-cols-1 gap-2 overflow-x-hidden bg-[var(--bg)] p-2 font-sans text-[var(--ink)] transition-colors duration-700 sm:gap-3 sm:p-3 md:h-dvh md:grid-cols-[1.08fr_1fr]', className)}>
      <section className="relative min-h-[170px] sm:min-h-[250px] md:min-h-0">
        <div aria-hidden className="absolute inset-0 rotate-[-1.4deg] rounded-[28px] bg-[var(--sheet)]" />
        <div aria-hidden className="absolute inset-0 rotate-[0.9deg] rounded-[28px] bg-[var(--paper)] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]" />
        <div className="relative h-full min-h-[170px] overflow-hidden rounded-[28px] bg-[#09140e] shadow-[0_24px_48px_-24px_rgb(0_0_0/0.35)] sm:min-h-[250px] md:min-h-0">
          <AnoAI className="absolute inset-0 size-full" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(9,20,14,.88)_0%,rgba(9,20,14,.52)_55%,rgba(9,20,14,.18)_100%)]" />
          <div className="relative flex h-full min-h-[170px] flex-col p-5 text-white sm:min-h-[250px] sm:p-7 md:min-h-0 lg:p-10">
            <motion.div {...rise(0)} className="text-[23px] font-semibold tracking-[-0.07em] sm:text-[25px]">{brand === 'tivvo' ? <>ti<span className="text-[#9dff3a]">vv</span>o</> : brand}</motion.div>
            <motion.div {...rise(1)} className="flex max-w-[31rem] flex-1 flex-col justify-center py-2 sm:py-4">
              <p className="text-[clamp(1.9rem,4vw,4.25rem)] font-medium leading-[1.04] tracking-[-0.065em]">O próximo passo <span className="text-[#9dff3a]">é seu</span></p>
              <p className="mt-3 hidden max-w-[25rem] text-sm leading-relaxed text-white/80 sm:block lg:text-base">Na tivvo, você acompanha sua conta e descobre novas possibilidades em uma experiência simples</p>
            </motion.div>
            <motion.p {...rise(2)} className="hidden border-t border-white/20 pt-3 text-xs text-white/70 sm:block">Ambiente de demonstração · Valores e investimentos simulados</motion.p>
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-5 py-6 sm:px-8 sm:py-8 md:px-6 md:py-6 lg:px-10">
        <ThemeSwitch theme={theme} onToggle={() => changeTheme(dark ? 'light' : 'dark')} />
        <div className="w-full max-w-[360px]">
          <motion.h1 {...rise(2)} className="text-[30px] font-semibold leading-none tracking-[-0.045em] sm:text-[34px]">{title}</motion.h1>
          <motion.p {...rise(3)} className="mt-2 text-[14px] text-[var(--muted)] sm:text-[15px]">{subtitle}</motion.p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <motion.div {...rise(4)}>
              <Label htmlFor="email">E-mail</Label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="voce@exemplo.com" className={fieldClass} />
            </motion.div>
            <motion.div {...rise(5)}>
              <div className="flex items-baseline justify-between"><Label htmlFor="password">Senha</Label><a href={forgotPasswordHref} className="text-[12px] text-[var(--muted)] hover:text-[var(--ink)]">Esqueceu?</a></div>
              <div className="relative"><input id="password" name="password" type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'Mínimo de 6 caracteres' : '••••••••'} className={cn(fieldClass, 'pr-12')} />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[10px] text-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button>
              </div>
            </motion.div>
            <motion.div {...rise(6)} className="pt-1"><button type="submit" disabled={disabled || busy} aria-busy={busy} aria-describedby={notice ? 'auth-notice' : undefined} className="group flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] shadow-[0_10px_24px_-12px_rgb(0_0_0/0.5)] transition hover:brightness-110 active:scale-[0.985] disabled:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">{busy ? <><LoaderCircle aria-hidden className="size-[18px] animate-spin" />{mode === 'signup' ? 'Criando conta...' : 'Entrando...'}</> : <>{submitLabel}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>}</button></motion.div>
            {notice && <p id="auth-notice" role={notice.kind === 'erro' ? 'alert' : 'status'} className="rounded-xl border border-[var(--line)] bg-[var(--field)] p-3 text-sm text-[var(--ink)]">{notice.text}</p>}
          </form>
          <motion.p {...rise(7)} className="mt-6 text-center text-[13px] text-[var(--muted)]">{mode === 'signup' ? 'Já tem uma conta? ' : 'Ainda não tem conta? '}{onSignUpClick ? <button type="button" disabled={busy} onClick={onSignUpClick} className="font-medium text-[var(--ink)] underline-offset-4 hover:underline disabled:opacity-50">{mode === 'signup' ? 'Entrar' : 'Crie uma conta'}</button> : <a href={signUpHref} className="font-medium text-[var(--ink)] underline-offset-4 hover:underline">Crie uma conta</a>}</motion.p>
          {footer && <motion.div {...rise(8)} className="mt-6 text-center text-[12px] text-[var(--muted)]">{footer}</motion.div>}
        </div>
      </section>
    </main>
  );
}

const fieldClass = 'mt-2 h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field)] px-4 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:color-mix(in_oklab,var(--accent)_18%,transparent)]';
function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) { return <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--ink)]">{children}</label>; }
function ThemeSwitch({ theme, onToggle }: { theme: Theme; onToggle: () => void }) { const dark = theme === 'dark'; return <button type="button" onClick={onToggle} aria-label={dark ? 'Alternar para modo claro' : 'Alternar para modo escuro'} className="absolute right-3 top-3 flex h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:right-6 sm:top-6"><AnimatePresence initial={false} mode="popLayout"><motion.span key={theme} initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }}>{dark ? <Moon className="size-4" /> : <Sun className="size-4" />}</motion.span></AnimatePresence>{dark ? 'Escuro' : 'Claro'}</button>; }
