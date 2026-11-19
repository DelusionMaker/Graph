import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, parseWorkflow } from '../src/graph/workflow'

describe('parseWorkflow 三级校验', () => {
  it('非对象 / 缺字段 / 版本过高都判定为结构错误', () => {
    expect(parseWorkflow(null).workflow).toBeNull()
    expect(parseWorkflow([]).issues[0].level).toBe(1)
    expect(parseWorkflow({ nodes: [], links: [] }).workflow).not.toBeNull()
    expect(parseWorkflow({ nodes: [] }).issues[0].level).toBe(1)
    expect(
      parseWorkflow({ nodes: [], links: [], config: { schema_version: 99 } }).workflow,
    ).toBeNull()
  })

  it('丢弃重复 id 的节点并记录二级问题', () => {
    const { workflow, issues } = parseWorkflow({
      nodes: [
        { id: 1, type: 'shader/Float', pos: [0, 0], size: [10, 10] },
        { id: 1, type: 'shader/Color', pos: [0, 0], size: [10, 10] },
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
          outputs: [{ name: 'OUT', type: 'COLOR' }],
        },
        { id: 2, type: 'b', pos: [0, 0], size: [10, 10], inputs: [{ name: 'IN', type: 'COLOR' }] },
      ],
      links: [
        [1, 1, 0, 2, 0, 'COLOR'],
        [2, 1, 0, 99, 0, 'COLOR'],
        [3, 1, 5, 2, 0, 'COLOR'],
      ],
    })

    expect(workflow?.links).toEqual([[1, 1, 0, 2, 0, 'COLOR']])
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
        { id: 2, type: 'b', pos: [0, 0], size: [10, 10], inputs: [{ name: 'IN', type: 'COLOR' }] },
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
          outputs: [{ name: 'OUT', type: 'FLOAT', links: [7] }],
        },
        {
          id: 2,
          type: 'b',
          pos: [0, 0],
          size: [10, 10],
          inputs: [{ name: 'IN', type: 'FLOAT', link: null }],
        },
      ],
      links: [[1, 1, 0, 2, 0, 'FLOAT']],
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
    const { workflow } = parseWorkflow({ nodes: [{ id: 5, type: 'shader/Float' }], links: [] })
    expect(workflow?.nodes[0].pos).toEqual([0, 0])
    expect(workflow?.nodes[0].size).toEqual([220, 120])
    expect(workflow?.config.schema_version).toBe(SCHEMA_VERSION)
    expect(workflow?.last_node_id).toBe(5)
  })
})
