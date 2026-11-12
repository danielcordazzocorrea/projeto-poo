/** A split authentication screen with a WebGL smoke panel. */
'use client';

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SmokeLoginProvider = 'apple' | 'google';
type Theme = 'light' | 'dark';

export type SmokeLoginProps = {
  brand?: string;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  onSubmit?: (values: { email: string; password: string }) => void | Promise<void>;
  onProviderSignIn?: (provider: SmokeLoginProvider) => void | Promise<void>;
  forgotPasswordHref?: string;
  signUpHref?: string;
  onSignUpClick?: () => void;
  defaultTheme?: Theme;
  className?: string;
  footer?: ReactNode;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const THEMES: Record<Theme, Record<string, string>> = {
  light: { '--bg': '#efede7', '--paper': '#f7f6f2', '--sheet': '#e6e3db', '--ink': '#141513', '--muted': '#6f716b', '--line': '#dcd9d0', '--field': '#fbfaf7', '--accent': '#3f8f00', '--btn': '#141513', '--btn-ink': '#f7f6f2' },
  dark: { '--bg': '#0c0d0c', '--paper': '#121412', '--sheet': '#1a1c1a', '--ink': '#ecede8', '--muted': '#8d908a', '--line': '#262925', '--field': '#161816', '--accent': '#9dff3a', '--btn': '#9dff3a', '--btn-ink': '#0c0d0c' },
};

export function SmokeLogin({
  brand = 'Foomster', title = 'Welcome back', subtitle = 'Sign in to pick up where you left off.',
  submitLabel = 'Sign in', onSubmit = () => wait(700), onProviderSignIn = () => wait(700),
  forgotPasswordHref = '#', signUpHref = '#', onSignUpClick, defaultTheme = 'dark', className, footer,
}: SmokeLoginProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
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
    if (busy) return;
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
    <main style={THEMES[theme] as CSSProperties} className={cn('grid min-h-dvh w-full grid-cols-1 gap-3 overflow-x-hidden bg-[var(--bg)] p-3 font-sans text-[var(--ink)] transition-colors duration-700 lg:grid-cols-[1.08fr_1fr]', className)}>
      <section className="relative min-h-[40vh] lg:min-h-0">
        <div aria-hidden className="absolute inset-0 rotate-[-1.4deg] rounded-[28px] bg-[var(--sheet)]" />
        <div aria-hidden className="absolute inset-0 rotate-[0.9deg] rounded-[28px] bg-[var(--paper)] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]" />
        <div className="relative h-full overflow-hidden rounded-[28px] bg-[var(--paper)] shadow-[0_24px_48px_-24px_rgb(0_0_0/0.35)] transition-colors duration-700">
          <SmokeCanvas dark={dark} />
          <motion.div {...rise(0)} className="absolute left-6 top-6 text-[15px] font-semibold tracking-[-0.02em]">{brand}</motion.div>
          <motion.div {...rise(1)} className="absolute inset-x-6 bottom-6 hidden max-w-[22rem] sm:block">
            <p className="text-[28px] font-medium leading-[1.1] tracking-[-0.035em]">Invista com calma. O resto pode esperar.</p>
            <p className="mt-2 text-[13px] text-[var(--muted)]">A sua corretora simulada, em um lugar seguro.</p>
          </motion.div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-5 py-16 sm:px-10">
        <ThemeSwitch theme={theme} onToggle={() => setTheme(dark ? 'light' : 'dark')} />
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
              <div className="relative"><input id="password" name="password" type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete="current-password" placeholder="••••••••" className={cn(fieldClass, 'pr-12')} />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[10px] text-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button>
              </div>
            </motion.div>
            <motion.div {...rise(6)} className="pt-2"><button type="submit" disabled={Boolean(busy)} className="group flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] shadow-[0_10px_24px_-12px_rgb(0_0_0/0.5)] transition hover:brightness-110 active:scale-[0.985] disabled:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">{busy === 'form' ? <LoaderCircle className="size-[18px] animate-spin" /> : <>{submitLabel}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>}</button></motion.div>
          </form>
          <motion.div {...rise(7)} className="my-7 flex items-center gap-3 text-[12px] text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />ou<span className="h-px flex-1 bg-[var(--line)]" /></motion.div>
          <motion.div {...rise(8)} className="grid grid-cols-2 gap-3"><ProviderButton onClick={() => provider('apple')} busy={busy === 'apple'} disabled={Boolean(busy)}>Apple</ProviderButton><ProviderButton onClick={() => provider('google')} busy={busy === 'google'} disabled={Boolean(busy)}><GoogleMark />Google</ProviderButton></motion.div>
          <motion.p {...rise(9)} className="mt-9 text-center text-[13px] text-[var(--muted)]">Ainda não tem conta? <a href={signUpHref} onClick={event => { if (onSignUpClick) { event.preventDefault(); onSignUpClick(); } }} className="font-medium text-[var(--ink)] underline-offset-4 hover:underline">Crie uma conta</a></motion.p>
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

const VERTEX = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAGMENT = `precision mediump float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float d;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}float f(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.+vec2(1.7,9.2);a*=.5;}return v;}void main(){vec2 u=gl_FragCoord.xy/r, p=u*1.3;float q=t*.05;vec2 z=p-vec2(m.x,m.y);p+=vec2(-z.y,z.x)*exp(-dot(z,z)*2.)*.35;float s=smoothstep(.28,.88,f(p+vec2(q,-q*.6)));float v=1.-smoothstep(.0,.045,abs(f(p+q)-.58));vec3 light=mix(vec3(.97,.96,.94),vec3(.06,.07,.06),s);vec3 night=vec3(.035,.04,.035)+vec3(.75,.78,.72)*s*.65;vec3 c=mix(light,night,d);c=mix(c,vec3(.62,1.,.23),v*.55);gl_FragColor=vec4(c,1.);}`;
function SmokeCanvas({ dark }: { dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const darkRef = useRef(dark ? 1 : 0);
  useEffect(() => { darkRef.current = dark ? 1 : 0; }, [dark]);
  useEffect(() => {
    const canvas = canvasRef.current; const gl = canvas?.getContext('webgl', { antialias: false }); if (!canvas || !gl) return;
    const compile = (type: number, source: string) => { const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader); return shader; };
    const program = gl.createProgram()!; gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT)); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name: string) => gl.getUniformLocation(program, name); const resolution = uniform('r'), time = uniform('t'), mouse = uniform('m'), shade = uniform('d'); const pointer = { x: .7, y: .4 };
    const resize = () => { const scale = Math.min(devicePixelRatio, 2) * .45; canvas.width = Math.max(1, canvas.clientWidth * scale); canvas.height = Math.max(1, canvas.clientHeight * scale); gl.viewport(0, 0, canvas.width, canvas.height); };
    const render = (now: number) => { gl.uniform2f(resolution, canvas.width, canvas.height); gl.uniform1f(time, now / 1000); gl.uniform2f(mouse, pointer.x, pointer.y); gl.uniform1f(shade, darkRef.current); gl.drawArrays(gl.TRIANGLES, 0, 3); frame = requestAnimationFrame(render); };
    const move = (event: PointerEvent) => { const box = canvas.getBoundingClientRect(); pointer.x = (event.clientX - box.left) / box.width; pointer.y = 1 - (event.clientY - box.top) / box.height; };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); canvas.addEventListener('pointermove', move); let frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener('pointermove', move); };
  }, []);
  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />;
}
