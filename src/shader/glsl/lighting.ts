/**
 * 灯光 uniform 声明和经典光照模型函数。
 *
 * 每个灯一个 evaluateLightN 函数，避免在 WebGL1 中动态索引 uniform 数组。
 */

export const LIGHT_UNIFORMS = `
#define MAX_LIGHTS 3

uniform int u_lightCount;
uniform float u_lightType[MAX_LIGHTS];
uniform vec3 u_lightColor[MAX_LIGHTS];
uniform float u_lightIntensity[MAX_LIGHTS];
uniform vec3 u_lightDirection[MAX_LIGHTS];
uniform vec3 u_lightPosition[MAX_LIGHTS];
uniform float u_lightDecay[MAX_LIGHTS];
`

export const PI_CONSTANT = 'const float PI = 3.14159265359;'

export type ClassicShadingModel = 'lambert' | 'blinnPhong'

function classicLightFunction(index: number, model: ClassicShadingModel): string {
  const reflection =
    model === 'blinnPhong'
      ? `
  vec3 H = normalize(V + L);
  float NdotH = max(dot(N, H), 0.0);
  float specular = pow(NdotH, max(shininess, 1.0)) * specularStrength;
`
      : ''

  const result =
    model === 'blinnPhong'
      ? 'return (baseColor / PI + vec3(specular)) * lightColor * NdotL * attenuation * shadow;'
      : 'return (baseColor / PI) * lightColor * NdotL * attenuation * shadow;'

  return `
vec3 evaluateLight${index}(vec3 N, vec3 V, vec3 baseColor, float shininess, float specularStrength, float shadow) {
  if (u_lightCount <= ${index}) return vec3(0.0);

  float type = u_lightType[${index}];
  vec3 lightColor = u_lightColor[${index}] * u_lightIntensity[${index}];

  // 环境光：与 PBR 分支保持一致，直接叠加到表面颜色
  if (type < 0.5) return lightColor * baseColor;

  vec3 L;
  float attenuation = 1.0;
  if (type < 1.5) {
    L = normalize(-u_lightDirection[${index}]);
  } else {
    vec3 delta = u_lightPosition[${index}] - vWorldPosition;
    float distance = length(delta);
    L = delta / max(distance, 1e-4);
    attenuation = 1.0 / (1.0 + distance * distance * u_lightDecay[${index}]);
  }

  float NdotL = max(dot(N, L), 0.0);
  if (NdotL <= 0.0) return vec3(0.0);
${reflection}
  ${result}
}
`
}

export function classicLightFunctions(model: ClassicShadingModel): string {
  return [0, 1, 2].map((index) => classicLightFunction(index, model)).join('\n')
}
