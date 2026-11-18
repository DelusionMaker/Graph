import type { NodeSnapshot } from '../../graph/types'
import { Widget } from '../Widget'

/** postfx/*：效果参数，执行顺序由连线决定 */
export function PostFXForm({ node }: { node: NodeSnapshot }) {
  return (
    <section>
      <h3>效果参数</h3>
      {node.widgets.length === 0 ? (
        <p className="inspector-none">此效果没有可调参数</p>
      ) : (
        node.widgets.map((widget) => (
          <Widget key={widget.index} nodeId={node.id} widget={widget} />
        ))
      )}
      <p className="inspector-note">执行顺序由连线决定：效果节点连到 postfx/Output</p>
    </section>
  )
}
