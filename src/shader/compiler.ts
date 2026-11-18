import { getNodeDefinition, readWidgetValue } from '../graph/nodeDefinitions'
import type { UILink, UINode, WorkflowUI } from '../graph/workflow'
import { collectPostFXChain, type PostFXDescriptor } from '../postfx/chain'
import {
  glslType,
  getEmitter,
  type EmitContext,
  type EmitResult,
  type TextureSlot,
  type UniformKind,
  type UniformSource,
} from './emitters'
import { parseColor, readNumber } from './emitters/values'
import { UNLIT_VERTEX, unlitFragment } from './glsl/chunks'
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
}

export interface EnvironmentSettings {
  ambient: number
  dirIntensity: number
  lightPos: [number, number, number]
  shadowEnabled: boolean
  shadowMapSize: 1024 | 2048
  shadowBias: number
}

export interface CompiledProgram {
  /** 结构签名短哈希，作为 material.customProgramCacheKey */
  hash: string
  version: number
  injection: {
    color: string
    roughness: string
    metalness: string
    emissive: string
  }
  uniformDeclarations: string[]
  uniforms: Record<string, UniformValue>
  /** uniform 名 → 取值来源，用于仅 uniform 变化时免重编译刷新 */
  uniformSources: Record<string, UniformSource>
  textureSlots: TextureSlot[]
  environment: EnvironmentSettings
  postfxChain: PostFXDescriptor[]
  shading: 'pbr' | 'unlit'
  mesh: MeshSettings
  /** true 表示 mesh 由 scene/Mesh 节点驱动；false 时视口回退到工具条状态 */
  meshFromNode: boolean
  activeRootId: number | null
  activeOutputId: number | null
  unlit: { vertexShader: string; fragmentShader: string } | null
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
  return link ? nodeById.get(link[1]) ?? null : null
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
  }
}

function readEnvironment(workflow: WorkflowUI): EnvironmentSettings {
  const fallback: EnvironmentSettings = {
    ambient: 0.7,
    dirIntensity: 2.2,
    lightPos: [4, 6, 4],
    shadowEnabled: true,
    shadowMapSize: 1024,
    shadowBias: -0.0005,
  }

  const node = workflow.nodes.find((item) => item.type === 'render/Environment')
  if (!node) return fallback

  const mapSize = Number(readWidgetValue(node, 'shadowMapSize'))
  return {
    ambient: readNumber(readWidgetValue(node, 'ambient'), fallback.ambient),
    dirIntensity: readNumber(readWidgetValue(node, 'dirIntensity'), fallback.dirIntensity),
    lightPos: [
      readNumber(readWidgetValue(node, 'lightPosX'), fallback.lightPos[0]),
      readNumber(readWidgetValue(node, 'lightPosY'), fallback.lightPos[1]),
      readNumber(readWidgetValue(node, 'lightPosZ'), fallback.lightPos[2]),
    ],
    shadowEnabled: readWidgetValue(node, 'shadowEnabled') !== false,
    shadowMapSize: mapSize === 2048 ? 2048 : 1024,
    shadowBias: readNumber(readWidgetValue(node, 'shadowBias'), fallback.shadowBias),
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
        uniforms[name] = kind === 'time' ? { type: kind, value, animated: true } : { type: kind, value }
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

  const shading = surface?.shading ?? 'pbr'
  const injection = surface
    ? {
        color: `diffuseColor.rgb = ${surface.color};`,
        roughness: `roughnessFactor = ${surface.roughness};`,
        metalness: `metalnessFactor = ${surface.metalness};`,
        emissive: `totalEmissiveRadiance = ${surface.emissive};`,
      }
    : { color: '', roughness: '', metalness: '', emissive: '' }

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
    injection,
    uniformDeclarations: declarations,
    uniforms,
    uniformSources,
    textureSlots,
    environment: readEnvironment(workflow),
    postfxChain: collectPostFXChain(workflow, activeOutput?.id ?? null),
    shading,
    mesh: meshSettings ?? { shape: 'box', assetId: '', scale: 1 },
    meshFromNode: meshSettings !== null,
    activeRootId: activeRoot?.id ?? null,
    activeOutputId: activeOutput?.id ?? null,
    unlit,
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

  return {
    ...previous,
    uniforms,
    mesh: meshSettings ?? previous.mesh,
    meshFromNode: meshSettings !== null,
    environment: readEnvironment(workflow),
    postfxChain: collectPostFXChain(workflow, previous.activeOutputId),
  }
}
