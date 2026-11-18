import { memo } from 'react'
import { GEOMETRY, inputSlotOffset, outputSlotOffset } from './geometry'
import type { NodeSnapshot } from './types'

interface Props {
  node: NodeSnapshot
}

export const NodeView = memo(function NodeView({ node }: Props) {
  return (
    <div
      className="spike-node"
      data-node-id={node.id}
      style={{
        left: node.pos[0],
        top: node.pos[1],
        width: node.size[0],
        height: node.size[1],
      }}
    >
      <div className="spike-node-title" style={{ height: GEOMETRY.titleHeight }}>
        {node.title}
        <span className="spike-node-id">#{node.id}</span>
      </div>

      {node.inputs.map((port) => {
        const [cx, cy] = inputSlotOffset(port.index)
        return (
          <div key={`in-${port.index}`}>
            <span
              className={`spike-port${port.connected ? ' is-connected' : ''}`}
              data-node-id={node.id}
              data-port-index={port.index}
              data-direction="in"
              style={{ left: cx - GEOMETRY.slotRadius, top: cy - GEOMETRY.slotRadius }}
              title={`${port.name} (${port.type})`}
            />
            <span className="spike-port-label" style={{ left: cx + 12, top: cy - 9 }}>
              {port.name}
            </span>
          </div>
        )
      })}

      {node.outputs.map((port) => {
        const [cx, cy] = outputSlotOffset(port.index, node.size[0])
        return (
          <div key={`out-${port.index}`}>
            <span
              className={`spike-port${port.connected ? ' is-connected' : ''}`}
              data-node-id={node.id}
              data-port-index={port.index}
              data-direction="out"
              style={{ left: cx - GEOMETRY.slotRadius, top: cy - GEOMETRY.slotRadius }}
              title={`${port.name} (${port.type})`}
            />
            <span className="spike-port-label is-output" style={{ right: node.size[0] - cx + 12, top: cy - 9 }}>
              {port.name}
            </span>
          </div>
        )
      })}
    </div>
  )
})
