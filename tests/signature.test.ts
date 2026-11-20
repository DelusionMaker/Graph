import { describe, expect, it } from 'vitest'
import type { UILink, UINode, WorkflowUI } from '../src/graph/workflow'
import { computeSignature } from '../src/shader/signature'

function makeNode(
  id: number,
  type: string,
  widgets: unknown[] = [],
  pos: [number, number] = [0, 0],
): UINode {
  return {
    id,
    type,
    pos,
    size: [200, 100],
    inputs: [],
    outputs: [],
    widgets_values: widgets,
  }
}

function makeWorkflow(
  nodes: UINode[],
  links: UILink[] = [],
  config: Record<string, unknown> = {},
): WorkflowUI {
  return {
    last_node_id: Math.max(0, ...nodes.map((node) => node.id)),
    last_link_id: Math.max(0, ...links.map((link) => link[0])),
    nodes,
    links,
    groups: [],
    config: { schema_version: 2, ...config },
  }
}

function baseGraph(): WorkflowUI {
  return makeWorkflow(
    [
      makeNode(1, 'scene/Mesh', ['box', '', 1]),
      makeNode(2, 'scene/Root'),
      makeNode(3, 'shader/Float', [0.5]),
      makeNode(4, 'material/Surface', ['pbr']),
    ],
    [
      [1, 1, 0, 2, 0, 'GEOMETRY'],
      [2, 3, 0, 4, 1, 'FLOAT'],
      [3, 4, 0, 2, 1, 'MATERIAL'],
    ],
  )
}

describe('computeSignature', () => {
  it('同一图签名稳定', () => {
    expect(computeSignature(baseGraph())).toBe(computeSignature(baseGraph()))
  })

  it('节点位置变化不影响签名', () => {
    const changed = baseGraph()
    changed.nodes[0].pos = [320, 480]
    expect(computeSignature(changed)).toBe(computeSignature(baseGraph()))
  })

  it('仅 uniform 类 widget 变化不影响签名', () => {
    const changed = baseGraph()
    changed.nodes[2].widgets_values = [0.9]
    expect(computeSignature(changed)).toBe(computeSignature(baseGraph()))
  })

  it('mesh scale 变化不影响签名（可由 refreshProgram 刷新）', () => {
    const changed = baseGraph()
    changed.nodes[0].widgets_values = ['box', '', 2.5]
    expect(computeSignature(changed)).toBe(computeSignature(baseGraph()))
  })

  it('codeAffecting widget 变化会改变签名', () => {
    const changed = baseGraph()
    changed.nodes[3].widgets_values = ['unlit']
    expect(computeSignature(changed)).not.toBe(computeSignature(baseGraph()))
  })

  it('阴影方法变化会改变签名，采样参数变化不会', () => {
    const graph = makeWorkflow(
      [
        makeNode(1, 'render/Shadow', ['1024', 0.001, 1, 'pcf', 6, 8, 16]),
        makeNode(2, 'scene/Root'),
      ],
      [[1, 1, 0, 2, 3, 'SHADOW']],
    )
    const methodChanged = makeWorkflow(
      [
        makeNode(1, 'render/Shadow', ['1024', 0.001, 1, 'pcss', 6, 8, 16]),
        makeNode(2, 'scene/Root'),
      ],
      [[1, 1, 0, 2, 3, 'SHADOW']],
    )
    const vsmChanged = makeWorkflow(
      [
        makeNode(1, 'render/Shadow', ['1024', 0.001, 1, 'vsm', 6, 8, 16]),
        makeNode(2, 'scene/Root'),
      ],
      [[1, 1, 0, 2, 3, 'SHADOW']],
    )
    const paramsChanged = makeWorkflow(
      [
        makeNode(1, 'render/Shadow', ['1024', 0.001, 1, 'pcf', 10, 12, 24]),
        makeNode(2, 'scene/Root'),
      ],
      [[1, 1, 0, 2, 3, 'SHADOW']],
    )

    expect(computeSignature(methodChanged)).not.toBe(computeSignature(graph))
    expect(computeSignature(vsmChanged)).not.toBe(computeSignature(graph))
    expect(computeSignature(paramsChanged)).toBe(computeSignature(graph))
  })

  it('Mesh shape 变化会改变签名', () => {
    const changed = baseGraph()
    changed.nodes[0].widgets_values = ['sphere', '', 1]
    expect(computeSignature(changed)).not.toBe(computeSignature(baseGraph()))
  })

  it('连线变化会改变签名', () => {
    const changed = baseGraph()
    changed.links = changed.links.slice(0, 2)
    expect(computeSignature(changed)).not.toBe(computeSignature(baseGraph()))
  })

  it('与终端无关的节点变化不影响签名', () => {
    const changed = baseGraph()
    changed.nodes.push(makeNode(9, 'shader/Math', ['mul']))
    expect(computeSignature(changed)).toBe(computeSignature(baseGraph()))
  })

  it('activeRoot 配置变化会改变签名', () => {
    const changed = baseGraph()
    changed.config.activeRoot = 2
    expect(computeSignature(changed)).not.toBe(computeSignature(baseGraph()))
  })
})
