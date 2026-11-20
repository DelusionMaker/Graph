import { getNodeDefinition, readWidgetValue } from '../graph/nodeDefinitions'
import type { UILink, UINode, WorkflowUI } from '../graph/workflow'
import { collectPostFXChain, type PostFXDescriptor } from '../postfx/chain'
import {
  glslType,
  getEmitter,
  type EmitContext,
  type EmitResult,
  type ShadingModel,
  type TextureSlot,
  type UniformKind,
  type UniformSource,
} from './emitters'
import { parseColor, readNumber } from './emitters/values'
import {
  PBR_VERTEX,
  UNLIT_VERTEX,
  blinnPhongFragment,
  lambertFragment,
  pbrFragment,
  unlitFragment,
} from './glsl/chunks'
import { DEFAULT_SHADOW_METHOD, type ShadowMethod } from './glsl/shadow'
import { computeSignature } from './signature'

export type MeshShape = 'box' | 'sphere' | 'torusknot' | 'gltf'

export interface UniformValue {
  type: UniformKind
  value: unknown
  /** 逐帧更新（shader/Time） */
  animated?: boolean
}

export interface MeshSettings {
  shape: MeshShape
  assetId: string
  scale: number
  wireframe: boolean
}

export type LightType = 'ambient' | 'directional' | 'point'

export interface LightDescriptor {
  type: LightType
  /** 线性颜色 */
  color: [number, number, number]
  intensity: number
  /** 平行光方向（指向场景的方向向量） */
  direction: [number, number, number]
  /** 点光位置 */
  position: [number, number, number]
  /** 点光距离衰减 */
  decay: number
}

export interface ShadowSettings {
  /** 来自 render/Shadow 节点；非 null 即表示该节点已连接到 Scene Root */
  mapSize: 1024 | 2048
  bias: number
  softness: number
  /** 会改变 GLSL 结构，参与编译签名 */
  method: ShadowMethod
  /** PCSS 面积光半径，按 shadow map texel 计 */
  lightSize: number
  /** PCSS blocker 搜索采样数上限 16 */
  blockerSamples: number
  /** PCSS / PCF 可变半径采样数上限 32 */
  pcfSamples: number
  /** 按表面法线方向推离接收点的距离，抑制 shadow acne */
  normalBias: number
}

export interface LightingSettings {
  lights: LightDescriptor[]
  shadow: ShadowSettings | null
}

export interface ShaderSource {
  vertexShader: string
  fragmentShader: string
}

export interface CompiledProgram {
  /** 结构签名短哈希 */
  hash: string
  version: number
  uniformDeclarations: string[]
  uniforms: Record<string, UniformValue>
  /** uniform 名 → 取值来源，用于仅 uniform 变化时免重编译刷新 */
  uniformSources: Record<string, UniformSource>
  textureSlots: TextureSlot[]
  lighting: LightingSettings
  postfxChain: PostFXDescriptor[]
  shading: ShadingModel
  mesh: MeshSettings
  /** true 表示 mesh 由 scene/Mesh 节点驱动；false 时视口回退到工具条状态 */
  meshFromNode: boolean
  activeRootId: number | null
  activeOutputId: number | null
  pbr: ShaderSource | null
  unlit: ShaderSource | null
  lambert: ShaderSource | null
  blinnPhong: ShaderSource | null
  warnings: string[]
}

export class CompileError extends Error {
  readonly nodeId?: number

  constructor(message: string, nodeId?: number) {
    super(message)
    this.name = 'CompileError'
    this.nodeId = nodeId
  }
}

const MESH_SHAPES: MeshShape[] = ['box', 'sphere', 'torusknot', 'gltf']

function isMeshShape(value: string): value is MeshShape {
  return (MESH_SHAPES as string[]).includes(value)
}

function indexWorkflow(workflow: WorkflowUI) {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]))
  const linkByTarget = new Map<string, UILink>()
  for (const link of workflow.links) linkByTarget.set(`${link[3]}:${link[4]}`, link)
  return { nodeById, linkByTarget }
}

/** 找到某个输入端口的上游节点 */
function findUpstream(
  node: UINode,
  portName: string,
  linkByTarget: Map<string, UILink>,
  nodeById: Map<number, UINode>,
): UINode | null {
  const definition = getNodeDefinition(node.type)
  const slot = definition?.inputs.findIndex((input) => input.name === portName) ?? -1
  if (slot < 0) return null
  const link = linkByTarget.get(`${node.id}:${slot}`)
  return link ? (nodeById.get(link[1]) ?? null) : null
}

/** 多个终端时按 config 指定，未指定取 id 最小者 */
function pickActive(
  nodes: UINode[],
  configured: unknown,
  label: string,
  warnings: string[],
): UINode | null {
  if (nodes.length === 0) return null
  const sorted = [...nodes].sort((left, right) => left.id - right.id)
  if (sorted.length > 1) {
    warnings.push(`图中存在 ${sorted.length} 个 ${label}，使用 id=${sorted[0].id}，其余被忽略`)
  }
  const configuredId = Number(configured)
  if (Number.isFinite(configuredId)) {
    const hit = sorted.find((node) => node.id === configuredId)
    if (hit) return hit
  }
  return sorted[0]
}

function readMesh(workflow: WorkflowUI, rootId: number | null): MeshSettings | null {
  if (rootId == null) return null

  const { nodeById, linkByTarget } = indexWorkflow(workflow)
  const root = nodeById.get(rootId)
  if (!root) return null

  const meshNode = findUpstream(root, 'geometry', linkByTarget, nodeById)
  if (!meshNode || meshNode.type !== 'scene/Mesh') return null

  const shapeText = String(readWidgetValue(meshNode, 'shape') ?? 'box')
  return {
    shape: isMeshShape(shapeText) ? shapeText : 'box',
    assetId: String(readWidgetValue(meshNode, 'assetId') ?? ''),
    scale: readNumber(readWidgetValue(meshNode, 'scale'), 1),
    wireframe: readWidgetValue(meshNode, 'wireframe') === true,
  }
}

/** 未连接灯光组时的默认光照，保证空图也能看到模型 */
const DEFAULT_LIGHTS: LightDescriptor[] = [
  {
    type: 'ambient',
    color: [1, 1, 1],
    intensity: 0.45,
    direction: [0, -1, 0],
    position: [0, 0, 0],
    decay: 0,
  },
  {
    type: 'directional',
    color: [1, 1, 1],
    intensity: 1.2,
    direction: [-0.45, -0.89, -0.36],
    position: [0, 0, 0],
    decay: 0,
  },
]

function normalizeDirection(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z)
  if (length < 1e-5) return [0, -1, 0]
  return [x / length, y / length, z / length]
}

/** 读取单个光照节点的 widget，生成 shader 用的描述 */
function readLightNode(node: UINode): LightDescriptor | null {
  const color = parseColor(readWidgetValue(node, 'color'))
  const intensity = readNumber(readWidgetValue(node, 'intensity'), 1)

  switch (node.type) {
    case 'render/AmbientLight':
      return {
        type: 'ambient',
        color,
        intensity,
        direction: [0, -1, 0],
        position: [0, 0, 0],
        decay: 0,
      }
    case 'render/DirectionalLight':
      return {
        type: 'directional',
        color,
        intensity,
        direction: normalizeDirection(
          readNumber(readWidgetValue(node, 'dirX'), -0.5),
          readNumber(readWidgetValue(node, 'dirY'), -1),
          readNumber(readWidgetValue(node, 'dirZ'), -0.4),
        ),
        position: [0, 0, 0],
        decay: 0,
      }
    case 'render/PointLight':
      return {
        type: 'point',
        color,
        intensity,
        direction: [0, -1, 0],
        position: [
          readNumber(readWidgetValue(node, 'posX'), 2),
          readNumber(readWidgetValue(node, 'posY'), 2),
          readNumber(readWidgetValue(node, 'posZ'), 2),
        ],
        decay: readNumber(readWidgetValue(node, 'decay'), 2),
      }
    default:
      return null
  }
}

/** Scene Root.lights → LightRig → 最多 3 盏灯 */
function readLights(
  root: UINode | null,
  linkByTarget: Map<string, UILink>,
  nodeById: Map<number, UINode>,
  warnings: string[],
): LightDescriptor[] {
  if (!root) return DEFAULT_LIGHTS

  const rig = findUpstream(root, 'lights', linkByTarget, nodeById)
  if (!rig || rig.type !== 'render/LightRig') return DEFAULT_LIGHTS

  const lights: LightDescriptor[] = []
  for (const name of ['light1', 'light2', 'light3']) {
    const node = findUpstream(rig, name, linkByTarget, nodeById)
    if (!node) continue

    const light = readLightNode(node)
    if (light) lights.push(light)
    else warnings.push(`灯光组输入 ${name} 来自 ${node.type}，已忽略`)
  }

  return lights.length > 0 ? lights : DEFAULT_LIGHTS
}

/** Scene Root.shadow → render/Shadow；未连接时返回 null（无阴影） */
function readShadow(
  root: UINode | null,
  linkByTarget: Map<string, UILink>,
  nodeById: Map<number, UINode>,
  warnings: string[],
): ShadowSettings | null {
  if (!root) return null

  const node = findUpstream(root, 'shadow', linkByTarget, nodeById)
  if (!node) return null
  if (node.type !== 'render/Shadow') {
    warnings.push(`Scene Root 的 shadow 输入来自 ${node.type}，已忽略`)
    return null
  }

  const methodValue = String(readWidgetValue(node, 'method') ?? DEFAULT_SHADOW_METHOD)

  return {
    mapSize: Number(readWidgetValue(node, 'mapSize')) === 2048 ? 2048 : 1024,
    bias: readNumber(readWidgetValue(node, 'bias'), 0.0015),
    softness: Math.max(
      1,
      Math.min(4, Math.round(readNumber(readWidgetValue(node, 'softness'), 1))),
    ),
    method: methodValue === 'pcss' || methodValue === 'vsm' ? methodValue : DEFAULT_SHADOW_METHOD,
    lightSize: Math.max(1, Math.min(16, readNumber(readWidgetValue(node, 'lightSize'), 6))),
    blockerSamples: Math.max(
      4,
      Math.min(16, Math.round(readNumber(readWidgetValue(node, 'blockerSamples'), 8))),
    ),
    pcfSamples: Math.max(
      4,
      Math.min(32, Math.round(readNumber(readWidgetValue(node, 'pcfSamples'), 16))),
    ),
    normalBias: Math.max(0, Math.min(0.2, readNumber(readWidgetValue(node, 'normalBias'), 0.02))),
  }
}

/**
 * 编译入口：纯函数，不依赖 three / R3F。
 * 出错时抛 CompileError（带 nodeId），由调用方保留 lastGoodProgram。
 */
export function compileWorkflow(workflow: WorkflowUI): CompiledProgram {
  const warnings: string[] = []
  const uniforms: Record<string, UniformValue> = {}
  const uniformSources: Record<string, UniformSource> = {}
  const textureSlots: TextureSlot[] = []
  const declarations: string[] = []

  const { nodeById, linkByTarget } = indexWorkflow(workflow)
  const cache = new Map<number, EmitResult>()

  const emit = (node: UINode, stack: Set<number>): EmitResult => {
    const cached = cache.get(node.id)
    if (cached) return cached
    if (stack.has(node.id)) throw new CompileError('检测到循环依赖', node.id)

    const emitter = getEmitter(node.type)
    if (!emitter) throw new CompileError(`节点 ${node.type} 不参与 shader 编译`, node.id)

    stack.add(node.id)
    const ctx: EmitContext = {
      nodeId: node.id,
      widget: (name) => readWidgetValue(node, name),
      input: (name) => {
        const upstream = findUpstream(node, name, linkByTarget, nodeById)
        return upstream ? emit(upstream, stack) : null
      },
      uniform: (suffix, kind, value, source) => {
        const name = `u_${node.id}_${suffix}`
        uniforms[name] =
          kind === 'time' ? { type: kind, value, animated: true } : { type: kind, value }
        uniformSources[name] = source
        declarations.push(`uniform ${glslType(kind)} ${name};`)
        return name
      },
      texture: (suffix, assetId, wrap, flipY) => {
        const name = `u_${node.id}_${suffix}`
        uniforms[name] = { type: 'texture', value: assetId }
        textureSlots.push({ uniform: name, assetId, wrap, flipY })
        declarations.push(`uniform sampler2D ${name};`)
        return name
      },
      declare: (glsl) => declarations.push(glsl),
      warn: (message) => warnings.push(`${node.type}#${node.id}: ${message}`),
      error: (message) => {
        throw new CompileError(message, node.id)
      },
    }

    try {
      const result = emitter(ctx)
      cache.set(node.id, result)
      return result
    } finally {
      stack.delete(node.id)
    }
  }

  const roots = workflow.nodes.filter((node) => node.type === 'scene/Root')
  const outputs = workflow.nodes.filter((node) => node.type === 'postfx/Output')
  const activeRoot = pickActive(roots, workflow.config.activeRoot, 'scene/Root', warnings)
  const activeOutput = pickActive(
    outputs,
    workflow.config.activePostFXOutput,
    'postfx/Output',
    warnings,
  )

  // 材质链：Scene Root.material → material/Surface → 上游 shader 值
  let surface: EmitResult['surface']
  if (activeRoot) {
    const materialNode = findUpstream(activeRoot, 'material', linkByTarget, nodeById)
    if (materialNode) {
      if (materialNode.type === 'material/Surface') {
        surface = emit(materialNode, new Set()).surface ?? undefined
      } else {
        warnings.push(`Scene Root 的 material 输入来自 ${materialNode.type}，已忽略`)
      }
    } else {
      warnings.push('Scene Root 未连接材质，使用默认 PBR 白色材质')
    }
  }

  const shadowSettings = readShadow(activeRoot, linkByTarget, nodeById, warnings)
  const shadowMethod = shadowSettings?.method ?? DEFAULT_SHADOW_METHOD

  const shading = surface?.shading ?? 'pbr'
  const pbr =
    surface && shading === 'pbr'
      ? {
          vertexShader: PBR_VERTEX,
          fragmentShader: pbrFragment(declarations, surface, shadowMethod),
        }
      : null

  const lambert =
    surface && shading === 'lambert'
      ? {
          vertexShader: PBR_VERTEX,
          fragmentShader: lambertFragment(declarations, surface, shadowMethod),
        }
      : null

  const blinnPhong =
    surface && shading === 'blinnPhong'
      ? {
          vertexShader: PBR_VERTEX,
          fragmentShader: blinnPhongFragment(declarations, surface, shadowMethod),
        }
      : null

  const unlit =
    shading === 'unlit' && surface
      ? {
          vertexShader: UNLIT_VERTEX,
          fragmentShader: unlitFragment(declarations, surface.color),
        }
      : null

  const meshSettings = readMesh(workflow, activeRoot?.id ?? null)

  return {
    hash: computeSignature(workflow),
    version: 0,
    uniformDeclarations: declarations,
    uniforms,
    uniformSources,
    textureSlots,
    lighting: {
      lights: readLights(activeRoot, linkByTarget, nodeById, warnings),
      shadow: shadowSettings,
    },
    postfxChain: collectPostFXChain(workflow, activeOutput?.id ?? null),
    shading,
    mesh: meshSettings ?? { shape: 'box', assetId: '', scale: 1, wireframe: false },
    meshFromNode: meshSettings !== null,
    activeRootId: activeRoot?.id ?? null,
    activeOutputId: activeOutput?.id ?? null,
    pbr,
    unlit,
    lambert,
    blinnPhong,
    warnings,
  }
}

function convertUniformValue(value: unknown, kind: UniformKind): unknown {
  if (kind === 'color') return parseColor(value)
  if (kind === 'vec3') {
    const array = Array.isArray(value) ? value : [0, 0, 0]
    return [readNumber(array[0]), readNumber(array[1]), readNumber(array[2])]
  }
  return readNumber(value, 0)
}

/**
 * 签名不变时只刷新非结构性数据：uniform 值、mesh、environment、后处理参数。
 * 不重新 emit GLSL，也不重建材质。
 */
export function refreshProgram(workflow: WorkflowUI, previous: CompiledProgram): CompiledProgram {
  const uniforms = { ...previous.uniforms }

  for (const [name, source] of Object.entries(previous.uniformSources)) {
    // time 由逐帧循环维护；texture 只在结构签名变化时才会换绑
    if (source.kind === 'time' || source.kind === 'texture') continue
    const node = workflow.nodes.find((item) => item.id === source.nodeId)
    if (!node) continue

    const values = source.widgets.map((widget) => readWidgetValue(node, widget))
    uniforms[name] = {
      ...previous.uniforms[name],
      value:
        source.kind === 'vec3'
          ? values.map((value) => readNumber(value, 0))
          : convertUniformValue(values[0], source.kind),
    }
  }

  const meshSettings = readMesh(workflow, previous.activeRootId)
  const { nodeById, linkByTarget } = indexWorkflow(workflow)
  const root = previous.activeRootId != null ? (nodeById.get(previous.activeRootId) ?? null) : null

  return {
    ...previous,
    uniforms,
    mesh: meshSettings ?? previous.mesh,
    meshFromNode: meshSettings !== null,
    lighting: {
      lights: readLights(root, linkByTarget, nodeById, []),
      shadow: readShadow(root, linkByTarget, nodeById, []),
    },
    postfxChain: collectPostFXChain(workflow, previous.activeOutputId),
  }
}
