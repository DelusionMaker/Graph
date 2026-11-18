import type { NodeSnapshot } from '../../graph/types'
import { Widget } from '../Widget'

const GROUPS: Array<{ title: string; widgets: string[] }> = [
  { title: '光照', widgets: ['ambient', 'dirIntensity', 'lightPosX', 'lightPosY', 'lightPosZ'] },
  { title: '阴影', widgets: ['shadowEnabled', 'shadowMapSize', 'shadowBias'] },
]

/** render/Environment：光照与阴影分组表单 */
export function EnvironmentForm({ node }: { node: NodeSnapshot }) {
  return (
    <>
      {GROUPS.map((group) => {
        const widgets = node.widgets.filter((widget) => group.widgets.includes(widget.name))
        if (widgets.length === 0) return null
        return (
          <section key={group.title}>
            <h3>{group.title}</h3>
            {widgets.map((widget) => (
              <Widget key={widget.index} nodeId={node.id} widget={widget} />
            ))}
          </section>
        )
      })}
    </>
  )
}
