import type { NodeSnapshot } from '../../graph/types'
import { Widget } from '../Widget'

/** render/*：环境光、平行光、点光、灯光组与阴影 */
export function LightingForm({ node }: { node: NodeSnapshot }) {
  const title =
    node.type === 'render/LightRig'
      ? '灯光组'
      : node.type === 'render/Shadow'
        ? '阴影'
        : '光照'

  return (
    <section>
      <h3>{title}</h3>
      {node.widgets.length === 0 ? (
        <p className="inspector-none">
          {node.type === 'render/LightRig' ? '把最多 3 盏灯连接到灯光组' : '此节点没有可调参数'}
        </p>
      ) : (
        node.widgets.map((widget) => (
          <Widget key={widget.index} nodeId={node.id} widget={widget} />
        ))
      )}
      {node.type === 'render/LightRig' ? (
        <p className="inspector-note">灯光组输出到 Scene Root 的 lights 输入</p>
      ) : null}
    </section>
  )
}
