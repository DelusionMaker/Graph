import { describe, expect, it } from 'vitest'
import {
  SCHEMA_VERSION,
  parseWorkflow,
  toPromptAPI,
  type UILink,
  type UINode,
  type WorkflowUI,
} from '../src/graph/workflow'

function makeNode(overrides: Partial<UINode> & Pick<UINode, 'id' | 'type'>): UINode {
  return {
    pos: [0, 0],
    size: [220, 120],
    inputs: [],
    outputs: [],
    widgets_values: [],
    ...overrides,
  }
}

function makeWorkflow(nodes: UINode[], links: UILink[] = []): WorkflowUI {
  return {
    last_node_id: nodes.reduce((max, node) => Math.max(max, node.id), 0),
    last_link_id: links.reduce((max, link) => Math.max(max, link[0]), 0),
    nodes,
    links,
    groups: [],
    config: { schema_version: SCHEMA_VERSION },
  }
}

describe('toPromptAPI', () => {
  it('把连线写成 [源节点 id, 源槽位]，且不被 widget 值覆盖', () => {
    const workflow = makeWorkflow(
      [
        makeNode({
          id: 1,
          type: 'loaders/CheckpointLoader',
          outputs: [{ name: 'MODEL', type: 'MODEL' }],
        }),
        makeNode({
          id: 2,
          type: 'sampling/KSampler',
          inputs: [{ name: 'MODEL', type: 'MODEL', link: 10 }],
          widgets_values: ['should-not-win'],
          widget_names: ['MODEL'],
        }),
      ],
      [[10, 1, 0, 2, 0, 'MODEL']],
    )

    expect(toPromptAPI(workflow)).toEqual({
      '1': { class_type: 'loaders/CheckpointLoader', inputs: {} },
      '2': { class_type: 'sampling/KSampler', inputs: { MODEL: [1, 0] } },
    })
  })

  it('按 widget_names 映射控件值，缺省回退到 widget_i', () => {
    const workflow = makeWorkflow([
      makeNode({
        id: 3,
        type: 'sampling/KSampler',
        widgets_values: [20, 'euler'],
        widget_names: ['steps', 'sampler'],
      }),
      makeNode({ id: 4, type: 'x/Anon', widgets_values: [1, 2] }),
    ])

    expect(toPromptAPI(workflow)['3'].inputs).toEqual({ steps: 20, sampler: 'euler' })
    expect(toPromptAPI(workflow)['4'].inputs).toEqual({ widget_0: 1, widget_1: 2 })
  })

  it('静音与旁路节点不进入执行图', () => {
    const workflow = makeWorkflow([
      makeNode({ id: 1, type: 'a' }),
      makeNode({ id: 2, type: 'b', mode: 1 }),
      makeNode({ id: 3, type: 'c', mode: 2 }),
    ])

    expect(Object.keys(toPromptAPI(workflow))).toEqual(['1'])
  })

  it('悬空 link id 不会写入执行格式', () => {
    const workflow = makeWorkflow([
      makeNode({
        id: 1,
        type: 'a',
        inputs: [{ name: 'IN', type: 'X', link: 99 }],
        widgets_values: ['fallback'],
        widget_names: ['IN'],
      }),
    ])

    expect(toPromptAPI(workflow)['1'].inputs).toEqual({ IN: 'fallback' })
  })

  it('title 存在时写入 _meta', () => {
    const workflow = makeWorkflow([makeNode({ id: 1, type: 'a', title: '加载器' })])
    expect(toPromptAPI(workflow)['1']._meta).toEqual({ title: '加载器' })
  })
})

describe('parseWorkflow 三级校验', () => {
  it('非对象 / 缺字段 / 版本过高都判定为结构错误', () => {
    expect(parseWorkflow(null).workflow).toBeNull()
    expect(parseWorkflow([]).issues[0].level).toBe(1)
    expect(parseWorkflow({ nodes: [], links: [] }).workflow).not.toBeNull()
    expect(parseWorkflow({ nodes: [] }).issues[0].level).toBe(1)
    expect(parseWorkflow({ nodes: [], links: [], config: { schema_version: 99 } }).workflow).toBeNull()
  })

  it('丢弃重复 id 的节点并记录二级问题', () => {
    const { workflow, issues } = parseWorkflow({
      nodes: [
        { id: 1, type: 'a', pos: [0, 0], size: [10, 10] },
        { id: 1, type: 'b', pos: [0, 0], size: [10, 10] },
      ],
      links: [],
    })

    expect(workflow?.nodes).toHaveLength(1)
    expect(issues.some((issue) => issue.level === 2)).toBe(true)
  })

  it('丢弃端点缺失或槽位越界的连线', () => {
    const { workflow, issues } = parseWorkflow({
      nodes: [
        {
          id: 1,
          type: 'a',
          pos: [0, 0],
          size: [10, 10],
          outputs: [{ name: 'OUT', type: 'IMAGE' }],
        },
        { id: 2, type: 'b', pos: [0, 0], size: [10, 10], inputs: [{ name: 'IN', type: 'IMAGE' }] },
      ],
      links: [
        [1, 1, 0, 2, 0, 'IMAGE'],
        [2, 1, 0, 99, 0, 'IMAGE'],
        [3, 1, 5, 2, 0, 'IMAGE'],
      ],
    })

    expect(workflow?.links).toEqual([[1, 1, 0, 2, 0, 'IMAGE']])
    expect(issues.filter((issue) => issue.level === 2)).toHaveLength(2)
  })

  it('未知端口类型降级为 * 并记录三级问题', () => {
    const { workflow, issues } = parseWorkflow({
      nodes: [
        {
          id: 1,
          type: 'a',
          pos: [0, 0],
          size: [10, 10],
          outputs: [{ name: 'OUT', type: 'UNKNOWN' }],
        },
        { id: 2, type: 'b', pos: [0, 0], size: [10, 10], inputs: [{ name: 'IN', type: 'IMAGE' }] },
      ],
      links: [[1, 1, 0, 2, 0, 'UNKNOWN']],
    })

    expect(workflow?.nodes[0].outputs[0].type).toBe('*')
    expect(workflow?.links[0][5]).toBe('*')
    expect(issues.filter((issue) => issue.level === 3)).toHaveLength(2)
  })

  it('以 links 为准重建 input.link 与 output.links', () => {
    const { workflow } = parseWorkflow({
      nodes: [
        {
          id: 1,
          type: 'a',
          pos: [0, 0],
          size: [10, 10],
          outputs: [{ name: 'OUT', type: 'X', links: [7] }],
        },
        {
          id: 2,
          type: 'b',
          pos: [0, 0],
          size: [10, 10],
          inputs: [{ name: 'IN', type: 'X', link: null }],
        },
      ],
      links: [[1, 1, 0, 2, 0, 'X']],
    })

    expect(workflow?.nodes[0].outputs[0].links).toEqual([1])
    expect(workflow?.nodes[1].inputs[0].link).toBe(1)
  })

  it('v1 文档迁移到 v2 并补默认视口相机', () => {
    const { workflow } = parseWorkflow({
      nodes: [],
      links: [],
      config: { schema_version: 1 },
    })
    expect(workflow?.config.schema_version).toBe(SCHEMA_VERSION)
    expect(workflow?.config.shader_extension?.viewer?.camera?.position).toEqual([3, 2.4, 4.2])
  })

  it('v2 文档保留原有 shader_extension', () => {
    const camera = { position: [1, 2, 3], target: [0, 1, 0] }
    const { workflow } = parseWorkflow({
      nodes: [],
      links: [],
      config: { schema_version: 2, shader_extension: { viewer: { camera } } },
    })
    expect(workflow?.config.schema_version).toBe(2)
    expect(workflow?.config.shader_extension?.viewer?.camera).toEqual(camera)
  })

  it('缺失的坐标 / 尺寸回落默认值，并写回 schema_version', () => {
    const { workflow } = parseWorkflow({ nodes: [{ id: 5, type: 'a' }], links: [] })
    expect(workflow?.nodes[0].pos).toEqual([0, 0])
    expect(workflow?.nodes[0].size).toEqual([220, 120])
    expect(workflow?.config.schema_version).toBe(SCHEMA_VERSION)
    expect(workflow?.last_node_id).toBe(5)
  })
})
