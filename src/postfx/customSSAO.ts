import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, type Camera, type Matrix4, type PerspectiveCamera, type Texture } from 'three'

const SSAO_MAX_SAMPLES = 32

const FRAGMENT_SHADER = `
#define SSAO_MAX_SAMPLES ${SSAO_MAX_SAMPLES}

uniform sampler2D ssaoNormalBuffer;
uniform int ssaoUseNormal;
uniform float ssaoSamples;
uniform float ssaoRadius;
uniform float ssaoIntensity;
uniform float ssaoDistanceThreshold;
uniform float ssaoDistanceFalloff;
uniform float ssaoProximityThreshold;
uniform float ssaoProximityFalloff;
uniform mat4 ssaoProjectionMatrix;
uniform float ssaoProjectionScale;

float ssaoHash(vec2 seed) {
  return fract(sin(dot(seed, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 ssaoHemisphereSample(float index, vec2 seed) {
  float angle = ssaoHash(seed + vec2(index, index * 1.37)) * 6.28318530718;
  float z = abs(ssaoHash(seed + vec2(index * 2.11, index * 0.73)) * 2.0 - 1.0);
  float radius = sqrt(max(0.0, 1.0 - z * z));
  return vec3(cos(angle) * radius, sin(angle) * radius, z);
}

vec3 ssaoViewPosition(vec2 uv, float sampledDepth) {
  float viewZ = getViewZ(sampledDepth);
  float distance = max(-viewZ, 0.001);
  return vec3(
    (uv.x * 2.0 - 1.0) * distance / ssaoProjectionScale,
    (uv.y * 2.0 - 1.0) * distance / (ssaoProjectionScale * aspect),
    viewZ
  );
}

vec3 ssaoReadNormal(vec2 uv) {
  vec3 result = vec3(0.0, 0.0, 1.0);
  if (ssaoUseNormal == 1) {
    result = normalize(texture2D(ssaoNormalBuffer, uv).rgb * 2.0 - 1.0);
  } else {
    float center = readDepth(uv);
    float dx = readDepth(uv + vec2(texelSize.x, 0.0)) - center;
    float dy = readDepth(uv + vec2(0.0, texelSize.y)) - center;
    result = normalize(vec3(-dx * 80.0, -dy * 80.0, 1.0));
  }
  return result;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float occlusion = 0.0;

  if (depth < 1.0) {
    vec3 viewPosition = ssaoViewPosition(uv, depth);
    vec3 normal = ssaoReadNormal(uv);
    vec2 seed = uv * resolution.xy;

    vec3 randomVec = normalize(vec3(ssaoHash(seed) - 0.5, ssaoHash(seed + 17.0) - 0.5, 0.15));
    vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal) + vec3(1e-5));
    vec3 bitangent = cross(normal, tangent);
    mat3 basis = mat3(tangent, bitangent, normal);

    float count = 0.0;
    for (int i = 0; i < SSAO_MAX_SAMPLES; i++) {
      float sampleWeight = step(float(i), ssaoSamples - 1.0);
      vec3 samplePosition = viewPosition + basis * ssaoHemisphereSample(float(i), seed) * ssaoRadius;
      vec4 clip = ssaoProjectionMatrix * vec4(samplePosition, 1.0);
      sampleWeight *= step(0.0001, clip.w);

      vec2 projected = clip.xy / max(clip.w, 0.0001) * 0.5 + 0.5;
      vec2 sampleUv = clamp(projected, 0.0, 1.0);
      sampleWeight *= step(0.0, projected.x) * step(projected.x, 1.0);
      sampleWeight *= step(0.0, projected.y) * step(projected.y, 1.0);

      float sampledDepth = readDepth(sampleUv);
      sampleWeight *= step(sampledDepth, 0.999);

      vec3 sampleViewPosition = ssaoViewPosition(sampleUv, sampledDepth);
      float depthDelta = abs(viewPosition.z - sampleViewPosition.z);
      float rangeCheck = smoothstep(0.0, 1.0, ssaoRadius / max(depthDelta, 0.001));
      rangeCheck *= 1.0 - smoothstep(
        ssaoDistanceThreshold,
        ssaoDistanceThreshold + ssaoDistanceFalloff + 0.001,
        depthDelta
      );

      float bias = (0.005 + ssaoProximityThreshold * 0.01) * (1.0 + ssaoProximityFalloff);
      occlusion += sampleWeight * step(samplePosition.z + bias, sampleViewPosition.z) * rangeCheck;
      count += sampleWeight;
    }

    occlusion = count > 0.0 ? occlusion / count : 0.0;
  }

  float ao = clamp(1.0 - occlusion * ssaoIntensity, 0.0, 1.0);
  outputColor = vec4(inputColor.rgb * ao, inputColor.a);
}
`

export interface CustomSSAOOptions {
  samples: number
  radius: number
  intensity: number
  worldDistanceThreshold: number
  worldDistanceFalloff: number
  worldProximityThreshold: number
  worldProximityFalloff: number
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function normalizeOptions(options: CustomSSAOOptions): CustomSSAOOptions {
  return {
    samples: Math.round(clamp(options.samples, 4, SSAO_MAX_SAMPLES, 16)),
    // 节点上的 radius 是 0.01–1 的相对量；这里换算成约 0.1–10 的世界半径
    radius: clamp(options.radius * 10, 0.1, 10, 1),
    intensity: clamp(options.intensity, 0, 4, 1),
    worldDistanceThreshold: clamp(options.worldDistanceThreshold, 0, 2, 0.5),
    worldDistanceFalloff: clamp(options.worldDistanceFalloff, 0, 1, 0.1),
    worldProximityThreshold: clamp(options.worldProximityThreshold, 0, 2, 0.5),
    worldProximityFalloff: clamp(options.worldProximityFalloff, 0, 1, 0.1),
  }
}

function projectionScale(camera: Camera): number {
  const fov = (camera as PerspectiveCamera).fov
  const degrees = typeof fov === 'number' && fov > 0 ? fov : 50
  return 1 / Math.tan((degrees * Math.PI) / 360)
}

export class CustomSSAOEffect extends Effect {
  constructor(camera: Camera, normalBuffer: Texture | null, options: CustomSSAOOptions) {
    const normalized = normalizeOptions(options)
    const uniforms = new Map<string, Uniform>()

    uniforms.set('ssaoNormalBuffer', new Uniform(normalBuffer))
    uniforms.set('ssaoUseNormal', new Uniform(normalBuffer ? 1 : 0))
    uniforms.set('ssaoSamples', new Uniform(normalized.samples))
    uniforms.set('ssaoRadius', new Uniform(normalized.radius))
    uniforms.set('ssaoIntensity', new Uniform(normalized.intensity))
    uniforms.set('ssaoDistanceThreshold', new Uniform(normalized.worldDistanceThreshold))
    uniforms.set('ssaoDistanceFalloff', new Uniform(normalized.worldDistanceFalloff))
    uniforms.set('ssaoProximityThreshold', new Uniform(normalized.worldProximityThreshold))
    uniforms.set('ssaoProximityFalloff', new Uniform(normalized.worldProximityFalloff))
    uniforms.set('ssaoProjectionMatrix', new Uniform(camera.projectionMatrix.clone()))
    uniforms.set('ssaoProjectionScale', new Uniform(projectionScale(camera)))

    super('CustomSSAOEffect', FRAGMENT_SHADER, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      uniforms,
    })
  }

  setParams(options: CustomSSAOOptions): void {
    const normalized = normalizeOptions(options)
    const values: Array<[string, number]> = [
      ['ssaoSamples', normalized.samples],
      ['ssaoRadius', normalized.radius],
      ['ssaoIntensity', normalized.intensity],
      ['ssaoDistanceThreshold', normalized.worldDistanceThreshold],
      ['ssaoDistanceFalloff', normalized.worldDistanceFalloff],
      ['ssaoProximityThreshold', normalized.worldProximityThreshold],
      ['ssaoProximityFalloff', normalized.worldProximityFalloff],
    ]
    for (const [name, value] of values) {
      const uniform = this.uniforms.get(name)
      if (uniform) uniform.value = value
    }
  }

  updateProjection(camera: Camera): void {
    const matrix = this.uniforms.get('ssaoProjectionMatrix')?.value as Matrix4 | undefined
    matrix?.copy(camera.projectionMatrix)
    const scale = this.uniforms.get('ssaoProjectionScale')
    if (scale) scale.value = projectionScale(camera)
  }
}
