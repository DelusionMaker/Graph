import type { EmitContext, EmitResult } from './index'

export function readNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

/** sRGB 单通道 → 线性（与 THREE.Color.convertSRGBToLinear 一致，不依赖 three） */
export function srgbToLinearChannel(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

const HEX_PATTERN = /^#?([0-9a-f]{6})$/i
const SHORT_HEX_PATTERN = /^#?([0-9a-f]{3})$/i

/** 颜色 widget（sRGB 十六进制）→ 线性 rgb 元组 */
export function parseColor(
  value: unknown,
  fallback: [number, number, number] = [0.55, 0.61, 1],
): [number, number, number] {
  if (Array.isArray(value) && value.length >= 3) {
    return [readNumber(value[0]), readNumber(value[1]), readNumber(value[2])]
  }
  const text = String(value ?? '').trim()
  const match = HEX_PATTERN.exec(text) ?? SHORT_HEX_PATTERN.exec(text)
  if (!match) return fallback

  let hex = match[1]
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('')
  }
  const toLinear = (offset: number) =>
    srgbToLinearChannel(parseInt(hex.slice(offset, offset + 2), 16) / 255)
  return [toLinear(0), toLinear(2), toLinear(4)]
}

export function emitFloat(ctx: EmitContext): EmitResult {
  const value = readNumber(ctx.widget('value'), 0)
  const name = ctx.uniform('value', 'float', value, {
    nodeId: ctx.nodeId,
    widgets: ['value'],
    kind: 'float',
  })
  return { expr: name, type: 'FLOAT' }
}

export function emitColor(ctx: EmitContext): EmitResult {
  const value = parseColor(ctx.widget('value'))
  const name = ctx.uniform('value', 'color', value, {
    nodeId: ctx.nodeId,
    widgets: ['value'],
    kind: 'color',
  })
  return { expr: name, type: 'COLOR' }
}

export function emitUv(): EmitResult {
  return { expr: 'vShaderUv', type: 'VEC2' }
}

export function emitNormal(): EmitResult {
  return { expr: 'normalize(vNormal)', type: 'VEC3' }
}

export function emitPosition(): EmitResult {
  return { expr: 'vViewPosition', type: 'VEC3' }
}

export function emitTime(ctx: EmitContext): EmitResult {
  const speed = readNumber(ctx.widget('speed'), 1)
  // time 逐帧更新，speed 作为普通 uniform，改 speed 不触发重编译
  const time = ctx.uniform('time', 'time', 0, {
    nodeId: ctx.nodeId,
    widgets: ['speed'],
    kind: 'time',
  })
  const speedName = ctx.uniform('speed', 'float', speed, {
    nodeId: ctx.nodeId,
    widgets: ['speed'],
    kind: 'float',
  })
  return { expr: `(${time} * ${speedName})`, type: 'FLOAT' }
}

export function emitVec3(ctx: EmitContext): EmitResult {
  const value = [
    readNumber(ctx.widget('x'), 0),
    readNumber(ctx.widget('y'), 0),
    readNumber(ctx.widget('z'), 0),
  ] as [number, number, number]
  const name = ctx.uniform('value', 'vec3', value, {
    nodeId: ctx.nodeId,
    widgets: ['x', 'y', 'z'],
    kind: 'vec3',
  })
  return { expr: name, type: 'VEC3' }
}
