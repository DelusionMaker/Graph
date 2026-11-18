import { LGraphCanvas, LiteGraph } from '@comfyorg/litegraph'
import { reportConnectionError } from './connectionFeedback'
import { isValidTypePair, PORT_COLORS } from './portTypes'

let installed = false

/**
 * 安装端口类型系统：
 * 1. 覆写 `LiteGraph.isValidConnection`，在原生规则之上加入 INT↔FLOAT；
 * 2. 同步连线颜色，保证连线与 React 端口颜色一致。
 */
export function installTypeSystem(): void {
  if (installed) return
  installed = true

  const original = LiteGraph.isValidConnection.bind(LiteGraph)
  LiteGraph.isValidConnection = (typeA, typeB) => {
    if (isValidTypePair(String(typeA ?? ''), String(typeB ?? ''))) return true
    if (original(typeA, typeB)) return true
    reportConnectionError(`无法连接：${String(typeA ?? '*')} → ${String(typeB ?? '*')} 类型不匹配`)
    return false
  }

  Object.assign(LGraphCanvas.link_type_colors, PORT_COLORS)
}
