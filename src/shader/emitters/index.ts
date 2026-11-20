import type { PortType } from '../../graph/workflow'
import { emitMath, emitMixColor } from './math'
import { emitSurface } from './surface'
import { emitTexture } from './texture'
import {
  emitColor,
  emitFloat,
  emitNormal,
  emitPosition,
  emitTime,
  emitUv,
  emitVec3,
} from './values'

export type UniformKind = 'float' | 'vec2' | 'vec3' | 'color' | 'time' | 'texture'

export interface UniformSource {
  nodeId: number
  /** 该 uniform 由哪些 widget 组成（Vec3 为 x/y/z） */
  widgets: string[]
  kind: UniformKind
}

export interface TextureSlot {
  uniform: string
  assetId: string
  wrap: 'repeat' | 'clamp' | 'mirror'
  flipY: boolean
}

export type ShadingModel = 'pbr' | 'unlit' | 'lambert' | 'blinnPhong'

export interface SurfaceEmit {
  shading: ShadingModel
  color: string
  roughness: string
  metalness: string
  emissive: string
  /** 仅 Blinn-Phong 使用 */
  shininess?: string
  specularStrength?: string
}

export interface EmitResult {
  expr: string
  type: PortType
  surface?: SurfaceEmit
}

export interface EmitContext {
  nodeId: number
  /** 读取本节点 widget 值 */
  widget: (name: string) => unknown
  /** 递归 emit 指定输入端口的上游结果；没有连线返回 null */
  input: (name: string) => EmitResult | null
  /** 注册 uniform 并追加声明，返回变量名 */
  uniform: (suffix: string, kind: UniformKind, value: unknown, source: UniformSource) => string
  /** 注册纹理 uniform，返回变量名 */
  texture: (suffix: string, assetId: string, wrap: TextureSlot['wrap'], flipY: boolean) => string
  /** 追加任意 GLSL 声明 */
  declare: (glsl: string) => void
  /** 记录警告（不阻断编译） */
  warn: (message: string) => void
  /** 记录错误并终止编译 */
  error: (message: string) => never
}

export type Emitter = (ctx: EmitContext) => EmitResult

const EMITTERS: Record<string, Emitter> = {
  'shader/Float': emitFloat,
  'shader/Color': emitColor,
  'shader/UV': emitUv,
  'shader/Normal': emitNormal,
  'shader/Position': emitPosition,
  'shader/Time': emitTime,
  'shader/Texture': emitTexture,
  'shader/Math': emitMath,
  'shader/MixColor': emitMixColor,
  'shader/Vec3': emitVec3,
  'material/Surface': emitSurface,
}

export function getEmitter(type: string): Emitter | undefined {
  return EMITTERS[type]
}

/** uniform 类型 → GLSL 声明类型 */
export function glslType(kind: UniformKind): string {
  switch (kind) {
    case 'vec2':
      return 'vec2'
    case 'vec3':
    case 'color':
      return 'vec3'
    case 'texture':
      return 'sampler2D'
    default:
      return 'float'
  }
}
