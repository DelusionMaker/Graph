import { PORT_TYPES, type PortType } from './workflow'

export type { PortType }

/** 端口类型 → 颜色，React 端口圆点与 LiteGraph 连线共用同一份 */
export const PORT_COLORS: Record<string, string> = {
  INT: '#9e9e9e',
  FLOAT: '#9e9e9e',
  STRING: '#9e9e9e',
  BOOLEAN: '#9e9e9e',
  // shader 值类型
  VEC2: '#85b7eb',
  VEC3: '#7f77dd',
  COLOR: '#d4537e',
  // 资源与终端类型
  GEOMETRY: '#1d9e75',
  MATERIAL: '#ba7517',
  POSTFX: '#378add',
  // 光照
  LIGHT: '#f2c55c',
  LIGHTS: '#e8a33a',
  '*': '#ffffff',
}

export function portColor(type: string): string {
  return PORT_COLORS[type] ?? PORT_COLORS.INT
}

export function isKnownPortType(type: string): type is PortType {
  return (PORT_TYPES as readonly string[]).includes(type)
}

const NUMERIC_TYPES = new Set(['INT', 'FLOAT'])
/** 资源与终端类型：只允许同类型或 * 互连，实现域隔离 */
const DOMAIN_TYPES = new Set(['GEOMETRY', 'MATERIAL', 'POSTFX', 'LIGHT', 'LIGHTS'])
/** 标量广播：FLOAT 可隐式转 VEC3 / COLOR（FLOAT→VEC2 必须显式用 shader/Vec3） */
const SCALAR_BROADCAST: Record<string, string[]> = {
  FLOAT: ['VEC3', 'COLOR'],
}
/** 等价的 shader 值类型（直接赋值） */
const EQUIVALENT_TYPES: Array<[string, string]> = [['COLOR', 'VEC3']]

function isBroadcast(from: string, to: string): boolean {
  return SCALAR_BROADCAST[from]?.includes(to) ?? false
}

function isEquivalent(a: string, b: string): boolean {
  return EQUIVALENT_TYPES.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

/**
 * 纯函数版连接校验：
 * - 既有：相等 / 通配 / 逗号分隔的联合类型 / INT↔FLOAT；
 * - 新增：FLOAT→VEC3/COLOR 广播、COLOR↔VEC3、资源类型域隔离。
 * LiteGraph 原生规则在此基础上由 `installTypeSystem` 兜底。
 */
export function isValidTypePair(a: string, b: string): boolean {
  const left = (a ?? '').trim().toUpperCase()
  const right = (b ?? '').trim().toUpperCase()
  if (!left || !right) return true
  if (left === right || left === '*' || right === '*') return true

  // 域隔离：GEOMETRY / MATERIAL / POSTFX 不能与 shader 值或 ComfyUI 类型互连
  if (DOMAIN_TYPES.has(left) || DOMAIN_TYPES.has(right)) return false

  if (NUMERIC_TYPES.has(left) && NUMERIC_TYPES.has(right)) return true
  if (isBroadcast(left, right) || isBroadcast(right, left)) return true
  if (isEquivalent(left, right)) return true

  const leftTypes = left.split(',').map((type) => type.trim())
  const rightTypes = right.split(',').map((type) => type.trim())
  return leftTypes.some((type) => rightTypes.includes(type))
}
