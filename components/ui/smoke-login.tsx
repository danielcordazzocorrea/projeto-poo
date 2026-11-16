/** Authentication screen with a full-page shader and a dark form panel. */
'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CalendarDays, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Theme } from '@/lib/theme';
import AnoAI from '@/components/ui/animated-shader-background';
import { AboutTivvo } from '@/components/ui/about-tivvo';
import { Calendar } from '@/components/ui/calendar';

export type SmokeLoginProps = {
  brand?: string;
  title?: ReactNode;
  subtitle?: string;
  submitLabel?: string;
  mode?: 'login' | 'signup';
  disabled?: boolean;
  notice?: { text: string; kind: 'ok' | 'erro' | 'info' } | null;
  onSubmit?: (values: { email: string; password: string; firstName?: string; lastName?: string; birthDate?: string; passwordConfirmation?: string }) => void | Promise<void>;
  forgotPasswordHref?: string;
  signUpHref?: string;
  onSignUpClick?: () => void;
  defaultTheme?: Theme;
  theme?: Theme;
  className?: string;
  footer?: ReactNode;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const birthDateError = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Data de nascimento inválida.';
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return 'Data de nascimento inválida.';
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day || birthDate > today) return 'Data de nascimento inválida.';
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (hadBirthday ? 0 : 1);
  if (age < 18) return 'Data de nascimento inválida, menor de 18 anos.';
  return age >= 120 ? 'Data de nascimento inválida.' : '';
};
const THEMES: Record<Theme, Record<string, string>> = {
  light: { '--bg': '#efede7', '--paper': '#f7f6f2', '--sheet': '#e6e3db', '--ink': '#141513', '--muted': '#6f716b', '--line': '#dcd9d0', '--field': '#fbfaf7', '--accent': '#3f8f00', '--btn': '#141513', '--btn-ink': '#f7f6f2' },
  dark: { '--bg': '#0c0d0c', '--paper': '#121412', '--sheet': '#1a1c1a', '--ink': '#ecede8', '--muted': '#8d908a', '--line': '#262925', '--field': '#161816', '--accent': '#9dff3a', '--btn': '#9dff3a', '--btn-ink': '#0c0d0c' },
};

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateValue(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function formatBirthDate(value: string): string {
  const date = parseDateValue(value);
  return date ? new Intl.DateTimeFormat('pt-BR').format(date) : '';
}

function isUnavailableBirthDate(date: Date): boolean {
  const today = new Date();
  const latest = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const earliest = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate() + 1);
  return date < earliest || date > latest;
}

function BirthDatePicker({ value, onChange, invalid }: { value: string; onChange: (value: string) => void; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typedDate, setTypedDate] = useState(() => formatBirthDate(value));
  const container = useRef<HTMLDivElement>(null);
  const selected = parseDateValue(value);
  const today = new Date();
  const initialMonth = selected ?? new Date(today.getFullYear() - 18, today.getMonth(), 1);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div ref={container} className="relative mt-2">
    <input name="birthDate" type="hidden" value={value} />
    <input
      id="birth-date"
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? 'auth-notice' : undefined}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="dd/mm/aaaa"
      aria-label="Data de nascimento, dia/mês/ano"
      maxLength={10}
      value={typedDate}
      onChange={event => {
        const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 8);
        const text = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
          .filter(Boolean).join('/');
        setTypedDate(text);
        setOpen(false);
        onChange(digits.length === 8 ? `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` : '');
      }}
      onBlur={() => { if (selected) setTypedDate(formatBirthDate(value)); }}
      className={cn(fieldBaseClass, 'pr-12')}
    />
    <button type="button" aria-label="Abrir calendário de nascimento" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)} className="absolute right-1.5 top-1 grid size-9 place-items-center rounded-[10px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <CalendarDays className="size-[18px] text-[var(--muted)]" aria-hidden />
    </button>
    {open && <div role="dialog" aria-label="Selecionar data de nascimento" className="absolute left-0 top-[calc(100%+8px)] z-20">
      <Calendar defaultMonth={initialMonth} selected={selected} disabled={isUnavailableBirthDate} onSelect={date => {
        const nextValue = date ? dateValue(date) : '';
        onChange(nextValue);
        setTypedDate(formatBirthDate(nextValue));
        setOpen(false);
      }} />
    </div>}
  </div>;
}

export function SmokeLogin({
  brand = 'Foomster', title = 'Welcome back', subtitle = 'Sign in to pick up where you left off',
  submitLabel = 'Sign in', onSubmit = () => wait(700),
  mode = 'login', disabled = false, notice,
  forgotPasswordHref = '#', signUpHref = '#', onSignUpClick, defaultTheme = 'dark', className, footer,
  theme: controlledTheme,
}: SmokeLoginProps) {
  const theme = controlledTheme ?? defaultTheme;
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const errorProps = (id: string) => ({
    'aria-invalid': invalidField === id || undefined,
    'aria-describedby': invalidField === id ? 'auth-notice' : undefined,
  });
  useEffect(() => { setFormError(null); setInvalidField(null); }, [mode]);
  const [birthDate, setBirthDate] = useState('');
  const reducedMotion = useReducedMotion();
  const rise = (index: number) => ({
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(10px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: 0.7, delay: 0.1 + index * 0.06, ease: [0.22, 1, 0.36, 1] as const },
  });
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || disabled) return;
    const showFieldError = (field: HTMLInputElement, message: string) => {
      setFormError(message);
      setInvalidField(field.id);
      field.focus();
    };
    for (const element of Array.from(event.currentTarget.elements)) {
      if (!(element instanceof HTMLInputElement) || element.type === 'hidden') continue;
      if (element.id === 'birth-date') {
        const error = birthDateError(birthDate);
        if (error) {
          showFieldError(element, element.value ? error : 'Preencha este campo.');
          return;
        }
      }
      if (element.required && !element.value.trim()) {
        showFieldError(element, 'Preencha este campo.');
        return;
      }
      if (!element.validity.valid || (element.minLength > 0 && element.value.length < element.minLength)) {
        showFieldError(element, element.type === 'email' ? 'Informe um e-mail válido.' : `Use pelo menos ${element.minLength} caracteres.`);
        return;
      }
    }
    const data = new FormData(event.currentTarget);
    const birthDateField = event.currentTarget.elements.namedItem('birthDate');
    if (mode === 'signup' && birthDateField instanceof HTMLInputElement) {
      const error = birthDateError(birthDateField.value);
      if (error) {
        setFormError(error);
        return;
      }
    }
    const password = String(data.get('password'));
    const passwordConfirmation = String(data.get('passwordConfirmation') ?? '');
    if (mode === 'signup' && password !== passwordConfirmation) {
      const field = event.currentTarget.elements.namedItem('passwordConfirmation');
      if (field instanceof HTMLInputElement) showFieldError(field, 'As senhas não conferem.');
      return;
    }
    setFormError(null);
    setInvalidField(null);
    setBusy(true);
    try { await onSubmit({ email: String(data.get('email')), password, ...(mode === 'signup' ? { firstName: String(data.get('firstName') ?? '').trim(), lastName: String(data.get('lastName') ?? '').trim(), birthDate: String(data.get('birthDate') ?? ''), passwordConfirmation } : {}) }); }
    finally { setBusy(false); }
  };

  return (
    <main data-theme={theme} data-mode={mode} style={{ ...THEMES[theme], colorScheme: 'dark' } as CSSProperties} className={cn('login-shell font-sans', className)}>
      <div aria-hidden className="login-background">
        <AnoAI className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,20,14,.55)_0%,rgba(9,20,14,.12)_60%,rgba(9,20,14,.2)_100%)]" />
      </div>
      <section className="login-intro">
          <div className="flex h-full flex-col text-white">
            <motion.header {...rise(0)} className="login-brand-nav">
              <span className="text-[23px] font-semibold tracking-[-0.07em] sm:text-[25px]">{brand === 'tivvo' ? <>ti<span className="text-[#9dff3a]">vv</span>o</> : brand}</span>
              <nav aria-label="Sobre a tivvo"><AboutTivvo /></nav>
            </motion.header>
            <motion.div {...rise(1)} className="flex max-w-[31rem] flex-1 flex-col justify-center py-6 md:py-12">
              <p className="text-[clamp(1.9rem,4vw,4.25rem)] font-medium leading-[1.04] tracking-[-0.065em]">O próximo passo <span className="text-[#9dff3a]">é seu</span></p>
              <p className="mt-3 hidden max-w-[25rem] text-sm leading-relaxed text-white/80 sm:block lg:text-base">Na tivvo, você acompanha sua conta e descobre novas possibilidades em uma experiência simples</p>
            </motion.div>
            <motion.p {...rise(2)} className="hidden border-t border-white/20 pt-4 text-xs text-white/70 md:block">Ambiente de demonstração · Valores e investimentos simulados</motion.p>
          </div>
      </section>

      <section className="login-form-panel" data-theme="dark" style={{ ...THEMES.dark, colorScheme: 'dark' } as CSSProperties} aria-label={mode === 'signup' ? 'Criar conta' : 'Entrar na conta'}>
        <div className="w-full">
          <motion.h1 {...rise(2)} className="text-[30px] font-semibold leading-none tracking-[-0.045em] sm:text-[34px]">{title}</motion.h1>
          {subtitle && <motion.p {...rise(3)} className="mt-2 text-[14px] text-[var(--muted)] sm:text-[15px]">{subtitle}</motion.p>}
          <form noValidate onSubmit={handleSubmit} onInput={event => {
            if ((event.target as HTMLInputElement).id === invalidField) { setFormError(null); setInvalidField(null); }
          }} className="mt-6 space-y-3">
            {mode === 'signup' && <motion.div {...rise(4)} key="name" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="first-name">Primeiro nome</Label>
                <input
                  id="first-name"
                  {...errorProps('first-name')}
                  name="firstName"
                  type="text"
                  required
                  maxLength={80}
                  autoComplete="given-name"
                  placeholder="Primeiro nome"
                  className={fieldClass}
                />
              </div>
              <div>
                <Label htmlFor="last-name">Sobrenome</Label>
                <input id="last-name" {...errorProps('last-name')} name="lastName" type="text" required maxLength={80} autoComplete="family-name" placeholder="Sobrenome" className={fieldClass} />
              </div>
            </motion.div>}
            {mode === 'signup' && <motion.div {...rise(5)} key="birth-date" className="relative z-30">
              <Label htmlFor="birth-date">Data de nascimento</Label>
              <BirthDatePicker value={birthDate} invalid={invalidField === 'birth-date'} onChange={value => { setBirthDate(value); if (invalidField === 'birth-date') { setFormError(null); setInvalidField(null); } }} />
            </motion.div>}
            <motion.div {...rise(4)} key={`email-${mode}`}>
              <Label htmlFor="email">E-mail</Label>
              <input id="email" {...errorProps('email')} name="email" type="email" required autoComplete="email" placeholder="voce@exemplo.com" className={fieldClass} />
            </motion.div>
            <motion.div {...rise(5)} key={`password-${mode}`}>
              <div className="flex items-baseline justify-between"><Label htmlFor="password">Senha</Label><a href={forgotPasswordHref} className="text-[12px] text-[var(--muted)] hover:text-[var(--ink)]">Esqueceu?</a></div>
              <div className="relative"><input id="password" {...errorProps('password')} name="password" type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'Mínimo de 6 caracteres' : '••••••••'} className={cn(fieldClass, 'pr-12')} />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[10px] text-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button>
              </div>
            </motion.div>
            {mode === 'signup' && <motion.div {...rise(6)} key="password-confirmation">
              <Label htmlFor="password-confirmation">Confirme sua senha</Label>
              <input
                id="password-confirmation"
                {...errorProps('password-confirmation')}
                name="passwordConfirmation"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Digite a senha novamente"
                className={fieldClass}
              />
            </motion.div>}
            <motion.div {...rise(6)} className="pt-1"><button type="submit" disabled={disabled || busy} aria-busy={busy} aria-describedby={notice || formError ? 'auth-notice' : undefined} className="group flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] shadow-[0_10px_24px_-12px_rgb(0_0_0/0.5)] transition hover:brightness-110 active:scale-[0.985] disabled:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">{busy ? <><LoaderCircle aria-hidden className="size-[18px] animate-spin" />{mode === 'signup' ? 'Criando conta...' : 'Entrando...'}</> : <>{submitLabel}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>}</button></motion.div>
            <div className={mode === 'signup' ? 'signup-notice-space' : undefined}>
              {(formError || notice) && <p id="auth-notice" role={formError || notice?.kind === 'erro' ? 'alert' : 'status'} className="rounded-xl border border-[var(--line)] bg-[var(--field)] p-3 text-sm text-[var(--ink)]">{formError ?? notice?.text}</p>}
            </div>
          </form>
          <motion.p {...rise(7)} className="mt-6 text-center text-[13px] text-[var(--muted)]">{mode === 'signup' ? 'Já tem uma conta? ' : 'Ainda não tem conta? '}{onSignUpClick ? <button type="button" disabled={busy} onClick={onSignUpClick} className="font-medium text-[var(--ink)] underline-offset-4 hover:underline disabled:opacity-50">{mode === 'signup' ? 'Entrar' : 'Crie uma conta'}</button> : <a href={signUpHref} className="font-medium text-[var(--ink)] underline-offset-4 hover:underline">Crie uma conta</a>}</motion.p>
          {footer && <motion.div {...rise(8)} className="mt-6 text-center text-[12px] text-[var(--muted)]">{footer}</motion.div>}
        </div>
      </section>
    </main>
  );
}

const fieldBaseClass = 'h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field)] px-4 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:color-mix(in_oklab,var(--accent)_18%,transparent)]';
const fieldClass = `mt-2 ${fieldBaseClass}`;
function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) { return <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--ink)]">{children}</label>; }
