import { memo } from 'react'
import { GEOMETRY } from '../graph/geometry'
import type { NodeSnapshot } from '../graph/types'

interface Props {
  node: NodeSnapshot
  selected: boolean
}

export const NodeView = memo(function NodeView({ node, selected }: Props) {
  return (
    <div
      className={`graph-node${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      style={{
        left: node.pos[0],
        top: node.pos[1],
        width: node.size[0],
        height: node.size[1],
      }}
    >
      <div className="graph-node-title" style={{ height: GEOMETRY.titleHeight }}>
        {node.title}
        <span className="graph-node-id">#{node.id}</span>
      </div>

      {node.inputs.map((port) => {
        const [cx, cy] = port.offset
        return (
          <div key={`in-${port.index}`}>
            <span
              className={`graph-port${port.connected ? ' is-connected' : ''}`}
              data-node-id={node.id}
              data-port-index={port.index}
              data-direction="in"
              style={{ left: cx - GEOMETRY.slotRadius, top: cy - GEOMETRY.slotRadius }}
              title={`${port.name} (${port.type})`}
            />
            <span className="graph-port-label" style={{ left: cx + 12, top: cy - 9 }}>
              {port.name}
            </span>
          </div>
        )
      })}

      {node.outputs.map((port) => {
        const [cx, cy] = port.offset
        return (
          <div key={`out-${port.index}`}>
            <span
              className={`graph-port${port.connected ? ' is-connected' : ''}`}
              data-node-id={node.id}
              data-port-index={port.index}
              data-direction="out"
              style={{ left: cx - GEOMETRY.slotRadius, top: cy - GEOMETRY.slotRadius }}
              title={`${port.name} (${port.type})`}
            />
            <span className="graph-port-label is-output" style={{ right: node.size[0] - cx + 12, top: cy - 9 }}>
              {port.name}
            </span>
          </div>
        )
      })}
    </div>
  )
})
