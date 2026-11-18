/**
 * GLSL 注入片段。
 *
 * UV 使用独立的 `vShaderUv`，避免与 three 在 USE_UV 条件下声明的 `vUv` 重复定义。
 * 法线与位置直接复用 MeshStandardMaterial 已有的 `vNormal` / `vViewPosition`。
 */

export const SHADER_UV_VARYING = 'varying vec2 vShaderUv;'
export const SHADER_UV_ASSIGN = 'vShaderUv = uv;'

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
