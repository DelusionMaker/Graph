import { portColor } from '../graph/portTypes'
import { useGraphStore } from '../graph/store'
import { Widget } from './Widget'

export function InspectorPanel() {
  const nodes = useGraphStore((state) => state.nodes)
  const selectedIds = useGraphStore((state) => state.selectedIds)
  const node = selectedIds.length === 1 ? nodes.find((item) => item.id === selectedIds[0]) : undefined

  if (!node) {
    return (
      <div className="inspector-empty" role="status">
        <p>未选中节点</p>
        <span>在画布中点击一个节点查看详情</span>
      </div>
    )
  }

  return (
    <div className="inspector">
      <h2>{node.title}</h2>
      <p className="hint">{node.type}</p>

      <section>
        <h3>布局</h3>
        <ul className="stats">
          <li>位置：{Math.round(node.pos[0])}, {Math.round(node.pos[1])}</li>
          <li>尺寸：{Math.round(node.size[0])} × {Math.round(node.size[1])}</li>
        </ul>
      </section>

      <section>
        <h3>输入（{node.inputs.length}）</h3>
        {node.inputs.length === 0 ? (
          <p className="inspector-none">无</p>
        ) : (
          node.inputs.map((port) => (
            <div key={`in-${port.index}`} className="inspector-port">
              <span className="inspector-dot" style={{ background: portColor(port.type) }} aria-hidden="true" />
              <span className="inspector-port-name">{port.name}</span>
              <span className="inspector-port-type">{port.type}</span>
            </div>
          ))
        )}
      </section>

      <section>
        <h3>输出（{node.outputs.length}）</h3>
        {node.outputs.length === 0 ? (
          <p className="inspector-none">无</p>
        ) : (
          node.outputs.map((port) => (
            <div key={`out-${port.index}`} className="inspector-port">
              <span className="inspector-dot" style={{ background: portColor(port.type) }} aria-hidden="true" />
              <span className="inspector-port-name">{port.name}</span>
              <span className="inspector-port-type">{port.type}</span>
            </div>
          ))
        )}
      </section>

      {node.widgets.length > 0 && (
        <section>
          <h3>参数</h3>
          {node.widgets.map((widget) => (
            <Widget key={widget.index} nodeId={node.id} widget={widget} />
          ))}
        </section>
      )}
    </div>
  )
}
