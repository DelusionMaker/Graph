import { PORT_TYPES, type PortType } from './workflow'

export type { PortType }

/** 端口类型 → 颜色，React 端口圆点与 LiteGraph 连线共用同一份 */
export const PORT_COLORS: Record<string, string> = {
  MODEL: '#b39ddb',
  CLIP: '#80deea',
  VAE: '#ffb74d',
  CONDITIONING: '#64b5f6',
  CONTROL_NET: '#5c6bc0',
  LATENT: '#f48fb1',
  IMAGE: '#81c784',
  MASK: '#bdbdbd',
  SIGMAS: '#a1887f',
  INT: '#9e9e9e',
  FLOAT: '#9e9e9e',
  STRING: '#9e9e9e',
  BOOLEAN: '#9e9e9e',
  '*': '#ffffff',
}

export function portColor(type: string): string {
  return PORT_COLORS[type] ?? PORT_COLORS.INT
}

export function isKnownPortType(type: string): type is PortType {
  return (PORT_TYPES as readonly string[]).includes(type)
}

const NUMERIC_TYPES = new Set(['INT', 'FLOAT'])

/**
 * 纯函数版连接校验：相等 / 通配 / 逗号分隔的联合类型 / INT↔FLOAT。
 * LiteGraph 原生规则在此基础上由 `installTypeSystem` 兜底。
 */
export function isValidTypePair(a: string, b: string): boolean {
  const left = (a ?? '').trim().toUpperCase()
  const right = (b ?? '').trim().toUpperCase()
  if (!left || !right) return true
  if (left === right || left === '*' || right === '*') return true
  if (NUMERIC_TYPES.has(left) && NUMERIC_TYPES.has(right)) return true
  const leftTypes = left.split(',').map((type) => type.trim())
  const rightTypes = right.split(',').map((type) => type.trim())
  return leftTypes.some((type) => rightTypes.includes(type))
}
