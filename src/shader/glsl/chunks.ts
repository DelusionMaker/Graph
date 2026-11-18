/**
 * GLSL 片段。
 *
 * 光照完全由这里生成，不再使用 three 的 Light / MeshStandardMaterial：
 * - PBR：自定义顶点/片元着色器，灯光参数以 uniform 数组传入；
 * - Unlit：只输出表面颜色。
 *
 * UV 使用独立的 `vShaderUv`，避免与 three 在 USE_UV 条件下声明的 `vUv` 重复定义。
 */

export const SHADER_UV_VARYING = 'varying vec2 vShaderUv;'
export const SHADER_UV_ASSIGN = 'vShaderUv = uv;'

export interface SurfaceExpressions {
  color: string
  roughness: string
  metalness: string
  emissive: string
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
uniform sampler2D u_shadowMap;
uniform mat4 u_lightViewProjection;
uniform vec3 u_shadowLightDir;
uniform float u_shadowBias;
uniform float u_shadowTexel;
uniform float u_shadowSoftness;
uniform int u_shadowEnabled;

varying vec3 vWorldPosition;

void main() {
  float shadow = 1.0;

  if (u_shadowEnabled == 1) {
    vec4 clip = u_lightViewProjection * vec4(vWorldPosition + vec3(0.0, 0.02, 0.0), 1.0);
    vec3 coord = clip.xyz / clip.w;
    coord = coord * 0.5 + 0.5;

    if (coord.x >= 0.0 && coord.x <= 1.0 && coord.y >= 0.0 && coord.y <= 1.0 && coord.z <= 1.0) {
      float currentDepth = coord.z - u_shadowBias;
      float sum = 0.0;
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          vec2 offset = vec2(float(x), float(y)) * u_shadowTexel * u_shadowSoftness;
          float depth = texture2D(u_shadowMap, coord.xy + offset).x;
          sum += currentDepth > depth ? 0.0 : 1.0;
        }
      }
      shadow = sum / 9.0;
    }
  }

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
function lightFunction(index: number): string {
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

#define MAX_LIGHTS 3

uniform int u_lightCount;
uniform float u_lightType[MAX_LIGHTS];
uniform vec3 u_lightColor[MAX_LIGHTS];
uniform float u_lightIntensity[MAX_LIGHTS];
uniform vec3 u_lightDirection[MAX_LIGHTS];
uniform vec3 u_lightPosition[MAX_LIGHTS];
uniform float u_lightDecay[MAX_LIGHTS];

// 自定义 shadow map：深度 pass 由 SceneRoot 渲染，这里只负责采样
uniform sampler2D u_shadowMap;
uniform mat4 u_lightViewProjection;
uniform vec3 u_shadowLightDir;
uniform float u_shadowBias;
uniform float u_shadowTexel;
uniform float u_shadowSoftness;
uniform int u_shadowEnabled;

const float PI = 3.14159265359;

float shadowFactor(vec3 worldPos, vec3 N) {
  if (u_shadowEnabled == 0) return 1.0;

  vec3 L = normalize(-u_shadowLightDir);
  if (dot(N, L) <= 0.0) return 1.0;

  vec4 clip = u_lightViewProjection * vec4(worldPos + N * 0.02, 1.0);
  vec3 coord = clip.xyz / clip.w;
  coord = coord * 0.5 + 0.5;

  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0 || coord.z > 1.0) {
    return 1.0;
  }

  float currentDepth = coord.z - u_shadowBias;
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y)) * u_shadowTexel * u_shadowSoftness;
      float depth = texture2D(u_shadowMap, coord.xy + offset).x;
      sum += currentDepth > depth ? 0.0 : 1.0;
    }
  }
  return mix(1.0, sum / 9.0, 0.8);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float distributionGGX(float NdotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-4);
}

float geometrySmith(float NdotV, float NdotL, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

${lightFunction(0)}
${lightFunction(1)}
${lightFunction(2)}

void main() {
  vec3 baseColor = ${surface.color};
  float roughness = clamp(${surface.roughness}, 0.04, 1.0);
  float metalness = clamp(${surface.metalness}, 0.0, 1.0);
  vec3 emissive = ${surface.emissive};

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 F0 = mix(vec3(0.04), baseColor, metalness);

  float shadow = shadowFactor(vWorldPosition, N);

  vec3 color = vec3(0.0);
  color += evaluateLight0(N, V, baseColor, roughness, metalness, F0, shadow);
  color += evaluateLight1(N, V, baseColor, roughness, metalness, F0, shadow);
  color += evaluateLight2(N, V, baseColor, roughness, metalness, F0, shadow);
  color += emissive;

  gl_FragColor = vec4(color, 1.0);
}
`
}
