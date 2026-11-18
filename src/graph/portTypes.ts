import { LGraphCanvas, LiteGraph } from '@comfyorg/litegraph'

export type PortType =
  | 'MODEL'
  | 'CLIP'
  | 'VAE'
  | 'CONDITIONING'
  | 'LATENT'
  | 'IMAGE'
  | 'MASK'
  | 'CONTROL_NET'
  | 'SIGMAS'
  | 'INT'
  | 'FLOAT'
  | 'STRING'
  | 'BOOLEAN'
  | '*'

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

/** INT ↔ FLOAT 允许互连（执行时按数值转换），其余按 LiteGraph 原生规则 */
const NUMERIC_TYPES = new Set(['INT', 'FLOAT'])

let installed = false

/**
 * 安装端口类型系统：
 * 1. 覆写 `LiteGraph.isValidConnection`，在原生规则（相等 / 通配 / 逗号列表）之上加入 INT↔FLOAT；
 * 2. 同步连线颜色，保证连线与 React 端口颜色一致。
 */
export function installTypeSystem(): void {
  if (installed) return
  installed = true

  const original = LiteGraph.isValidConnection.bind(LiteGraph)
  LiteGraph.isValidConnection = (typeA, typeB) => {
    const a = String(typeA ?? '').toUpperCase()
    const b = String(typeB ?? '').toUpperCase()
    if (a !== b && NUMERIC_TYPES.has(a) && NUMERIC_TYPES.has(b)) return true
    return original(typeA, typeB)
  }

  Object.assign(LGraphCanvas.link_type_colors, PORT_COLORS)
}
