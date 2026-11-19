import { useState } from 'react'
import {
  NATIVE_DIFF_LIMIT,
  TOLERANCE,
  measureNativeDrawing,
  measureNodeBoxes,
  measurePorts,
} from '../graph/measure'
import { useGraphStore } from '../graph/store'
import type { GraphContext } from '../graph/useLiteGraphBridge'

interface Props {
  context: GraphContext
}

/** 开发期手动验证面板，生产构建不渲染 */
export function DevPanel({ context }: Props) {
  const [portMax, setPortMax] = useState<number | null>(null)
  const [boxMax, setBoxMax] = useState<number | null>(null)
  const [native, setNative] = useState<{ coverage: number; sampled: number } | null>(null)

  const selectedCount = useGraphStore((s) => s.selectedIds.length)
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const linkCount = useGraphStore((s) => s.links.length)
  const viewport = useGraphStore((s) => s.viewport)

  const measure = () => {
    const ports = measurePorts(context.graph, context.canvas)
    const boxes = measureNodeBoxes(context.graph, context.canvas)
    setPortMax(ports.length ? Math.max(...ports.map((p) => p.dist)) : null)
    setBoxMax(boxes.length ? Math.max(...boxes.map((b) => b.max)) : null)
  }

  return (
    <div className="dev-panel">
      <p className="hint">阶段 4 · 视觉与完善</p>

      <section>
        <h3>几何对齐</h3>
        <p>
          比较 LiteGraph 的端口/节点坐标投影与 React DOM 的实际屏幕位置。缩放与平移后重新测量，均应
          &lt; {TOLERANCE}px。
        </p>
        <button type="button" onClick={measure}>
          测量几何
        </button>
        {portMax !== null && (
          <p className={portMax < TOLERANCE ? 'pass' : 'fail'}>
            端口最大偏差 {portMax.toFixed(2)} px
          </p>
        )}
        {boxMax !== null && (
          <p className={boxMax < TOLERANCE ? 'pass' : 'fail'}>
            节点框最大偏差 {boxMax.toFixed(2)} px
          </p>
        )}
      </section>

      <section>
        <h3>原生绘制检测</h3>
        <p>
          对比"节点在画布内"与"节点临时移出画布"两帧的像素差异，接近 0 说明节点只由 React 渲染。
        </p>
        <button
          type="button"
          onClick={() => setNative(measureNativeDrawing(context.graph, context.canvas))}
        >
          检测原生绘制
        </button>
        {native && (
          <p
            className={
              native.sampled === 0
                ? 'pending'
                : native.coverage < NATIVE_DIFF_LIMIT
                  ? 'pass'
                  : 'fail'
            }
          >
            {native.sampled === 0
              ? '未采样到完整可见的节点'
              : `区域像素差异 ${(native.coverage * 100).toFixed(1)}%（${native.sampled} 个节点）` +
                (native.coverage < NATIVE_DIFF_LIMIT ? '，通过' : '，未通过：原生节点仍在绘制')}
          </p>
        )}
      </section>

      <section>
        <h3>实时状态</h3>
        <ul className="stats">
          <li>节点数：{nodeCount}</li>
          <li>连线数：{linkCount}</li>
          <li>选中数：{selectedCount}</li>
          <li>缩放：{viewport.zoom.toFixed(2)}x</li>
          <li>
            偏移：{viewport.x.toFixed(0)}, {viewport.y.toFixed(0)}
          </li>
        </ul>
      </section>
    </div>
  )
}
