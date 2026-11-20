import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, type Camera, type Matrix4, type PerspectiveCamera, type Texture } from 'three'

const SSR_MAX_SAMPLES = 24

const FRAGMENT_SHADER = `
#define SSR_MAX_SAMPLES ${SSR_MAX_SAMPLES}

uniform sampler2D ssrNormalBuffer;
uniform int ssrUseNormal;
uniform float ssrSamples;
uniform float ssrMaxDistance;
uniform float ssrThickness;
uniform float ssrIntensity;
uniform mat4 ssrProjectionMatrix;
uniform float ssrProjectionScale;

float ssrHash(vec2 seed) {
  return fract(sin(dot(seed, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 ssrViewPosition(vec2 uv, float sampledDepth) {
  float viewZ = getViewZ(sampledDepth);
  float distance = max(-viewZ, 0.001);
  return vec3(
    (uv.x * 2.0 - 1.0) * distance / ssrProjectionScale,
    (uv.y * 2.0 - 1.0) * distance / (ssrProjectionScale * aspect),
    viewZ
  );
}

vec3 ssrReadNormal(vec2 uv) {
  vec3 result = vec3(0.0, 0.0, 1.0);
  if (ssrUseNormal == 1) {
    result = normalize(texture2D(ssrNormalBuffer, uv).rgb * 2.0 - 1.0);
  } else {
    float center = readDepth(uv);
    float dx = readDepth(uv + vec2(texelSize.x, 0.0)) - center;
    float dy = readDepth(uv + vec2(0.0, texelSize.y)) - center;
    result = normalize(vec3(-dx * 80.0, -dy * 80.0, 1.0));
  }
  return result;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec3 result = inputColor.rgb;

  if (depth < 1.0) {
    vec3 viewPosition = ssrViewPosition(uv, depth);
    vec3 normal = ssrReadNormal(uv);
    vec3 viewDirection = normalize(viewPosition);
    vec3 reflected = reflect(viewDirection, normal);

    float hit = 0.0;
    vec3 hitColor = result;
    float fade = 0.0;

    for (int i = 0; i < SSR_MAX_SAMPLES; i++) {
      float sampleWeight = step(float(i), ssrSamples - 1.0) * (1.0 - hit);
      float t = (float(i) + 1.0) / max(ssrSamples, 1.0) * ssrMaxDistance;
      vec3 rayPosition = viewPosition + reflected * t;
      vec4 clip = ssrProjectionMatrix * vec4(rayPosition, 1.0);
      sampleWeight *= step(0.0001, clip.w);

      vec2 projected = clip.xy / max(clip.w, 0.0001) * 0.5 + 0.5;
      vec2 sampleUv = clamp(projected, 0.0, 1.0);
      sampleWeight *= step(0.0, projected.x) * step(projected.x, 1.0);
      sampleWeight *= step(0.0, projected.y) * step(projected.y, 1.0);

      float sampledDepth = readDepth(sampleUv);
      sampleWeight *= step(sampledDepth, 0.999);
      vec3 sampleViewPosition = ssrViewPosition(sampleUv, sampledDepth);

      float delta = sampleViewPosition.z - rayPosition.z;
      float thicknessCheck = step(0.0, delta) * step(delta, ssrThickness);
      sampleWeight *= thicknessCheck;

      vec3 color = texture2D(inputBuffer, sampleUv).rgb;
      hitColor = mix(hitColor, color, sampleWeight);
      fade = mix(fade, 1.0 - t / max(ssrMaxDistance, 0.001), sampleWeight);
      hit = max(hit, sampleWeight);
    }

    result = mix(result, hitColor, clamp(hit * ssrIntensity * fade, 0.0, 1.0));
  }

  outputColor = vec4(result, inputColor.a);
}
`

export interface ScreenSpaceReflectionOptions {
  samples: number
  maxDistance: number
  thickness: number
  intensity: number
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function normalizeOptions(options: ScreenSpaceReflectionOptions): ScreenSpaceReflectionOptions {
  return {
    samples: Math.round(clamp(options.samples, 4, SSR_MAX_SAMPLES, 12)),
    maxDistance: clamp(options.maxDistance, 0.1, 20, 6),
    thickness: clamp(options.thickness, 0.01, 2, 0.3),
    intensity: clamp(options.intensity, 0, 1, 0.6),
  }
}

function projectionScale(camera: Camera): number {
  const fov = (camera as PerspectiveCamera).fov
  const degrees = typeof fov === 'number' && fov > 0 ? fov : 50
  return 1 / Math.tan((degrees * Math.PI) / 360)
}

export class ScreenSpaceReflectionEffect extends Effect {
  constructor(camera: Camera, normalBuffer: Texture | null, options: ScreenSpaceReflectionOptions) {
    const normalized = normalizeOptions(options)
    const uniforms = new Map<string, Uniform>()

    uniforms.set('ssrNormalBuffer', new Uniform(normalBuffer))
    uniforms.set('ssrUseNormal', new Uniform(normalBuffer ? 1 : 0))
    uniforms.set('ssrSamples', new Uniform(normalized.samples))
    uniforms.set('ssrMaxDistance', new Uniform(normalized.maxDistance))
    uniforms.set('ssrThickness', new Uniform(normalized.thickness))
    uniforms.set('ssrIntensity', new Uniform(normalized.intensity))
    uniforms.set('ssrProjectionMatrix', new Uniform(camera.projectionMatrix.clone()))
    uniforms.set('ssrProjectionScale', new Uniform(projectionScale(camera)))

    super('ScreenSpaceReflectionEffect', FRAGMENT_SHADER, {
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.SRC,
      uniforms,
    })
  }

  setParams(options: ScreenSpaceReflectionOptions): void {
    const normalized = normalizeOptions(options)
    const values: Array<[string, number]> = [
      ['ssrSamples', normalized.samples],
      ['ssrMaxDistance', normalized.maxDistance],
      ['ssrThickness', normalized.thickness],
      ['ssrIntensity', normalized.intensity],
    ]
    for (const [name, value] of values) {
      const uniform = this.uniforms.get(name)
      if (uniform) uniform.value = value
    }
  }

  updateProjection(camera: Camera): void {
    const matrix = this.uniforms.get('ssrProjectionMatrix')?.value as Matrix4 | undefined
    matrix?.copy(camera.projectionMatrix)
    const scale = this.uniforms.get('ssrProjectionScale')
    if (scale) scale.value = projectionScale(camera)
  }
}
