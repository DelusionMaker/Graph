import { useEffect, useRef, useState, type DragEvent, type RefObject } from 'react'
import { screenToGraph } from '../graph/coords'
import { attachDebugApi } from '../graph/debug'
import type { GraphContext } from '../graph/useLiteGraphBridge'
import { MiniMap } from './MiniMap'
import { NodeOverlay } from './NodeOverlay'
import { NODE_DRAG_MIME } from './NodeLibrary'
import { SelectionBox } from './SelectionBox'

interface Props {
  canvasRef: RefObject<HTMLCanvasElement>
  context: GraphContext | null
}

export function GraphCanvas({ canvasRef, context }: Props) {
  const [dropTarget, setDropTarget] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    if (!context || !import.meta.env.DEV) return
    return attachDebugApi(context.graph, context.canvas)
  }, [context])

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(NODE_DRAG_MIME)) return
    dragDepth.current += 1
    setDropTarget(true)
  }

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDropTarget(false)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(NODE_DRAG_MIME)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    dragDepth.current = 0
    setDropTarget(false)
    const type = event.dataTransfer.getData(NODE_DRAG_MIME)
    if (!type || !context) return
    event.preventDefault()
    const [x, y] = screenToGraph(context.canvas, event.clientX, event.clientY)
    // 让拖拽落点大致落在节点标题栏位置
    context.addNode(type, [x - 110, y - 14])
  }

  return (
    <div
      className={`graph-canvas${dropTarget ? ' is-drop-target' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className="litegraph-canvas"
        tabIndex={0}
        role="application"
        aria-label="节点画布"
        // LiteGraph 的键盘监听绑定在 canvas 元素上，必须让它可聚焦，Delete 才能删连线
        onPointerDown={(event) => event.currentTarget.focus()}
      />
      <NodeOverlay />
      <SelectionBox />
      <MiniMap />
    </div>
  )
}
