import { useGraphStore } from '../../graph/store'
import type { NodeSnapshot } from '../../graph/types'
import { Widget } from '../Widget'

const INPUT_LABELS: Record<string, string> = {
  baseColor: '基础色',
  roughness: '粗糙度',
  metalness: '金属度',
  emissive: '自发光',
}

/** material/Surface：着色模式 + 四个输入的来源 */
export function SurfaceForm({ node }: { node: NodeSnapshot }) {
  const links = useGraphStore((state) => state.links)
  const nodes = useGraphStore((state) => state.nodes)
  const shadingWidget = node.widgets.find((widget) => widget.name === 'shading')

  return (
    <section>
      <h3>材质</h3>
      {shadingWidget && <Widget nodeId={node.id} widget={shadingWidget} />}

      <div className="inspector-inputs">
        {node.inputs.map((input) => {
          const link = links.find(
            (item) => item.targetId === node.id && item.targetSlot === input.index,
          )
          const origin = link ? nodes.find((item) => item.id === link.originId) : undefined
          return (
            <div key={input.name} className="inspector-input-row">
              <span className="inspector-input-name">{INPUT_LABELS[input.name] ?? input.name}</span>
              <span className={`inspector-input-state${origin ? ' is-linked' : ''}`}>
                {origin ? `来自 #${origin.id} ${origin.title}` : '使用默认值'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
