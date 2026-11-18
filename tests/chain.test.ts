import { describe, expect, it } from 'vitest'
import type { UILink, UINode, WorkflowUI } from '../src/graph/workflow'
import { collectPostFXChain } from '../src/postfx/chain'

function makeNode(id: number, type: string, widgets: unknown[] = []): UINode {
  return {
    id,
    type,
    pos: [0, 0],
    size: [200, 100],
    inputs: [],
    outputs: [],
    widgets_values: widgets,
  }
}

function makeWorkflow(nodes: UINode[], links: UILink[]): WorkflowUI {
  return {
    last_node_id: Math.max(0, ...nodes.map((node) => node.id)),
    last_link_id: Math.max(0, ...links.map((link) => link[0])),
    nodes,
    links,
    groups: [],
    config: { schema_version: 2 },
  }
}

describe('collectPostFXChain', () => {
  it('没有 Output 时返回空链', () => {
    expect(collectPostFXChain(makeWorkflow([], []), null)).toEqual([])
  })

  it('Output 没有输入连线时返回空链', () => {
    const workflow = makeWorkflow([makeNode(1, 'postfx/Output')], [])
    expect(collectPostFXChain(workflow, 1)).toEqual([])
  })

  it('单级链返回效果与参数', () => {
    const workflow = makeWorkflow(
      [makeNode(1, 'postfx/Bloom', [1.2, 0.3, true]), makeNode(2, 'postfx/Output')],
      [[1, 1, 0, 2, 0, 'POSTFX']],
    )
    const chain = collectPostFXChain(workflow, 2)
    expect(chain.map((item) => item.type)).toEqual(['Bloom'])
    expect(chain[0].params).toMatchObject({
      intensity: 1.2,
      luminanceThreshold: 0.3,
      mipmapBlur: true,
    })
  })

  it('三级链按从先到后的执行顺序返回', () => {
    const workflow = makeWorkflow(
      [
        makeNode(1, 'postfx/Bloom', [1, 0.2, true]),
        makeNode(2, 'postfx/SSAO', [16, 0.1, 1]),
        makeNode(3, 'postfx/Vignette', [0.5, 0.3]),
        makeNode(4, 'postfx/Output'),
      ],
      [
        [1, 1, 0, 2, 0, 'POSTFX'],
        [2, 2, 0, 3, 0, 'POSTFX'],
        [3, 3, 0, 4, 0, 'POSTFX'],
      ],
    )
    expect(collectPostFXChain(workflow, 4).map((item) => item.type)).toEqual([
      'Bloom',
      'SSAO',
      'Vignette',
    ])
  })

  it('FXAA 映射为 SMAA', () => {
    const workflow = makeWorkflow(
      [makeNode(1, 'postfx/FXAA'), makeNode(2, 'postfx/Output')],
      [[1, 1, 0, 2, 0, 'POSTFX']],
    )
    expect(collectPostFXChain(workflow, 2).map((item) => item.type)).toEqual(['SMAA'])
  })

  it('链中存在环时不会无限循环', () => {
    // 合法的环：Vignette → SSAO → Vignette，同时 SSAO → Output
    const workflow = makeWorkflow(
      [
        makeNode(1, 'postfx/Vignette', [0.5, 0.3]),
        makeNode(2, 'postfx/SSAO', [16, 0.1, 1]),
        makeNode(3, 'postfx/Output'),
      ],
      [
        [1, 1, 0, 2, 0, 'POSTFX'],
        [2, 2, 0, 1, 0, 'POSTFX'],
        [3, 2, 0, 3, 0, 'POSTFX'],
      ],
    )
    expect(collectPostFXChain(workflow, 3).map((item) => item.type)).toEqual(['Vignette', 'SSAO'])
  })
})
