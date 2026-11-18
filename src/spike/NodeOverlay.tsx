import { useGraphStore } from './store'
import { NodeView } from './NodeView'

export function NodeOverlay() {
  const nodes = useGraphStore((s) => s.nodes)
  const viewport = useGraphStore((s) => s.viewport)

  return (
    <div
      className="node-overlay"
      style={{
        transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
      }}
    >
      {nodes.map((node) => (
        <NodeView key={node.id} node={node} />
      ))}
    </div>
  )
}
