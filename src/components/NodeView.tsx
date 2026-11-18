import { memo } from 'react'
import { GEOMETRY } from '../graph/geometry'
import { portColor } from '../graph/portTypes'
import type { NodeSnapshot } from '../graph/types'
import { Widget } from './Widget'

interface Props {
  node: NodeSnapshot
  selected: boolean
}

export const NodeView = memo(function NodeView({ node, selected }: Props) {
  const slotRows = Math.max(node.inputs.length, node.outputs.length, 1)
  const widgetsTop = GEOMETRY.titleHeight + slotRows * GEOMETRY.slotHeight + 6

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
        <span className="graph-node-title-text">{node.title}</span>
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
              data-port-type={port.type}
              style={{
                left: cx - GEOMETRY.slotRadius,
                top: cy - GEOMETRY.slotRadius,
                background: portColor(port.type),
              }}
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
              data-port-type={port.type}
              style={{
                left: cx - GEOMETRY.slotRadius,
                top: cy - GEOMETRY.slotRadius,
                background: portColor(port.type),
              }}
              title={`${port.name} (${port.type})`}
            />
            <span className="graph-port-label is-output" style={{ right: node.size[0] - cx + 12, top: cy - 9 }}>
              {port.name}
            </span>
          </div>
        )
      })}

      {node.widgets.length > 0 && (
        <div className="graph-widgets" style={{ top: widgetsTop }}>
          {node.widgets.map((widget) => (
            <Widget key={widget.index} nodeId={node.id} widget={widget} />
          ))}
        </div>
      )}
    </div>
  )
})
