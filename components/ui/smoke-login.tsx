/** A split authentication screen with a WebGL shader panel. */
'use client';

import {
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Theme } from '@/lib/theme';
import { ShaderBackground, type ShaderColor } from '@/components/ui/dark-mono';

export type SmokeLoginProvider = 'apple' | 'google';

export type SmokeLoginProps = {
  brand?: string;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  mode?: 'login' | 'signup';
  disabled?: boolean;
  notice?: { text: string; kind: 'ok' | 'erro' | 'info' } | null;
  onSubmit?: (values: { email: string; password: string }) => void | Promise<void>;
  onProviderSignIn?: (provider: SmokeLoginProvider) => void | Promise<void>;
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
const SHADER_COLORS: Record<Theme, readonly ShaderColor[]> = {
  light: [[0.97, 0.965, 0.95], [0.75, 0.88, 0.62], [0.49, 0.72, 0.35], [0.86, 0.92, 0.78], [0.97, 0.965, 0.95]],
  dark: [[0.07, 0.08, 0.07], [0.25, 0.43, 0.2], [0.61, 1, 0.23], [0.32, 0.57, 0.22], [0.07, 0.08, 0.07]],
};

export function SmokeLogin({
  brand = 'Foomster', title = 'Welcome back', subtitle = 'Sign in to pick up where you left off.',
  submitLabel = 'Sign in', onSubmit = () => wait(700), onProviderSignIn = () => wait(700),
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
  const [busy, setBusy] = useState<null | 'form' | SmokeLoginProvider>(null);
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
    setBusy('form');
    try { await onSubmit({ email: String(data.get('email')), password: String(data.get('password')) }); }
    finally { setBusy(null); }
  };
  const provider = async (name: SmokeLoginProvider) => {
    if (busy) return;
    setBusy(name);
    try { await onProviderSignIn(name); } finally { setBusy(null); }
  };

  return (
    <main data-theme={theme} style={{ ...THEMES[theme], colorScheme: theme } as CSSProperties} className={cn('grid min-h-dvh w-full grid-cols-1 gap-3 overflow-x-hidden bg-[var(--bg)] p-3 font-sans text-[var(--ink)] transition-colors duration-700 lg:grid-cols-[1.08fr_1fr]', className)}>
      <section className="relative min-h-[40vh] lg:min-h-0">
        <div aria-hidden className="absolute inset-0 rotate-[-1.4deg] rounded-[28px] bg-[var(--sheet)]" />
        <div aria-hidden className="absolute inset-0 rotate-[0.9deg] rounded-[28px] bg-[var(--paper)] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]" />
        <div className="relative h-full overflow-hidden rounded-[28px] bg-[var(--paper)] shadow-[0_24px_48px_-24px_rgb(0_0_0/0.35)] transition-colors duration-700">
          <ShaderBackground className="absolute inset-0" colors={SHADER_COLORS[theme]} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: dark ? 'linear-gradient(to top, rgba(12,13,12,.82), transparent 46%)' : 'linear-gradient(to top, rgba(247,246,242,.82), transparent 46%)' }} />
          <motion.div {...rise(0)} className="absolute left-6 top-6 text-[15px] font-semibold tracking-[-0.02em]">{brand}</motion.div>
          <motion.div {...rise(1)} className="absolute inset-x-6 bottom-6 hidden max-w-[22rem] sm:block">
            <p className="text-[28px] font-medium leading-[1.1] tracking-[-0.035em]">Invista com calma. O resto pode esperar.</p>
            <p className="mt-2 text-[13px] text-[var(--muted)]">A sua corretora simulada, em um lugar seguro.</p>
          </motion.div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-5 py-16 sm:px-10">
        <ThemeSwitch theme={theme} onToggle={() => changeTheme(dark ? 'light' : 'dark')} />
        <div className="w-full max-w-[360px]">
          <motion.h1 {...rise(2)} className="text-[34px] font-semibold leading-none tracking-[-0.045em]">{title}</motion.h1>
          <motion.p {...rise(3)} className="mt-3 text-[15px] text-[var(--muted)]">{subtitle}</motion.p>
          <form onSubmit={handleSubmit} className="mt-9 space-y-4">
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
            <motion.div {...rise(6)} className="pt-2"><button type="submit" disabled={disabled || Boolean(busy)} aria-busy={busy === 'form'} aria-describedby={notice ? 'auth-notice' : undefined} className="group flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] shadow-[0_10px_24px_-12px_rgb(0_0_0/0.5)] transition hover:brightness-110 active:scale-[0.985] disabled:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">{busy === 'form' ? <><LoaderCircle aria-hidden className="size-[18px] animate-spin" />{mode === 'signup' ? 'Criando conta...' : 'Entrando...'}</> : <>{submitLabel}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>}</button></motion.div>
            {notice && <p id="auth-notice" role={notice.kind === 'erro' ? 'alert' : 'status'} className="rounded-xl border border-[var(--line)] bg-[var(--field)] p-3 text-sm text-[var(--ink)]">{notice.text}</p>}
          </form>
          <motion.div {...rise(7)} className="my-7 flex items-center gap-3 text-[12px] text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />ou<span className="h-px flex-1 bg-[var(--line)]" /></motion.div>
          <motion.div {...rise(8)} className="grid grid-cols-2 gap-3"><ProviderButton onClick={() => provider('apple')} busy={busy === 'apple'} disabled={Boolean(busy)}>Apple</ProviderButton><ProviderButton onClick={() => provider('google')} busy={busy === 'google'} disabled={Boolean(busy)}><GoogleMark />Google</ProviderButton></motion.div>
          <motion.p {...rise(9)} className="mt-9 text-center text-[13px] text-[var(--muted)]">{mode === 'signup' ? 'Já tem uma conta? ' : 'Ainda não tem conta? '}{onSignUpClick ? <button type="button" disabled={Boolean(busy)} onClick={onSignUpClick} className="font-medium text-[var(--ink)] underline-offset-4 hover:underline disabled:opacity-50">{mode === 'signup' ? 'Entrar' : 'Crie uma conta'}</button> : <a href={signUpHref} className="font-medium text-[var(--ink)] underline-offset-4 hover:underline">Crie uma conta</a>}</motion.p>
          {footer && <motion.div {...rise(10)} className="mt-10 text-center text-[12px] text-[var(--muted)]">{footer}</motion.div>}
        </div>
      </section>
    </main>
  );
}

const fieldClass = 'mt-2 h-12 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field)] px-4 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:color-mix(in_oklab,var(--accent)_18%,transparent)]';
function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) { return <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--ink)]">{children}</label>; }
function ProviderButton({ children, busy, ...props }: { children: ReactNode; busy: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) { return <button type="button" {...props} className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--field)] text-[14px] font-medium transition hover:border-[var(--muted)] disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{busy ? <LoaderCircle className="size-[17px] animate-spin" /> : children}</button>; }
function ThemeSwitch({ theme, onToggle }: { theme: Theme; onToggle: () => void }) { const dark = theme === 'dark'; return <button type="button" onClick={onToggle} aria-label={dark ? 'Alternar para modo claro' : 'Alternar para modo escuro'} className="absolute right-3 top-3 flex h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:right-6 sm:top-6"><AnimatePresence initial={false} mode="popLayout"><motion.span key={theme} initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }}>{dark ? <Moon className="size-4" /> : <Sun className="size-4" />}</motion.span></AnimatePresence>{dark ? 'Escuro' : 'Claro'}</button>; }
function GoogleMark() { return <svg viewBox="0 0 24 24" aria-hidden className="size-[17px]"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6a11 11 0 0 0 3.3-8.2z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.8 14.1A7 7 0 0 1 5.5 12c0-.7.1-1.4.3-2.1V7.1H2.2A11 11 0 0 0 1 12c0 1.8.4 3.5 1.2 4.9l3.7-2.8z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>; }
