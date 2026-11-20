/**
 * GLSL 片段。
 *
 * 光照完全由这里生成，不再使用 three 的 Light / MeshStandardMaterial：
 * - PBR / Lambert / Blinn-Phong：自定义顶点/片元着色器，灯光参数以 uniform 数组传入；
 * - Unlit：只输出表面颜色。
 *
 * UV 使用独立的 `vShaderUv`，避免与 three 在 USE_UV 条件下声明的 `vUv` 重复定义。
 */

import { PBR_BRDF_FUNCTIONS } from './brdf'
import {
  LIGHT_UNIFORMS,
  PI_CONSTANT,
  classicLightFunctions,
  type ClassicShadingModel,
} from './lighting'
import {
  SHADOW_FACTOR_FUNCTION,
  SHADOW_LIGHT_INDEX_UNIFORM,
  SHADOW_PER_LIGHT_SELECTION,
  SHADOW_SAMPLING_UNIFORMS,
} from './shadow'

export const SHADER_UV_VARYING = 'varying vec2 vShaderUv;'
export const SHADER_UV_ASSIGN = 'vShaderUv = uv;'

export interface SurfaceExpressions {
  color: string
  roughness: string
  metalness: string
  emissive: string
  /** 仅 Blinn-Phong 使用；缺省值保证老工作流仍可编译 */
  shininess?: string
  specularStrength?: string
}

export const UNLIT_VERTEX = `
varying vec2 vShaderUv;

void main() {
  vShaderUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export function unlitFragment(declarations: string[], colorExpr: string): string {
  return `
${declarations.join('\n')}
varying vec2 vShaderUv;

void main() {
  vec3 baseColor = ${colorExpr};
  gl_FragColor = vec4(baseColor, 1.0);
}
`
}

/** 接收阴影的地面：复用同一张自定义 shadow map，不参与深度 pass */
export const GROUND_VERTEX = `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const GROUND_FRAGMENT = `
${SHADOW_SAMPLING_UNIFORMS}

varying vec3 vWorldPosition;

${SHADOW_FACTOR_FUNCTION}

void main() {
  float shadow = shadowFactor(vWorldPosition, vec3(0.0, 1.0, 0.0));
  vec3 base = vec3(0.78, 0.80, 0.86);
  gl_FragColor = vec4(base * (0.35 + 0.65 * shadow), 1.0);
}
`

export const PBR_VERTEX = `
varying vec2 vShaderUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vShaderUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

/** 每个灯一个函数，避免在 WebGL1 中动态索引 uniform 数组 */
function pbrLightFunction(index: number): string {
  return `
vec3 evaluateLight${index}(vec3 N, vec3 V, vec3 baseColor, float roughness, float metalness, vec3 F0, float shadow) {
  if (u_lightCount <= ${index}) return vec3(0.0);

  float type = u_lightType[${index}];
  vec3 lightColor = u_lightColor[${index}] * u_lightIntensity[${index}];

  // 环境光：直接叠加到表面颜色
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

  vec3 H = normalize(V + L);
  float NdotV = max(dot(N, V), 0.0);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  float D = distributionGGX(NdotH, roughness);
  float G = geometrySmith(NdotV, NdotL, roughness);
  vec3 F = fresnelSchlick(VdotH, F0);
  vec3 specular = (D * G * F) / max(4.0 * NdotV * NdotL, 1e-4);
  vec3 kd = (1.0 - F) * (1.0 - metalness);
  vec3 diffuse = kd * baseColor / PI;

  return (diffuse + specular) * lightColor * NdotL * attenuation * shadow;
}
`
}

export function pbrFragment(declarations: string[], surface: SurfaceExpressions): string {
  return `
${declarations.join('\n')}

varying vec2 vShaderUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

${LIGHT_UNIFORMS}

// 自定义 shadow map：深度 pass 由 SceneRoot 渲染，这里只负责采样
${SHADOW_SAMPLING_UNIFORMS}
${SHADOW_LIGHT_INDEX_UNIFORM}

${PI_CONSTANT}

${SHADOW_FACTOR_FUNCTION}
${PBR_BRDF_FUNCTIONS}

${pbrLightFunction(0)}
${pbrLightFunction(1)}
${pbrLightFunction(2)}

void main() {
  vec3 baseColor = ${surface.color};
  float roughness = clamp(${surface.roughness}, 0.04, 1.0);
  float metalness = clamp(${surface.metalness}, 0.0, 1.0);
  vec3 emissive = ${surface.emissive};

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 F0 = mix(vec3(0.04), baseColor, metalness);

  float baseShadow = shadowFactor(vWorldPosition, N);
${SHADOW_PER_LIGHT_SELECTION}

  vec3 color = vec3(0.0);
  color += evaluateLight0(N, V, baseColor, roughness, metalness, F0, shadow0);
  color += evaluateLight1(N, V, baseColor, roughness, metalness, F0, shadow1);
  color += evaluateLight2(N, V, baseColor, roughness, metalness, F0, shadow2);
  color += emissive;

  gl_FragColor = vec4(color, 1.0);
}
`
}

function classicFragment(
  declarations: string[],
  surface: SurfaceExpressions,
  model: ClassicShadingModel,
): string {
  return `
${declarations.join('\n')}

varying vec2 vShaderUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

${LIGHT_UNIFORMS}

// 经典光照模型复用同一张自定义 shadow map
${SHADOW_SAMPLING_UNIFORMS}
${SHADOW_LIGHT_INDEX_UNIFORM}

${PI_CONSTANT}

${SHADOW_FACTOR_FUNCTION}
${classicLightFunctions(model)}

void main() {
  vec3 baseColor = ${surface.color};
  float shininess = max(${surface.shininess ?? '32.0'}, 1.0);
  float specularStrength = clamp(${surface.specularStrength ?? '0.5'}, 0.0, 1.0);
  vec3 emissive = ${surface.emissive};

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  float baseShadow = shadowFactor(vWorldPosition, N);
${SHADOW_PER_LIGHT_SELECTION}

  vec3 color = vec3(0.0);
  color += evaluateLight0(N, V, baseColor, shininess, specularStrength, shadow0);
  color += evaluateLight1(N, V, baseColor, shininess, specularStrength, shadow1);
  color += evaluateLight2(N, V, baseColor, shininess, specularStrength, shadow2);
  color += emissive;

  gl_FragColor = vec4(color, 1.0);
}
`
}

export function lambertFragment(declarations: string[], surface: SurfaceExpressions): string {
  return classicFragment(declarations, surface, 'lambert')
}

export function blinnPhongFragment(declarations: string[], surface: SurfaceExpressions): string {
  return classicFragment(declarations, surface, 'blinnPhong')
}
