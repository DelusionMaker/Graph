import type { EnvironmentEmit } from '../emitters'

export type EnvironmentShaderExpressions = EnvironmentEmit

/** 等距柱状环境贴图方向 → UV；无 PMREM 卷积，属于近似 IBL。 */
export function environmentFunctions(): string {
  return `
vec2 envDirectionToUv(vec3 direction, float rotation) {
  float angle = atan(direction.z, direction.x) + rotation;
  return vec2(
    fract(angle / (2.0 * PI) + 0.5),
    asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
  );
}
`
}

export function environmentPbrIbl(environment: EnvironmentShaderExpressions): string {
  return `
  // 近似 IBL：无 PMREM 预卷积，粗糙度只用于混合采样方向
  vec3 envR = reflect(-V, N);
  vec3 envSpecDir = normalize(mix(envR, N, clamp(roughness * 0.6, 0.0, 1.0)));
  vec3 envIrradiance = texture2D(${environment.sampler}, envDirectionToUv(N, ${environment.rotation})).rgb;
  vec3 envRadiance = texture2D(${environment.sampler}, envDirectionToUv(envSpecDir, ${environment.rotation})).rgb;
  vec3 envDiffuse = envIrradiance * baseColor * (1.0 - metalness) * (1.0 - roughness * 0.5);
  vec3 envSpecular = envRadiance * F0;
  color += (envDiffuse + envSpecular) * ${environment.intensity};
`
}

export function environmentClassicIbl(environment: EnvironmentShaderExpressions): string {
  return `
  vec3 envIrradiance = texture2D(${environment.sampler}, envDirectionToUv(N, ${environment.rotation})).rgb;
  color += envIrradiance * baseColor * ${environment.intensity};
`
}
