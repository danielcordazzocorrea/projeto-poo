'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type AnimatedShaderBackgroundProps = { className?: string };

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float iTime;
  uniform vec2 iResolution;

  #define NUM_OCTAVES 3

  float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 u = fract(p);
    u = u*u*(3.0-2.0*u);
    float res = mix(
      mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
      mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
    return res * res;
  }

  float fbm(vec2 x) {
    float v = 0.0;
    float a = 0.3;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
      v += a * noise(x);
      x = rot * x * 2.0 + shift;
      a *= 0.4;
    }
    return v;
  }

  void main() {
    vec2 shake = vec2(sin(iTime * 1.2) * 0.005, cos(iTime * 2.1) * 0.005);
    vec2 p = ((gl_FragCoord.xy + shake * iResolution.xy) - iResolution.xy * 0.5) / iResolution.y * mat2(6.0, -4.0, 4.0, 6.0);
    vec2 v;
    vec4 o = vec4(0.0);
    float f = 2.0 + fbm(p + vec2(iTime * 5.0, 0.0)) * 0.5;

    for (float i = 0.0; i < 35.0; i++) {
      v = p + cos(i * i + (iTime + p.x * 0.08) * 0.025 + i * vec2(13.0, 11.0)) * 3.5 + vec2(sin(iTime * 3.0 + i) * 0.003, cos(iTime * 3.5 - i) * 0.003);
      float tailNoise = fbm(v + vec2(iTime * 0.5, i)) * 0.3 * (1.0 - (i / 35.0));
      vec3 brandGreen = mix(
        vec3(0.247, 0.561, 0.0),
        vec3(0.616, 1.0, 0.227),
        0.5 + 0.5 * sin(i * 0.25 + iTime * 0.35)
      );
      vec4 auroraColors = vec4(mix(brandGreen, vec3(0.788, 0.929, 0.682), 0.2), 1.0);
      vec4 currentContribution = auroraColors * exp(sin(i * i + iTime * 0.8)) / length(max(v, vec2(v.x * f * 0.015, v.y * 1.5)));
      float thinnessFactor = smoothstep(0.0, 1.0, i / 35.0) * 0.6;
      o += currentContribution * (1.0 + tailNoise * 0.8) * thinnessFactor;
    }

    vec3 value = pow(max(o.rgb / 48.0, vec3(0.0)), vec3(1.25));
    vec3 glow = (1.0 - exp(-2.0 * value)) / (1.0 + exp(-2.0 * value));
    gl_FragColor = vec4(vec3(0.035, 0.075, 0.05) + glow * 1.5, 1.0);
  }
`;

export default function AnoAI({ className }: AnimatedShaderBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      uniforms: { iTime: { value: 0 }, iResolution: { value: new THREE.Vector2(1, 1) } },
      vertexShader,
      fragmentShader,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(renderer.domElement);

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(window.devicePixelRatio || 1, 1.25) * 0.7;
      const capped = Math.min(scale, Math.sqrt(1_200_000 / (width * height)));
      renderer.setSize(Math.max(1, Math.round(width * capped)), Math.max(1, Math.round(height * capped)), false);
      material.uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    let elapsed = 0;
    let lastFrame = 0;
    const render = (now: number) => {
      if (lastFrame) elapsed += Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      material.uniforms.iTime.value = elapsed;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        lastFrame = 0;
      } else {
        frame = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.remove();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className={className} style={{ background: '#09140e', overflow: 'hidden' }} />;
}
