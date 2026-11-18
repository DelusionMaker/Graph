import { portColor } from '../graph/portTypes'
import { useGraphStore } from '../graph/store'
import { useProgramStore } from '../shader/useProgramStore'
import { Widget } from './Widget'
import { CompileBanner } from './inspector/CompileBanner'
import { LightingForm } from './inspector/LightingForm'
import { PostFXForm } from './inspector/PostFXForm'
import { SceneOverview } from './inspector/SceneOverview'
import { SurfaceForm } from './inspector/SurfaceForm'

/** 这些类型有专门的表单，通用"参数"区块不再重复渲染 */
function hasCustomForm(type: string): boolean {
  return type === 'material/Surface' || type.startsWith('render/') || type.startsWith('postfx/')
}

export function InspectorPanel() {
  const nodes = useGraphStore((state) => state.nodes)
  const selectedIds = useGraphStore((state) => state.selectedIds)
  const errors = useProgramStore((state) => state.errors)
  const node = selectedIds.length === 1 ? nodes.find((item) => item.id === selectedIds[0]) : undefined

  if (!node) return <SceneOverview />

  const nodeErrors = errors.filter((error) => error.nodeId === node.id)

  return (
    <div className="inspector">
      <CompileBanner errors={nodeErrors} />

      <h2>{node.title}</h2>
      <p className="hint">{node.type}</p>

      {node.type === 'material/Surface' && <SurfaceForm node={node} />}
      {node.type.startsWith('render/') && <LightingForm node={node} />}
      {node.type.startsWith('postfx/') && <PostFXForm node={node} />}

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

      {!hasCustomForm(node.type) && node.widgets.length > 0 && (
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
