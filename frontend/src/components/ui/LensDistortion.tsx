"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Clock,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";

const vertexShader = `
precision highp float;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uStrength;
uniform float uRadius;

out vec4 fragColor;

void main() {
  vec2 frag = gl_FragCoord.xy / uResolution.xy;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

  vec2 center = uCenter;
  center.x *= aspect.x;

  vec2 uv = frag;
  uv.x *= aspect.x;

  vec2 delta = uv - center;
  float dist = length(delta);
  float falloff = smoothstep(uRadius, 0.0, dist);
  vec2 dir = normalize(delta + vec2(0.0001));

  float wave = sin(dist * 22.0 - uTime * 2.2);
  float bend = falloff * uStrength * (0.095 + 0.045 * wave);

  vec2 warped = uv + dir * bend;
  float warpedDist = length(warped - center);
  float core = exp(-pow(warpedDist / max(uRadius * 0.38, 0.001), 2.0));
  float halo = exp(-pow(warpedDist / max(uRadius * 0.92, 0.001), 2.0));
  float streak = exp(-pow((warped.y - center.y) * 8.0, 2.0)) * falloff;
  float rim = smoothstep(uRadius, uRadius * 0.22, abs(sin(warpedDist * 16.0 - uTime * 1.6)));

  vec3 warm = vec3(0.95, 0.71, 0.22);
  vec3 hot = vec3(1.0, 0.92, 0.58);
  vec3 color = mix(warm, hot, clamp(core * 1.2 + 0.45 * rim, 0.0, 1.0));
  color = color * 1.8 + vec3(0.18, 0.10, 0.02) * streak;

  float alpha = clamp(uStrength * (0.82 * core + 0.56 * halo + 0.22 * rim + 0.16 * streak), 0.0, 0.88);
  fragColor = vec4(color, alpha);
}
`;

export type LensDistortionHandle = {
  setPointer: (x: number, y: number, hovered: boolean) => void;
};

export interface LensDistortionProps {
  className?: string;
  radius?: number;
  strength?: number;
}

export const LensDistortion = forwardRef<LensDistortionHandle, LensDistortionProps>(function LensDistortion(
  { className = "", radius = 0.42, strength = 0.12 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const targetStrengthRef = useRef(0);
  const currentStrengthRef = useRef(0);
  const targetCenterRef = useRef(new Vector2(0.5, 0.5));
  const currentCenterRef = useRef(new Vector2(0.5, 0.5));
  const sizeRef = useRef(new Vector2(1, 1));
  const clockRef = useRef(new Clock());

  const renderFrame = () => {
    const renderer = rendererRef.current;
    const material = materialRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    if (!renderer || !material || !scene || !camera) {
      animationRef.current = null;
      return;
    }

    const nextStrength = currentStrengthRef.current + (targetStrengthRef.current - currentStrengthRef.current) * 0.08;
    currentStrengthRef.current = nextStrength;
    currentCenterRef.current.x += (targetCenterRef.current.x - currentCenterRef.current.x) * 0.06;
    currentCenterRef.current.y += (targetCenterRef.current.y - currentCenterRef.current.y) * 0.06;

    material.uniforms.uTime.value = clockRef.current.getElapsedTime();
    material.uniforms.uStrength.value = nextStrength;
    material.uniforms.uCenter.value.copy(currentCenterRef.current);

    renderer.render(scene, camera);

    const needsMoreFrames =
      targetStrengthRef.current > 0.0001 ||
      nextStrength > 0.0008 ||
      Math.abs(targetCenterRef.current.x - currentCenterRef.current.x) > 0.0005 ||
      Math.abs(targetCenterRef.current.y - currentCenterRef.current.y) > 0.0005;

    if (needsMoreFrames) {
      animationRef.current = window.requestAnimationFrame(renderFrame);
    } else {
      animationRef.current = null;
    }
  };

  useImperativeHandle(ref, () => ({
    setPointer(x: number, y: number, hovered: boolean) {
      targetCenterRef.current.set(x, y);
      targetStrengthRef.current = hovered ? strength : 0;

      if (animationRef.current === null) {
        animationRef.current = window.requestAnimationFrame(renderFrame);
      }
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const material = new ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
        uCenter: { value: new Vector2(0.5, 0.5) },
        uStrength: { value: 0 },
        uRadius: { value: radius },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new PlaneGeometry(2, 2);
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    const setSize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      const dpr = renderer.getPixelRatio();

      renderer.setSize(width, height, false);
      sizeRef.current.set(width * dpr, height * dpr);
      material.uniforms.uResolution.value.set(sizeRef.current.x, sizeRef.current.y);
    };

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(setSize) : null;
    ro?.observe(container);
    setSize();

    rendererRef.current = renderer;
    materialRef.current = material;
    sceneRef.current = scene;
    cameraRef.current = camera;

    return () => {
      ro?.disconnect();

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      geometry.dispose();
      material.dispose();
      renderer.dispose();

      rendererRef.current = null;
      materialRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;

      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [radius]);

  return (
    <div ref={containerRef} className={className} aria-hidden="true" />
  );
});
