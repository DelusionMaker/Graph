import { useState } from 'react'
import type { LGraphCanvas } from '@comfyorg/litegraph'
import { runtime } from './runtime'
import { useGraphStore } from './store'

/** 规划中的验收阈值：偏差 < 2px */
const TOLERANCE = 2

interface PortResult {
  nodeId: number
  port: string
  direction: 'in' | 'out'
  dx: number
  dy: number
  dist: number
}

interface BoxResult {
  nodeId: number
  dx: number
  dy: number
  dw: number
  dh: number
  max: number
}

interface NativeResult {
  /** 节点主体区域内"有节点 / 无节点"两帧的像素差异占比（隐藏原生绘制时应接近 0） */
  coverage: number
  /** 实际采样到的节点数（节点全部移出画布时无法判断） */
  sampled: number
}

type PortTuple = [number, number]

function screenMapper(canvas: LGraphCanvas) {
  const rect = canvas.canvas.getBoundingClientRect()
  const ds = canvas.ds
  return {
    scale: ds.scale,
    // 直接复用 LiteGraph 自己的换算：canvas 内坐标 = (图坐标 + offset) * scale。
    // 不要在测量代码里另写一份公式，否则测量与渲染会犯同一个错误，测了也白测。
    toScreen: (x: number, y: number): PortTuple => {
      const [cx, cy] = ds.convertOffsetToCanvas([x, y])
      return [rect.left + cx, rect.top + cy]
    },
  }
}

/** 端口圆心：LiteGraph 计算的连线端点 vs React 渲染的端口圆点 */
function measurePorts(): PortResult[] {
  const { graph, canvas } = runtime
  if (!graph || !canvas) return []

  const { toScreen } = screenMapper(canvas)
  const results: PortResult[] = []

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
      results.push({
        nodeId: Number(node.id),
        port: name,
        direction,
        dx,
        dy,
        dist: Math.hypot(dx, dy),
      })
    }

    node.inputs?.forEach((slot, i) => check(slot.name ?? `in${i}`, i, node.getInputPos(i) as PortTuple, 'in'))
    node.outputs?.forEach((slot, i) => check(slot.name ?? `out${i}`, i, node.getOutputPos(i) as PortTuple, 'out'))
  }
  return results
}

/** 节点整体：LiteGraph 的 pos/size 投影到屏幕 vs React 节点盒 */
function measureNodeBoxes(): BoxResult[] {
  const { graph, canvas } = runtime
  if (!graph || !canvas) return []

  const { toScreen, scale } = screenMapper(canvas)
  const results: BoxResult[] = []

  for (const node of graph.nodes) {
    const el = document.querySelector<HTMLElement>(`.spike-node[data-node-id="${Number(node.id)}"]`)
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
 * 验证项①的量化判据——差异对比法（等价于截图对比，但由浏览器自己完成，可重复执行）：
 * 1. 记录节点主体区域当前的 canvas 像素；
 * 2. 把节点临时移到画布外并强制重绘，得到"该区域没有节点"时的像素；
 * 3. 逐像素比较两帧的差异比例，再移回节点并重绘。
 *
 * 若原生节点绘制已被隐藏，两帧在节点区域内应完全一致（差异只可能来自连线路径）；
 * 若原生绘制仍在，节点填充色会大面积覆盖该区域，差异接近 100%。
 */
function measureNativeDrawing(): NativeResult | null {
  const { graph, canvas } = runtime
  if (!graph || !canvas) return null

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
    // 节点左上角在 canvas 内的 CSS 坐标，换算方式与 LiteGraph 渲染完全一致
    const [left, top] = ds.convertOffsetToCanvas([node.pos[0], node.pos[1]])
    const x = Math.round((left + 2) * dprX)
    const y = Math.round((top + 2) * dprY)
    const w = Math.round((node.size[0] * ds.scale - 4) * dprX)
    const h = Math.round((node.size[1] * ds.scale - 4) * dprY)
    // 只测完整落在画布内的节点，避免越界取不到像素
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

export function SpikePanel() {
  const [ports, setPorts] = useState<PortResult[] | null>(null)
  const [boxes, setBoxes] = useState<BoxResult[] | null>(null)
  const [native, setNative] = useState<NativeResult | null>(null)
  const nodes = useGraphStore((s) => s.nodes)
  const linkCount = useGraphStore((s) => s.linkCount)
  const viewport = useGraphStore((s) => s.viewport)

  const portMax = ports?.length ? Math.max(...ports.map((r) => r.dist)) : null
  const boxMax = boxes?.length ? Math.max(...boxes.map((r) => r.max)) : null
  const nativePass = native !== null && native.sampled > 0 && native.coverage < 0.2

  return (
    <div className="spike-panel-inner">
      <h2>阶段 0 Spike 验证</h2>
      <p className="hint">LiteGraph 0.17.2 · React 覆盖层模式</p>

      <section>
        <h3>① 隐藏原生节点绘制</h3>
        <p>覆写 <code>drawNode</code> 后，画布应只剩网格与连线。检测方式：对比"节点在画布内"与"节点临时移出画布"两帧的像素，差异应接近 0。</p>
        <button type="button" onClick={() => setNative(measureNativeDrawing())}>
          检测原生绘制
        </button>
        {native !== null && (
          <p className={native.sampled === 0 ? 'pending' : nativePass ? 'pass' : 'fail'}>
            {native.sampled === 0
              ? '未采样到完整可见的节点，请先平移到画布可见区域'
              : `区域像素差异 ${(native.coverage * 100).toFixed(1)}%（采样 ${native.sampled} 个节点）` +
                (nativePass ? '，通过 < 20%' : '，未通过：原生节点仍在绘制')}
          </p>
        )}
        <p className={nodes.length > 0 ? 'pass' : 'fail'}>
          {nodes.length > 0 ? `React 渲染 ${nodes.length} 个节点` : '未通过：无节点'}
        </p>
      </section>

      <section>
        <h3>② 事件穿透与连线</h3>
        <p>从右侧 <b>Source</b> 的 MODEL 端口拖到 <b>Target</b> 的 MODEL 端口。端口热区为 <code>pointer-events: none</code>，事件应穿透到 canvas 由 LiteGraph 处理。</p>
        <p className={linkCount > 0 ? 'pass' : 'pending'}>
          {linkCount > 0 ? `通过：已创建 ${linkCount} 条连线` : '待操作：当前 0 条连线'}
        </p>
      </section>

      <section>
        <h3>③ 几何对齐</h3>
        <p>比较 LiteGraph 计算的连线端点 / 节点盒与 React DOM 的屏幕坐标。缩放与平移后重新测量，均应 &lt; {TOLERANCE}px。</p>
        <button
          type="button"
          onClick={() => {
            setPorts(measurePorts())
            setBoxes(measureNodeBoxes())
          }}
        >
          测量偏差
        </button>
        {portMax !== null && (
          <p className={portMax < TOLERANCE ? 'pass' : 'fail'}>
            端口最大偏差 {portMax.toFixed(2)} px {portMax < TOLERANCE ? '（通过 < 2px）' : '（未通过）'}
          </p>
        )}
        {boxMax !== null && (
          <p className={boxMax < TOLERANCE ? 'pass' : 'fail'}>
            节点框最大偏差 {boxMax.toFixed(2)} px {boxMax < TOLERANCE ? '（通过 < 2px）' : '（未通过）'}
          </p>
        )}
        {ports && ports.length > 0 && (
          <table className="measure-table">
            <thead>
              <tr><th>节点</th><th>端口</th><th>Δx</th><th>Δy</th><th>距离</th></tr>
            </thead>
            <tbody>
              {ports.map((r, i) => (
                <tr key={`${r.nodeId}-${r.direction}-${r.port}-${i}`}>
                  <td>#{r.nodeId}</td>
                  <td>{r.direction === 'in' ? '←' : '→'} {r.port}</td>
                  <td>{r.dx.toFixed(2)}</td>
                  <td>{r.dy.toFixed(2)}</td>
                  <td className={r.dist < TOLERANCE ? 'pass' : 'fail'}>{r.dist.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {boxes && boxes.length > 0 && (
          <table className="measure-table">
            <thead>
              <tr><th>节点框</th><th>Δx</th><th>Δy</th><th>Δw</th><th>Δh</th></tr>
            </thead>
            <tbody>
              {boxes.map((r) => (
                <tr key={`box-${r.nodeId}`}>
                  <td>#{r.nodeId}</td>
                  <td>{r.dx.toFixed(2)}</td>
                  <td>{r.dy.toFixed(2)}</td>
                  <td>{r.dw.toFixed(2)}</td>
                  <td>{r.dh.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>实时状态</h3>
        <ul className="stats">
          <li>节点数：{nodes.length}</li>
          <li>连线数：{linkCount}</li>
          <li>缩放：{viewport.zoom.toFixed(2)}x</li>
          <li>偏移：{viewport.x.toFixed(0)}, {viewport.y.toFixed(0)}</li>
        </ul>
      </section>
    </div>
  )
}
