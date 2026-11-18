import { useMemo } from 'react'
import { useGraphStore } from '../graph/store'
import { NodeView } from './NodeView'

export function NodeOverlay() {
  const nodes = useGraphStore((s) => s.nodes)
  const viewport = useGraphStore((s) => s.viewport)
  const selectedIds = useGraphStore((s) => s.selectedIds)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  // LOD：低缩放时只保留色块与端口，隐藏文字与 Widget，降低 DOM 与绘制开销
  const lod = viewport.zoom < 0.5

  return (
    <div
      className={`node-overlay${lod ? ' is-lod' : ''}`}
      // 必须是 scale() 再 translate()：CSS 函数从右往左作用，
      // 等价于 LiteGraph 的 toCanvasContext()——先 translate(offset) 再 scale()，
      // 屏幕坐标 = (图坐标 + offset) * zoom。
      // 若写成 translate(...) scale(...)，offset 不会被缩放，缩放后节点会与连线错位。
      style={{
        transform: `scale(${viewport.zoom}) translate(${viewport.x}px, ${viewport.y}px)`,
      }}
    >
      {nodes.map((node) => (
        <NodeView key={node.id} node={node} selected={selected.has(node.id)} />
      ))}
    </div>
  )
}
