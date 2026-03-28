import { useEffect, useRef } from 'react';
import {
  Clock, Mesh, OrthographicCamera, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer
} from 'three';

const MAX_GRADIENT_STOPS = 8;

const vertexShader = `
  precision highp float;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float iTime;
  uniform vec3 iResolution;
  uniform float animationSpeed;
  uniform bool enableTop;
  uniform bool enableMiddle;
  uniform bool enableBottom;
  uniform int topLineCount;
  uniform int middleLineCount;
  uniform int bottomLineCount;
  uniform float topLineDistance;
  uniform float middleLineDistance;
  uniform float bottomLineDistance;
  uniform vec3 topWavePosition;
  uniform vec3 middleWavePosition;
  uniform vec3 bottomWavePosition;
  uniform vec2 iMouse;
  uniform bool interactive;
  uniform float bendRadius;
  uniform float bendStrength;
  uniform float bendInfluence;
  uniform bool parallax;
  uniform float parallaxStrength;
  uniform vec2 parallaxOffset;
  uniform vec3 lineGradient[8];
  uniform int lineGradientCount;

  const vec3 BLACK = vec3(0.0);
  const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;
  const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;

  mat2 rotate(float r) {
    return mat2(cos(r), sin(r), -sin(r), cos(r));
  }

  vec3 background_color(vec2 uv) {
    vec3 col = vec3(0.0);
    float y = sin(uv.x - 0.2) * 0.3 - 0.1;
    float m = uv.y - y;
    col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
    col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
    return col * 0.5;
  }

  vec3 getLineColor(float t, vec3 baseColor) {
    if (lineGradientCount <= 0) return baseColor;
    if (lineGradientCount == 1) return lineGradient[0];
    float scaledT = clamp(t, 0.0, 1.0) * float(lineGradientCount - 1);
    int idx = int(floor(scaledT));
    float frac = scaledT - float(idx);
    vec3 c1 = lineGradient[idx];
    vec3 c2 = (idx + 1 < lineGradientCount) ? lineGradient[idx + 1] : lineGradient[lineGradientCount - 1];
    return mix(c1, c2, frac);
  }

  float sdLine(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  vec3 drawWave(vec2 uv, float time, vec3 wavePos, int lCount, float lDist, vec3 baseColor) {
    vec3 col = vec3(0.0);
    float wx = wavePos.x;
    float wy = wavePos.y;
    float wr = wavePos.z;
    for (int i = 0; i < 20; i++) {
      if (i >= lCount) break;
      float fi = float(i);
      float offset = fi * lDist;
      vec2 a = rotate(wr) * vec2(-2.0, wy + offset) + vec2(wx * 0.1, 0.0);
      vec2 b = rotate(wr) * vec2( 2.0, wy + offset + sin(time * animationSpeed + fi * 0.5) * 0.1);
      float d = sdLine(uv, a, b);
      float alpha = smoothstep(0.008, 0.0, d);
      vec3 lineColor = getLineColor(fi / float(lCount), baseColor);
      col += lineColor * alpha;
    }
    return col;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution.xy) / iResolution.y;
    vec2 baseUv = uv;

    if (parallax) {
      uv += parallaxOffset;
    }

    vec2 mouseUv = vec2(0.0);
    if (interactive) {
      mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
      mouseUv.y *= -1.0;
    }

    vec3 col = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);

    if (interactive && bendInfluence > 0.0) {
      float dist = length(uv - mouseUv);
      float influence = smoothstep(bendRadius * 0.1, 0.0, dist) * bendInfluence;
      vec2 dir = normalize(uv - mouseUv + vec2(0.0001));
      uv += dir * influence * bendStrength * 0.1;
    }

    if (enableBottom) {
      col += drawWave(uv, iTime, bottomWavePosition, bottomLineCount, bottomLineDistance, vec3(1.0));
    }
    if (enableMiddle) {
      col += drawWave(uv, iTime, middleWavePosition, middleLineCount, middleLineDistance, vec3(1.0));
    }
    if (enableTop) {
      col += drawWave(uv, iTime, topWavePosition, topLineCount, topLineDistance, vec3(1.0));
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

type WavePosition = { x?: number; y?: number; rotate?: number };

type FloatingLinesProps = {
  linesGradient?: string[];
  enabledWaves?: ('top' | 'middle' | 'bottom')[];
  lineCount?: number | number[];
  lineDistance?: number | number[];
  topWavePosition?: WavePosition;
  middleWavePosition?: WavePosition;
  bottomWavePosition?: WavePosition;
  animationSpeed?: number;
  interactive?: boolean;
  bendRadius?: number;
  bendStrength?: number;
  mouseDamping?: number;
  parallax?: boolean;
  parallaxStrength?: number;
  mixBlendMode?: React.CSSProperties['mixBlendMode'];
};

function hexToVec3(hex: string): Vector3 {
  let v = hex.trim().replace('#', '');
  if (v.length === 3) v = v[0]+v[0]+v[1]+v[1]+v[2]+v[2];
  return new Vector3(
    parseInt(v.slice(0,2),16)/255,
    parseInt(v.slice(2,4),16)/255,
    parseInt(v.slice(4,6),16)/255
  );
}

export default function FloatingLines({
  linesGradient,
  enabledWaves = ['top','middle','bottom'],
  lineCount = 6,
  lineDistance = 5,
  topWavePosition,
  middleWavePosition,
  bottomWavePosition = { x:2.0, y:-0.7, rotate:-1 },
  animationSpeed = 1,
  interactive = true,
  bendRadius = 5.0,
  bendStrength = -0.5,
  mouseDamping = 0.05,
  parallax = true,
  parallaxStrength = 0.2,
  mixBlendMode = 'screen',
}: FloatingLinesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetMouseRef    = useRef(new Vector2(-1000,-1000));
  const currentMouseRef   = useRef(new Vector2(-1000,-1000));
  const targetInfluenceRef  = useRef(0);
  const currentInfluenceRef = useRef(0);
  const targetParallaxRef   = useRef(new Vector2(0,0));
  const currentParallaxRef  = useRef(new Vector2(0,0));

  const getCount = (w: 'top'|'middle'|'bottom') => {
    if (typeof lineCount === 'number') return lineCount;
    const i = enabledWaves.indexOf(w);
    return i >= 0 ? (lineCount[i] ?? 6) : 0;
  };
  const getDist = (w: 'top'|'middle'|'bottom') => {
    if (typeof lineDistance === 'number') return lineDistance;
    const i = enabledWaves.indexOf(w);
    return i >= 0 ? (lineDistance[i] ?? 5) : 5;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;

    const scene    = new Scene();
    const camera   = new OrthographicCamera(-1,1,1,-1,0,1);
    camera.position.z = 1;
    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.domElement.style.width  = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const uniforms = {
      iTime:              { value: 0 },
      iResolution:        { value: new Vector3(1,1,1) },
      animationSpeed:     { value: animationSpeed },
      enableTop:          { value: enabledWaves.includes('top') },
      enableMiddle:       { value: enabledWaves.includes('middle') },
      enableBottom:       { value: enabledWaves.includes('bottom') },
      topLineCount:       { value: getCount('top') },
      middleLineCount:    { value: getCount('middle') },
      bottomLineCount:    { value: getCount('bottom') },
      topLineDistance:    { value: getDist('top')    * 0.01 },
      middleLineDistance: { value: getDist('middle') * 0.01 },
      bottomLineDistance: { value: getDist('bottom') * 0.01 },
      topWavePosition:    { value: new Vector3(topWavePosition?.x??10, topWavePosition?.y??0.5, topWavePosition?.rotate??-0.4) },
      middleWavePosition: { value: new Vector3(middleWavePosition?.x??5, middleWavePosition?.y??0, middleWavePosition?.rotate??0.2) },
      bottomWavePosition: { value: new Vector3(bottomWavePosition?.x??2, bottomWavePosition?.y??-0.7, bottomWavePosition?.rotate??0.4) },
      iMouse:             { value: new Vector2(-1000,-1000) },
      interactive:        { value: interactive },
      bendRadius:         { value: bendRadius },
      bendStrength:       { value: bendStrength },
      bendInfluence:      { value: 0 },
      parallax:           { value: parallax },
      parallaxStrength:   { value: parallaxStrength },
      parallaxOffset:     { value: new Vector2(0,0) },
      lineGradient:       { value: Array.from({length:MAX_GRADIENT_STOPS}, ()=>new Vector3(1,1,1)) },
      lineGradientCount:  { value: 0 },
    };

    if (linesGradient?.length) {
      const stops = linesGradient.slice(0, MAX_GRADIENT_STOPS);
      uniforms.lineGradientCount.value = stops.length;
      stops.forEach((hex,i) => {
        const c = hexToVec3(hex);
        uniforms.lineGradient.value[i].set(c.x, c.y, c.z);
      });
    }

    const material = new ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    const geometry = new PlaneGeometry(2,2);
    scene.add(new Mesh(geometry, material));

    const setSize = () => {
      if (!active) return;
      const w = container.clientWidth||1, h = container.clientHeight||1;
      renderer.setSize(w, h, false);
      uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height, 1);
    };
    setSize();

    const ro = typeof ResizeObserver!=='undefined' ? new ResizeObserver(()=>{ if(active) setSize(); }) : null;
    ro?.observe(container);

    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const dpr  = renderer.getPixelRatio();
      targetMouseRef.current.set((e.clientX-rect.left)*dpr, (rect.height-(e.clientY-rect.top))*dpr);
      targetInfluenceRef.current = 1;
      if (parallax) {
        targetParallaxRef.current.set(
          ((e.clientX-rect.left)/rect.width - 0.5) * parallaxStrength,
          -((e.clientY-rect.top)/rect.height - 0.5) * parallaxStrength
        );
      }
    };
    const onLeave = () => { targetInfluenceRef.current = 0; };
    if (interactive) {
      renderer.domElement.addEventListener('pointermove', onMove);
      renderer.domElement.addEventListener('pointerleave', onLeave);
    }

    const clock = new Clock();
    let raf = 0;
    const loop = () => {
      if (!active) return;
      uniforms.iTime.value = clock.getElapsedTime();
      if (interactive) {
        currentMouseRef.current.lerp(targetMouseRef.current, mouseDamping);
        uniforms.iMouse.value.copy(currentMouseRef.current);
        currentInfluenceRef.current += (targetInfluenceRef.current - currentInfluenceRef.current) * mouseDamping;
        uniforms.bendInfluence.value = currentInfluenceRef.current;
      }
      if (parallax) {
        currentParallaxRef.current.lerp(targetParallaxRef.current, mouseDamping);
        uniforms.parallaxOffset.value.copy(currentParallaxRef.current);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (interactive) {
        renderer.domElement.removeEventListener('pointermove', onMove);
        renderer.domElement.removeEventListener('pointerleave', onLeave);
      }
      geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.parentElement?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width:'100%', height:'100%', mixBlendMode }}
    />
  );
}