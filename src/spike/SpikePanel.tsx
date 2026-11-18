import { useState } from 'react'
import type { Point } from '@comfyorg/litegraph'
import { runtime } from './runtime'
import { useGraphStore } from './store'

interface MeasureResult {
  nodeId: number
  port: string
  direction: 'in' | 'out'
  dx: number
  dy: number
  dist: number
}

function measureAlignment(): MeasureResult[] {
  const { graph, canvas } = runtime
  if (!graph || !canvas) return []

  const results: MeasureResult[] = []
  const { scale, offset } = canvas.ds
  const canvasRect = canvas.canvas.getBoundingClientRect()

  for (const node of graph.nodes) {
    const check = (
      name: string,
      index: number,
      pos: Point,
      direction: 'in' | 'out',
    ) => {
      const expectedX = canvasRect.left + offset[0] + pos[0] * scale
      const expectedY = canvasRect.top + offset[1] + pos[1] * scale
      const el = document.querySelector<HTMLElement>(
        `[data-node-id="${Number(node.id)}"][data-port-index="${index}"][data-direction="${direction}"]`,
      )
      if (!el) return
      const rect = el.getBoundingClientRect()
      const actualX = rect.left + rect.width / 2
      const actualY = rect.top + rect.height / 2
      const dx = Math.abs(expectedX - actualX)
      const dy = Math.abs(expectedY - actualY)
      results.push({ nodeId: Number(node.id), port: name, direction, dx, dy, dist: Math.hypot(dx, dy) })
    }

    node.inputs?.forEach((slot, i) => check(slot.name ?? `in${i}`, i, node.getInputPos(i), 'in'))
    node.outputs?.forEach((slot, i) => check(slot.name ?? `out${i}`, i, node.getOutputPos(i), 'out'))
  }
  return results
}

export function SpikePanel() {
  const [results, setResults] = useState<MeasureResult[] | null>(null)
  const nodes = useGraphStore((s) => s.nodes)
  const linkCount = useGraphStore((s) => s.linkCount)
  const viewport = useGraphStore((s) => s.viewport)

  const maxDist = results?.length ? Math.max(...results.map((r) => r.dist)) : null

  return (
    <div className="spike-panel-inner">
      <h2>阶段 0 Spike 验证</h2>
      <p className="hint">LiteGraph 0.17.2 · React 覆盖层模式</p>

      <section>
        <h3>① 隐藏原生节点绘制</h3>
        <p>覆写 <code>drawNode</code> 后，画布应只剩网格与连线，节点主体由 React DOM 渲染。</p>
        <p className={nodes.length > 0 ? 'pass' : 'fail'}>
          {nodes.length > 0 ? `通过：React 渲染 ${nodes.length} 个节点` : '未通过：无节点'}
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
        <p>点击测量，比较 LiteGraph 计算的连线端点与 React 端口圆心的屏幕坐标偏差。</p>
        <button type="button" onClick={() => setResults(measureAlignment())}>
          测量偏差
        </button>
        {maxDist !== null && (
          <p className={maxDist < 2 ? 'pass' : 'fail'}>
            最大偏差 {maxDist.toFixed(2)} px {maxDist < 2 ? '（通过 < 2px）' : '（未通过）'}
          </p>
        )}
        {results && results.length > 0 && (
          <table className="measure-table">
            <thead>
              <tr><th>节点</th><th>端口</th><th>Δx</th><th>Δy</th><th>距离</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={`${r.nodeId}-${r.direction}-${r.port}-${i}`}>
                  <td>#{r.nodeId}</td>
                  <td>{r.direction === 'in' ? '←' : '→'} {r.port}</td>
                  <td>{r.dx.toFixed(2)}</td>
                  <td>{r.dy.toFixed(2)}</td>
                  <td className={r.dist < 2 ? 'pass' : 'fail'}>{r.dist.toFixed(2)}</td>
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
