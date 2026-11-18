import { useMemo } from 'react'
import { overlayTransform } from '../graph/coords'
import { useGraphStore } from '../graph/store'
import { useProgramStore } from '../shader/useProgramStore'
import { NodeView } from './NodeView'

export function NodeOverlay() {
  const nodes = useGraphStore((s) => s.nodes)
  const viewport = useGraphStore((s) => s.viewport)
  const selectedIds = useGraphStore((s) => s.selectedIds)
  const errors = useProgramStore((s) => s.errors)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const errorIds = useMemo(
    () => new Set(errors.map((error) => error.nodeId).filter((id): id is number => id != null)),
    [errors],
  )

  // LOD：低缩放时只保留色块与端口，隐藏文字与 Widget，降低 DOM 与绘制开销
  const lod = viewport.zoom < 0.5

  return (
    <div
      className={`node-overlay${lod ? ' is-lod' : ''}`}
      // transform 的生成规则集中在 coords.ts（scale 再 translate，与 LiteGraph 同源）
      style={{ transform: overlayTransform(viewport) }}
    >
      {nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          selected={selected.has(node.id)}
          hasError={errorIds.has(node.id)}
        />
      ))}
    </div>
  )
}
