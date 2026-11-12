'use client';

import { useEffect, useRef } from 'react';

export type VortexColor = readonly [number, number, number];
export type VortexPalette = {
  background: VortexColor;
  primary: VortexColor;
  secondary: VortexColor;
  accent: VortexColor;
};

export interface InteractiveNeuralVortexProps {
  className?: string;
  palette?: VortexPalette;
}

const DEFAULT_PALETTE: VortexPalette = {
  background: [0.07, 0.08, 0.07],
  primary: [0.16, 0.35, 0.14],
  secondary: [0.61, 1, 0.23],
  accent: [0.07, 0.24, 0.08],
};

const VERTEX = `precision mediump float;
attribute vec2 a_position;
varying vec2 vUv;
void main() {
  vUv = .5 * (a_position + 1.);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT = `precision mediump float;
varying vec2 vUv;
uniform float u_time;
uniform float u_ratio;
uniform vec2 u_pointer_position;
uniform float u_scroll_progress;
uniform vec3 u_background;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_accent;

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

float neuro_shape(vec2 uv, float t, float p) {
  vec2 sine_acc = vec2(0.);
  vec2 res = vec2(0.);
  float scale = 8.;
  for (int j = 0; j < 15; j++) {
    uv = rotate(uv, 1.);
    sine_acc = rotate(sine_acc, 1.);
    vec2 layer = uv * scale + float(j) + sine_acc - t;
    sine_acc += sin(layer) + 2.4 * p;
    res += (.5 + .5 * cos(layer)) / scale;
    scale *= 1.2;
  }
  return res.x + res.y;
}

void main() {
  vec2 uv = .5 * vUv;
  uv.x *= u_ratio;
  vec2 pointer = vUv - u_pointer_position;
  pointer.x *= u_ratio;
  float p = clamp(length(pointer), 0., 1.);
  p = .5 * pow(1. - p, 2.);
  float t = .001 * u_time;
  vec3 color = vec3(0.);
  float noise = neuro_shape(uv, t, p);
  noise = 1.2 * pow(noise, 3.);
  noise += pow(noise, 10.);
  noise = max(0., noise - .5);
  noise *= 1. - length(vUv - .5);
  color = mix(u_primary, u_secondary, 0.32 + 0.16 * sin(2.0 * u_scroll_progress + 1.2));
  color += u_accent * sin(2.0 * u_scroll_progress + 1.5);
  vec3 finalColor = mix(u_background, clamp(color, 0., 1.), clamp(noise * 1.5, 0., 1.));
  gl_FragColor = vec4(finalColor, 1.);
}`;

export default function InteractiveNeuralVortex({ className, palette = DEFAULT_PALETTE }: InteractiveNeuralVortexProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      console.error('Neural vortex shader error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }
    const program = gl.createProgram();
    if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); return; }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Neural vortex program error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    if (!buffer) { gl.deleteProgram(program); return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      time: gl.getUniformLocation(program, 'u_time'),
      ratio: gl.getUniformLocation(program, 'u_ratio'),
      pointer: gl.getUniformLocation(program, 'u_pointer_position'),
      scroll: gl.getUniformLocation(program, 'u_scroll_progress'),
      background: gl.getUniformLocation(program, 'u_background'),
      primary: gl.getUniformLocation(program, 'u_primary'),
      secondary: gl.getUniformLocation(program, 'u_secondary'),
      accent: gl.getUniformLocation(program, 'u_accent'),
    };
    gl.uniform3fv(uniforms.background, palette.background);
    gl.uniform3fv(uniforms.primary, palette.primary);
    gl.uniform3fv(uniforms.secondary, palette.secondary);
    gl.uniform3fv(uniforms.accent, palette.accent);

    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    let frame = 0;
    let visible = document.visibilityState === 'visible';
    let inView = true;
    let disposed = false;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * 0.8;
      const rawWidth = Math.max(1, Math.round(bounds.width * dpr));
      const rawHeight = Math.max(1, Math.round(bounds.height * dpr));
      const scale = Math.min(1, Math.sqrt(2_000_000 / Math.max(1, rawWidth * rawHeight)));
      canvas.width = Math.max(1, Math.round(rawWidth * scale));
      canvas.height = Math.max(1, Math.round(rawHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uniforms.ratio, canvas.width / canvas.height);
    };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
      pointer.targetX = (event.clientX - bounds.left) / bounds.width;
      pointer.targetY = 1 - (event.clientY - bounds.top) / bounds.height;
    };
    const onPointerLeave = () => {
      pointer.targetX = 0.5;
      pointer.targetY = 0.5;
    };
    const onScroll = () => {
      if (reducedMotion) render(performance.now());
    };

    const render = (now: number) => {
      frame = 0;
      if (disposed || !visible || !inView) return;
      pointer.x += (pointer.targetX - pointer.x) * 0.2;
      pointer.y += (pointer.targetY - pointer.y) * 0.2;
      gl.uniform1f(uniforms.time, reducedMotion ? 0 : now - started);
      gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.scroll, window.scrollY / (2 * window.innerHeight));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reducedMotion) schedule();
    };
    const schedule = () => {
      if (!disposed && visible && inView && frame === 0) frame = requestAnimationFrame(render);
    };
    const onVisibilityChange = () => {
      visible = document.visibilityState === 'visible';
      if (visible) schedule();
      else { cancelAnimationFrame(frame); frame = 0; }
    };
    const observer = new ResizeObserver(() => { resize(); schedule(); });
    observer.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      if (inView) schedule();
      else { cancelAnimationFrame(frame); frame = 0; }
    });
    intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });
    if (!reducedMotion) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('blur', onPointerLeave);
    }
    resize();
    schedule();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', onPointerLeave);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [palette]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
