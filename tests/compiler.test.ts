import { describe, expect, it } from 'vitest'
import type { UILink, UINode, WorkflowUI } from '../src/graph/workflow'
import { compileWorkflow, CompileError, refreshProgram } from '../src/shader/compiler'
import { computeSignature } from '../src/shader/signature'

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

/**
 * 1 Mesh(sphere) → 2 Root.geometry
 * 3 Color(#ff0000) → 4 Surface.baseColor
 * 5 Float(0.25) → 4 Surface.roughness
 * 4 Surface.material → 2 Root.material
 */
function buildMaterialGraph(): WorkflowUI {
  return makeWorkflow(
    [
      makeNode(1, 'scene/Mesh', ['sphere', '', 1]),
      makeNode(2, 'scene/Root'),
      makeNode(3, 'shader/Color', ['#ff0000']),
      makeNode(4, 'material/Surface', ['pbr']),
      makeNode(5, 'shader/Float', [0.25]),
    ],
    [
      [1, 1, 0, 2, 0, 'GEOMETRY'],
      [2, 3, 0, 4, 0, 'COLOR'],
      [3, 5, 0, 4, 1, 'FLOAT'],
      [4, 4, 0, 2, 1, 'MATERIAL'],
    ],
  )
}

describe('compileWorkflow', () => {
  it('空图输出默认 Box + 白材质', () => {
    const program = compileWorkflow(makeWorkflow([], []))
    expect(program.shading).toBe('pbr')
    expect(program.mesh).toEqual({ shape: 'box', assetId: '', scale: 1 })
    expect(program.injection.color).toBe('')
    expect(program.unlit).toBeNull()
    expect(program.postfxChain).toEqual([])
  })

  it('编译完整材质链并生成 PBR 注入片段', () => {
    const program = compileWorkflow(buildMaterialGraph())
    expect(program.activeRootId).toBe(2)
    expect(program.shading).toBe('pbr')
    expect(program.mesh.shape).toBe('sphere')
    expect(program.injection.color).toContain('diffuseColor.rgb = u_3_value;')
    expect(program.injection.roughness).toContain('roughnessFactor = u_5_value;')

    const color = program.uniforms.u_3_value.value as number[]
    expect(color[0]).toBeCloseTo(1)
    expect(color[1]).toBeCloseTo(0)
    expect(color[2]).toBeCloseTo(0)
    expect(program.uniforms.u_5_value.value).toBe(0.25)
    expect(program.uniformDeclarations).toContain('uniform vec3 u_3_value;')
    expect(program.uniformDeclarations).toContain('uniform float u_5_value;')
  })

  it('hash 等于结构签名，结构变化时签名改变', () => {
    const workflow = buildMaterialGraph()
    const program = compileWorkflow(workflow)
    expect(program.hash).toBe(computeSignature(workflow))

    const changed: WorkflowUI = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === 4 ? { ...node, widgets_values: ['unlit'] } : node,
      ),
    }
    expect(computeSignature(changed)).not.toBe(program.hash)
  })

  it('unlit 模式生成完整 shader', () => {
    const workflow = buildMaterialGraph()
    const changed: WorkflowUI = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === 4 ? { ...node, widgets_values: ['unlit'] } : node,
      ),
    }
    const program = compileWorkflow(changed)
    expect(program.shading).toBe('unlit')
    expect(program.unlit?.fragmentShader).toContain('gl_FragColor')
    expect(program.unlit?.vertexShader).toContain('vShaderUv')
    expect(program.unlit?.fragmentShader).toContain('u_3_value')
  })

  it('仅 uniform 变化时 refreshProgram 不改变 hash', () => {
    const workflow = buildMaterialGraph()
    const program = compileWorkflow(workflow)
    const changed: WorkflowUI = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === 5 ? { ...node, widgets_values: [0.75] } : node,
      ),
    }
    const refreshed = refreshProgram(changed, program)
    expect(refreshed.hash).toBe(program.hash)
    expect(refreshed.uniforms.u_5_value.value).toBe(0.75)
    expect(refreshed.mesh).toEqual(program.mesh)
  })

  it('mesh scale 变化通过 refreshProgram 生效且不重编译', () => {
    const workflow = buildMaterialGraph()
    const program = compileWorkflow(workflow)
    const changed: WorkflowUI = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === 1 ? { ...node, widgets_values: ['sphere', '', 2.5] } : node,
      ),
    }
    expect(computeSignature(changed)).toBe(program.hash)
    expect(refreshProgram(changed, program).mesh.scale).toBe(2.5)
  })

  it('断开必需输入时抛 CompileError 并带 nodeId', () => {
    const workflow = makeWorkflow(
      [
        makeNode(1, 'scene/Root'),
        makeNode(2, 'material/Surface', ['pbr']),
        makeNode(3, 'shader/Math', ['mul']),
        makeNode(4, 'shader/Float', [1]),
      ],
      [
        // Surface → Root.material；Math → Surface.roughness；Float → Math.a（故意断开 Math.b）
        [1, 2, 0, 1, 1, 'MATERIAL'],
        [2, 3, 0, 2, 1, 'FLOAT'],
        [3, 4, 0, 3, 0, 'FLOAT'],
      ],
    )

    expect(() => compileWorkflow(workflow)).toThrowError(CompileError)
    try {
      compileWorkflow(workflow)
    } catch (error) {
      expect((error as CompileError).nodeId).toBe(3)
    }
  })

  it('读取 Environment 参数', () => {
    const workflow = makeWorkflow([
      makeNode(1, 'render/Environment', [0.3, 5, 1, 2, 3, false, '2048', 0.001]),
    ])
    expect(compileWorkflow(workflow).environment).toEqual({
      ambient: 0.3,
      dirIntensity: 5,
      lightPos: [1, 2, 3],
      shadowEnabled: false,
      shadowMapSize: 2048,
      shadowBias: 0.001,
    })
  })

  it('多个 Scene Root 时使用 id 最小者并警告', () => {
    const workflow = makeWorkflow([makeNode(2, 'scene/Root'), makeNode(1, 'scene/Root')])
    const program = compileWorkflow(workflow)
    expect(program.activeRootId).toBe(1)
    expect(program.warnings.some((warning) => warning.includes('scene/Root'))).toBe(true)
  })

  it('Texture 缺少 assetId 时报错', () => {
    const workflow = makeWorkflow(
      [
        makeNode(1, 'scene/Root'),
        makeNode(2, 'material/Surface', ['pbr']),
        makeNode(3, 'shader/Texture', ['', 'repeat', true]),
      ],
      [
        [1, 2, 0, 1, 1, 'MATERIAL'],
        [2, 3, 0, 2, 0, 'COLOR'],
      ],
    )
    expect(() => compileWorkflow(workflow)).toThrowError(/assetId/)
  })
})
