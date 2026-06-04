/**
 * SkiaBackground
 *
 * Animated shader gradient that renders behind the home screen.
 * Uses @shopify/react-native-skia for GPU-accelerated rendering.
 * Produces a slow-moving aurora/nebula effect in the app's purple/blue palette.
 */
import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import {
  Canvas,
  Shader,
  Fill,
  Skia,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');

const source = Skia.RuntimeEffect.Make(`
  uniform float2 iResolution;
  uniform float iTime;

  // Smooth noise-like function
  float hash(float2 p) {
    float h = dot(p, float2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(float2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      val += amp * noise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / iResolution;
    float t = iTime * 0.08; // very slow movement

    // Layered noise for organic flow
    float n1 = fbm(uv * 3.0 + float2(t * 0.7, t * 0.5));
    float n2 = fbm(uv * 2.0 + float2(-t * 0.4, t * 0.8) + 5.0);
    float n3 = fbm(uv * 4.0 + float2(t * 0.3, -t * 0.6) + 10.0);

    // Color palette: deep purple → blue → cyan accents
    half3 deepPurple = half3(0.06, 0.02, 0.12);  // #0F0520
    half3 purple     = half3(0.20, 0.10, 0.35);   // #331A59
    half3 blue       = half3(0.08, 0.12, 0.30);   // #141F4D
    half3 cyan       = half3(0.10, 0.25, 0.40);   // #1A4066

    // Blend colors based on noise
    half3 col = deepPurple;
    col = mix(col, purple, smoothstep(0.3, 0.7, n1) * 0.6);
    col = mix(col, blue,   smoothstep(0.4, 0.8, n2) * 0.4);
    col = mix(col, cyan,   smoothstep(0.5, 0.9, n3) * 0.2);

    // Subtle vignette
    float2 center = uv - 0.5;
    float vignette = 1.0 - dot(center, center) * 1.2;
    col *= half3(vignette);

    // Keep it dark — this sits behind other elements
    col *= half3(0.7);

    return half4(col, 1.0);
  }
`)!;

export default function SkiaBackground() {
  const clock = useClock();

  const uniforms = useDerivedValue(() => ({
    iResolution: vec(W, H),
    iTime: clock.value / 1000,
  }));

  if (!source) return null;

  return (
    <Canvas style={[StyleSheet.absoluteFill, styles.canvas]} pointerEvents="none">
      <Fill>
        <Shader source={source} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    zIndex: -1,
  },
});
