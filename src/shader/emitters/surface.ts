import type { EmitContext, EmitResult } from './index'
import { parseColor, readNumber } from './values'

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

/** 未连线时的兜底：把 widget 常量注册成 uniform，改值不触发重编译 */
function fallbackFloat(ctx: EmitContext, name: string, fallback: number): string {
  const value = readNumber(ctx.widget(name), fallback)
  return ctx.uniform(name, 'float', value, {
    nodeId: ctx.nodeId,
    widgets: [name],
    kind: 'float',
  })
}

function fallbackColor(ctx: EmitContext, name: string, fallback: [number, number, number]): string {
  const value = parseColor(ctx.widget(name), fallback)
  return ctx.uniform(name, 'color', value, {
    nodeId: ctx.nodeId,
    widgets: [name],
    kind: 'color',
  })
}

export function emitSurface(ctx: EmitContext): EmitResult {
  const shading = String(ctx.widget('shading') ?? 'pbr') === 'unlit' ? 'unlit' : 'pbr'

  const colorInput = ctx.input('baseColor')
  const roughnessInput = ctx.input('roughness')
  const metalnessInput = ctx.input('metalness')
  const emissiveInput = ctx.input('emissive')

  // 有连线时以上游为准，未连线时使用节点上的兜底常量
  const color = colorInput
    ? asVec3(colorInput.expr, colorInput.type)
    : fallbackColor(ctx, 'baseColor', [0.55, 0.61, 1.0])
  const roughness = roughnessInput
    ? asFloat(roughnessInput.expr, roughnessInput.type)
    : fallbackFloat(ctx, 'roughness', 0.5)
  const metalness = metalnessInput
    ? asFloat(metalnessInput.expr, metalnessInput.type)
    : fallbackFloat(ctx, 'metalness', 0.2)
  const emissive = emissiveInput
    ? asVec3(emissiveInput.expr, emissiveInput.type)
    : fallbackColor(ctx, 'emissive', [0, 0, 0])

  return {
    expr: '',
    type: 'MATERIAL',
    surface: { shading, color, roughness, metalness, emissive },
  }
}
