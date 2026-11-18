import type { LGraph, LGraphCanvas } from '@comfyorg/litegraph'

/** 规划中的验收阈值：偏差 < 2px */
export const TOLERANCE = 2
/** 原生绘制差异阈值（0–1 的比例，对应 20%） */
export const NATIVE_DIFF_LIMIT = 0.2

export interface PortMeasurement {
  nodeId: number
  port: string
  direction: 'in' | 'out'
  dx: number
  dy: number
  dist: number
}

export interface BoxMeasurement {
  nodeId: number
  dx: number
  dy: number
  dw: number
  dh: number
  max: number
}

export interface NativeMeasurement {
  /** 节点主体区域内"有节点 / 无节点"两帧的像素差异占比 */
  coverage: number
  /** 实际采样到的节点数（节点全部移出画布时无法判断） */
  sampled: number
}

type Tuple = [number, number]

function screenMapper(canvas: LGraphCanvas) {
  const rect = canvas.canvas.getBoundingClientRect()
  const ds = canvas.ds
  return {
    scale: ds.scale,
    // 直接复用 LiteGraph 自己的换算：canvas 内坐标 = (图坐标 + offset) * scale。
    // 不要在测量代码里另写一份公式，否则测量与渲染会犯同一个错误。
    toScreen: (x: number, y: number): Tuple => {
      const [cx, cy] = ds.convertOffsetToCanvas([x, y])
      return [rect.left + cx, rect.top + cy]
    },
  }
}

/** 端口圆心：LiteGraph 计算的连线端点 vs React 渲染的端口圆点 */
export function measurePorts(graph: LGraph, canvas: LGraphCanvas): PortMeasurement[] {
  const { toScreen } = screenMapper(canvas)
  const results: PortMeasurement[] = []

  for (const node of graph.nodes) {
    const check = (name: string, index: number, pos: [number, number], direction: 'in' | 'out') => {
      const [expectedX, expectedY] = toScreen(pos[0], pos[1])
      const el = document.querySelector<HTMLElement>(
        `[data-node-id="${Number(node.id)}"][data-port-index="${index}"][data-direction="${direction}"]`,
      )
      if (!el) return
      const rect = el.getBoundingClientRect()
      const dx = Math.abs(expectedX - (rect.left + rect.width / 2))
      const dy = Math.abs(expectedY - (rect.top + rect.height / 2))
      results.push({ nodeId: Number(node.id), port: name, direction, dx, dy, dist: Math.hypot(dx, dy) })
    }

    node.inputs?.forEach((slot, index) => check(slot.name ?? `in${index}`, index, node.getInputPos(index) as Tuple, 'in'))
    node.outputs?.forEach((slot, index) => check(slot.name ?? `out${index}`, index, node.getOutputPos(index) as Tuple, 'out'))
  }
  return results
}

/** 节点整体：LiteGraph 的 pos/size 投影到屏幕 vs React 节点盒 */
export function measureNodeBoxes(graph: LGraph, canvas: LGraphCanvas): BoxMeasurement[] {
  const { toScreen, scale } = screenMapper(canvas)
  const results: BoxMeasurement[] = []

  for (const node of graph.nodes) {
    const el = document.querySelector<HTMLElement>(`.graph-node[data-node-id="${Number(node.id)}"]`)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    const [expectedLeft, expectedTop] = toScreen(node.pos[0], node.pos[1])
    const dx = Math.abs(expectedLeft - rect.left)
    const dy = Math.abs(expectedTop - rect.top)
    const dw = Math.abs(node.size[0] * scale - rect.width)
    const dh = Math.abs(node.size[1] * scale - rect.height)
    results.push({ nodeId: Number(node.id), dx, dy, dw, dh, max: Math.max(dx, dy, dw, dh) })
  }
  return results
}

/**
 * 验证隐藏原生节点绘制的差异对比法：
 * 记录节点主体区域像素 → 把节点临时移出画布重绘 → 比较两帧差异 → 移回。
 * 原生绘制被隐藏时差异接近 0；若原生绘制仍在，节点填充色会大面积覆盖该区域。
 */
export function measureNativeDrawing(graph: LGraph, canvas: LGraphCanvas): NativeMeasurement | null {
  const el = canvas.canvas
  const ctx = el.getContext('2d')
  if (!ctx) return null

  const rect = el.getBoundingClientRect()
  const dprX = el.width / rect.width
  const dprY = el.height / rect.height
  const ds = canvas.ds

  canvas.setDirty(true, true)
  canvas.draw(true, true)

  let coverage = 0
  let sampled = 0

  for (const node of graph.nodes) {
    const [left, top] = ds.convertOffsetToCanvas([node.pos[0], node.pos[1]])
    const x = Math.round((left + 2) * dprX)
    const y = Math.round((top + 2) * dprY)
    const w = Math.round((node.size[0] * ds.scale - 4) * dprX)
    const h = Math.round((node.size[1] * ds.scale - 4) * dprY)
    if (x < 0 || y < 0 || w < 8 || h < 8 || x + w > el.width || y + h > el.height) continue

    const before = ctx.getImageData(x, y, w, h).data
    const oldPos: [number, number] = [node.pos[0], node.pos[1]]

    try {
      node.pos = [oldPos[0] + 1e6, oldPos[1]]
      canvas.setDirty(true, true)
      canvas.draw(true, true)
      const after = ctx.getImageData(x, y, w, h).data

      let diff = 0
      for (let i = 0; i < before.length; i += 4) {
        if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) {
          diff++
        }
      }
      sampled++
      coverage = Math.max(coverage, diff / (before.length / 4))
    } finally {
      node.pos = oldPos
      canvas.setDirty(true, true)
      canvas.draw(true, true)
    }
  }

  return { coverage, sampled }
}
