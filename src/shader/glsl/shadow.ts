/**
 * 自定义阴影采样 GLSL。
 *
 * PBR、Lambert、Blinn-Phong 和地面共用同一份采样实现，
 * 避免多套 shader 各自维护 PCF 参数导致行为不一致。
 */

export const SHADOW_SAMPLING_UNIFORMS = `
uniform sampler2D u_shadowMap;
uniform mat4 u_lightViewProjection;
uniform vec3 u_shadowLightDir;
uniform float u_shadowBias;
uniform float u_shadowTexel;
uniform float u_shadowSoftness;
uniform int u_shadowEnabled;
`

/** -1 表示没有投影灯；非 -1 时对应 u_light* 数组中的灯索引 */
export const SHADOW_LIGHT_INDEX_UNIFORM = 'uniform int u_shadowLightIndex;'

export const SHADOW_FACTOR_FUNCTION = `
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
`

/** 只让投影灯接收阴影，避免点光被方向光阴影错误乘暗 */
export const SHADOW_PER_LIGHT_SELECTION = `
float shadow0 = u_shadowLightIndex == 0 ? baseShadow : 1.0;
float shadow1 = u_shadowLightIndex == 1 ? baseShadow : 1.0;
float shadow2 = u_shadowLightIndex == 2 ? baseShadow : 1.0;
`
