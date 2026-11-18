import { useEffect, useRef } from 'react'
import { attachDebugApi } from '../graph/debug'
import { seedDemoGraph } from '../graph/seed'
import { useLiteGraphBridge } from '../graph/useLiteGraphBridge'
import { DevPanel } from './DevPanel'
import { NodeOverlay } from './NodeOverlay'
import { SelectionBox } from './SelectionBox'

export function GraphCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const context = useLiteGraphBridge(canvasRef)

  useEffect(() => {
    if (!context) return
    seedDemoGraph(context.graph)
    if (!import.meta.env.DEV) return
    return attachDebugApi(context.graph, context.canvas)
  }, [context])

  return (
    <div className="canvas-workspace">
      <div className="graph-canvas">
        <canvas
          ref={canvasRef}
          className="litegraph-canvas"
          tabIndex={0}
          // LiteGraph 的键盘监听绑定在 canvas 元素上，必须让它可聚焦，Delete 才能删连线
          onPointerDown={(event) => event.currentTarget.focus()}
        />
        <NodeOverlay />
        <SelectionBox />
      </div>
      {import.meta.env.DEV && context && <DevPanel context={context} />}
    </div>
  )
}
