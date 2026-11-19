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
    expect(program.mesh).toEqual({ shape: 'box', assetId: '', scale: 1, wireframe: false })
    expect(program.pbr).toBeNull()
    expect(program.unlit).toBeNull()
    expect(program.postfxChain).toEqual([])
  })

  it('编译完整材质链并生成 PBR 注入片段', () => {
    const program = compileWorkflow(buildMaterialGraph())
    expect(program.activeRootId).toBe(2)
    expect(program.shading).toBe('pbr')
    expect(program.mesh.shape).toBe('sphere')
    expect(program.pbr?.fragmentShader).toContain('u_3_value')
    expect(program.pbr?.fragmentShader).toContain('u_5_value')
    expect(program.pbr?.fragmentShader).toContain('evaluateLight0')
    expect(program.pbr?.fragmentShader).toContain('u_lightCount')

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

  it('wireframe 变化通过 refreshProgram 生效且不重编译', () => {
    const workflow = makeWorkflow(
      [
        makeNode(1, 'scene/Mesh', ['sphere', '', 1, false]),
        makeNode(2, 'scene/Root'),
        makeNode(3, 'material/Surface', ['pbr', '#ff0000', 0.5, 0.2, '#000000']),
      ],
      [
        [1, 1, 0, 2, 0, 'GEOMETRY'],
        [2, 3, 0, 2, 1, 'MATERIAL'],
      ],
    )
    const program = compileWorkflow(workflow)
    expect(program.mesh.wireframe).toBe(false)

    const changed: WorkflowUI = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === 1 ? { ...node, widgets_values: ['sphere', '', 1, true] } : node,
      ),
    }
    expect(computeSignature(changed)).toBe(program.hash)
    expect(refreshProgram(changed, program).mesh.wireframe).toBe(true)
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

  it('读取光照节点与阴影设置', () => {
    const workflow = makeWorkflow(
      [
        makeNode(1, 'render/AmbientLight', ['#ffffff', 0.3]),
        makeNode(2, 'render/DirectionalLight', ['#ff0000', 5, 1, -1, 0]),
        makeNode(3, 'render/LightRig'),
        makeNode(4, 'render/Shadow', [true, '2048', 0.001, 2]),
        makeNode(5, 'scene/Root'),
        makeNode(6, 'material/Surface', ['pbr']),
      ],
      [
        [1, 1, 0, 3, 0, 'LIGHT'],
        [2, 2, 0, 3, 1, 'LIGHT'],
        [3, 3, 0, 5, 2, 'LIGHTS'],
        [4, 6, 0, 5, 1, 'MATERIAL'],
      ],
    )
    const program = compileWorkflow(workflow)

    expect(program.lighting.lights).toHaveLength(2)
    expect(program.lighting.lights[0].type).toBe('ambient')
    expect(program.lighting.lights[0].intensity).toBe(0.3)
    expect(program.lighting.lights[1].type).toBe('directional')
    expect(program.lighting.lights[1].intensity).toBe(5)
    expect(program.lighting.lights[1].direction[1]).toBeCloseTo(-0.707, 2)
    expect(program.lighting.shadow?.enabled).toBe(true)
    expect(program.lighting.shadow?.mapSize).toBe(2048)
    expect(program.lighting.shadow?.softness).toBe(2)
  })

  it('未连接灯光组时回退默认光照', () => {
    const program = compileWorkflow(
      makeWorkflow([makeNode(1, 'scene/Root'), makeNode(2, 'material/Surface', ['pbr'])], [
        [1, 2, 0, 1, 1, 'MATERIAL'],
      ]),
    )
    expect(program.lighting.lights.map((light) => light.type)).toEqual([
      'ambient',
      'directional',
    ])
  })

  it('多个 Scene Root 时使用 id 最小者并警告', () => {
    const workflow = makeWorkflow([makeNode(2, 'scene/Root'), makeNode(1, 'scene/Root')])
    const program = compileWorkflow(workflow)
    expect(program.activeRootId).toBe(1)
    expect(program.warnings.some((warning) => warning.includes('scene/Root'))).toBe(true)
  })

  it('Surface 未连线时使用节点上的兜底常量', () => {
    const workflow = makeWorkflow(
      [
        makeNode(1, 'scene/Root'),
        makeNode(2, 'material/Surface', ['pbr', '#00ff00', 0.8, 0.1, '#000000']),
      ],
      [[1, 2, 0, 1, 1, 'MATERIAL']],
    )
    const program = compileWorkflow(workflow)
    expect(program.pbr?.fragmentShader).toContain('u_2_baseColor')
    expect(program.pbr?.fragmentShader).toContain('u_2_roughness')
    expect(program.uniforms.u_2_roughness.value).toBe(0.8)
    expect(program.uniforms.u_2_metalness.value).toBe(0.1)
    expect(program.uniforms.u_2_baseColor.value).toHaveLength(3)
  })

  it('Surface 兜底常量变化只刷新 uniform', () => {
    const workflow = makeWorkflow(
      [
        makeNode(1, 'scene/Root'),
        makeNode(2, 'material/Surface', ['pbr', '#00ff00', 0.8, 0.1, '#000000']),
      ],
      [[1, 2, 0, 1, 1, 'MATERIAL']],
    )
    const program = compileWorkflow(workflow)
    const changed: WorkflowUI = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === 2 ? { ...node, widgets_values: ['pbr', '#ff0000', 0.2, 0.1, '#000000'] } : node,
      ),
    }
    expect(computeSignature(changed)).toBe(program.hash)
    const refreshed = refreshProgram(changed, program)
    expect(refreshed.uniforms.u_2_roughness.value).toBe(0.2)
    expect(refreshed.hash).toBe(program.hash)
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
