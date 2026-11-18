import type { EmitContext, EmitResult } from './index'

/** 把上游结果降维成 float 表达式（VEC3/COLOR 取 x，VEC2 取 x） */
function asFloat(expr: string, type: string): string {
  if (type === 'VEC2' || type === 'VEC3' || type === 'COLOR') return `${expr}.x`
  return expr
}

/** 把上游结果升维/保持为 vec3 表达式 */
function asVec3(expr: string, type: string): string {
  if (type === 'FLOAT' || type === 'INT') return `vec3(${expr})`
  if (type === 'VEC2') return `vec3(${expr}, 0.0)`
  return expr
}

export function emitSurface(ctx: EmitContext): EmitResult {
  const shading = String(ctx.widget('shading') ?? 'pbr') === 'unlit' ? 'unlit' : 'pbr'

  const colorInput = ctx.input('baseColor')
  const roughnessInput = ctx.input('roughness')
  const metalnessInput = ctx.input('metalness')
  const emissiveInput = ctx.input('emissive')

  const color = colorInput ? asVec3(colorInput.expr, colorInput.type) : 'vec3(0.55, 0.61, 1.0)'
  const roughness = roughnessInput ? asFloat(roughnessInput.expr, roughnessInput.type) : '0.5'
  const metalness = metalnessInput ? asFloat(metalnessInput.expr, metalnessInput.type) : '0.0'
  const emissive = emissiveInput ? asVec3(emissiveInput.expr, emissiveInput.type) : 'vec3(0.0)'

  return {
    expr: '',
    type: 'MATERIAL',
    surface: { shading, color, roughness, metalness, emissive },
  }
}
