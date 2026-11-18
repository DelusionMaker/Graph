import { useEffect, type DragEvent, type RefObject } from 'react'
import { attachDebugApi } from '../graph/debug'
import type { GraphContext } from '../graph/useLiteGraphBridge'
import { DevPanel } from './DevPanel'
import { NodeOverlay } from './NodeOverlay'
import { NODE_DRAG_MIME } from './NodeLibrary'
import { SelectionBox } from './SelectionBox'

interface Props {
  canvasRef: RefObject<HTMLCanvasElement>
  context: GraphContext | null
}

export function GraphCanvas({ canvasRef, context }: Props) {
  useEffect(() => {
    if (!context || !import.meta.env.DEV) return
    return attachDebugApi(context.graph, context.canvas)
  }, [context])

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(NODE_DRAG_MIME)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const type = event.dataTransfer.getData(NODE_DRAG_MIME)
    if (!type || !context) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const [x, y] = context.canvas.convertCanvasToOffset([event.clientX - rect.left, event.clientY - rect.top])
    // 让拖拽落点大致落在节点标题栏位置
    context.addNode(type, [x - 110, y - 14])
  }

  return (
    <div className="canvas-workspace">
      <div className="graph-canvas" onDragOver={handleDragOver} onDrop={handleDrop}>
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
