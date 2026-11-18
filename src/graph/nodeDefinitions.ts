/**
 * 节点定义的纯数据层。
 *
 * 刻意不 import LiteGraph / DOM（也不 import geometry.ts，它读 LiteGraph 常量）：
 * 编译器、signature 与单元测试都在 Node 环境里读取这里的元数据，
 * 节点尺寸计算与节点类注册留在 nodeRegistry.ts。
 */

export type WidgetKind = 'number' | 'slider' | 'combo' | 'text' | 'boolean'

export interface SlotDefinition {
  name: string
  type: string
}

export interface WidgetDefinition {
  name: string
  kind: WidgetKind
  value: string | number | boolean
  values?: string[]
  min?: number
  max?: number
  step?: number
}

export interface NodeDefinition {
  /** LiteGraph 注册名，也是工作流里的 class_type */
  type: string
  title: string
  category: string
  description: string
  inputs: SlotDefinition[]
  outputs: SlotDefinition[]
  widgets: WidgetDefinition[]
  width?: number
  /** 改变这些 widget 会改变 GLSL 结构，需要重编译；其余 widget 只更新 uniform */
  codeAffectingWidgets?: string[]
  /** 终端节点（scene/Root / postfx/Output），编译器从这里回溯 */
  terminal?: boolean
}

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'loaders/CheckpointLoader',
    title: 'Checkpoint 加载器',
    category: '加载器',
    description: '加载模型、CLIP 与 VAE',
    inputs: [],
    outputs: [
      { name: 'MODEL', type: 'MODEL' },
      { name: 'CLIP', type: 'CLIP' },
      { name: 'VAE', type: 'VAE' },
    ],
    widgets: [
      {
        name: 'ckpt_name',
        kind: 'combo',
        value: 'sd15.safetensors',
        values: ['sd15.safetensors', 'sdxl_base.safetensors', 'flux_dev.safetensors'],
      },
    ],
  },
  {
    type: 'conditioning/CLIPTextEncode',
    title: 'CLIP 文本编码',
    category: '条件',
    description: '把提示词编码为条件',
    inputs: [{ name: 'CLIP', type: 'CLIP' }],
    outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING' }],
    widgets: [{ name: 'text', kind: 'text', value: 'a beautiful landscape' }],
  },
  {
    type: 'sampling/KSampler',
    title: 'KSampler',
    category: '采样',
    description: '按采样器参数去噪',
    inputs: [
      { name: 'MODEL', type: 'MODEL' },
      { name: 'CONDITIONING', type: 'CONDITIONING' },
      { name: 'LATENT', type: 'LATENT' },
    ],
    outputs: [{ name: 'LATENT', type: 'LATENT' }],
    widgets: [
      { name: 'seed', kind: 'number', value: 156680208700286, min: 0, step: 1 },
      { name: 'steps', kind: 'number', value: 20, min: 1, max: 150, step: 1 },
      { name: 'cfg', kind: 'number', value: 8, min: 0, max: 30, step: 0.5 },
      {
        name: 'sampler',
        kind: 'combo',
        value: 'euler',
        values: ['euler', 'euler_ancestral', 'dpmpp_2m', 'ddim'],
      },
      {
        name: 'scheduler',
        kind: 'combo',
        value: 'normal',
        values: ['normal', 'karras', 'exponential'],
      },
      { name: 'denoise', kind: 'slider', value: 1, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    type: 'latent/EmptyLatentImage',
    title: '空潜空间图像',
    category: '潜空间',
    description: '生成指定尺寸的空白 latent',
    inputs: [],
    outputs: [{ name: 'LATENT', type: 'LATENT' }],
    widgets: [
      { name: 'width', kind: 'number', value: 512, min: 64, max: 2048, step: 8 },
      { name: 'height', kind: 'number', value: 512, min: 64, max: 2048, step: 8 },
      { name: 'batch_size', kind: 'number', value: 1, min: 1, max: 16, step: 1 },
    ],
  },
  {
    type: 'image/VAEDecode',
    title: 'VAE 解码',
    category: '图像',
    description: '把 latent 解码为图像',
    inputs: [
      { name: 'LATENT', type: 'LATENT' },
      { name: 'VAE', type: 'VAE' },
    ],
    outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
    widgets: [],
  },

  // ---------- 场景与材质域 ----------
  {
    type: 'scene/Mesh',
    title: 'Mesh',
    category: '场景',
    description: '选择内置几何体或上传 glTF',
    inputs: [],
    outputs: [{ name: 'geometry', type: 'GEOMETRY' }],
    widgets: [
      { name: 'shape', kind: 'combo', value: 'box', values: ['box', 'sphere', 'torusknot', 'gltf'] },
      { name: 'assetId', kind: 'text', value: '' },
      { name: 'scale', kind: 'number', value: 1, min: 0.1, max: 10, step: 0.1 },
    ],
    codeAffectingWidgets: ['shape', 'assetId'],
    width: 220,
  },
  {
    type: 'scene/Root',
    title: 'Scene Root',
    category: '场景',
    description: '场景渲染根：接收几何体与材质',
    inputs: [
      { name: 'geometry', type: 'GEOMETRY' },
      { name: 'material', type: 'MATERIAL' },
    ],
    outputs: [],
    widgets: [],
    terminal: true,
    width: 200,
  },
  {
    type: 'material/Surface',
    title: 'Surface 材质',
    category: '材质',
    description: 'PBR 或 Unlit 表面输出',
    inputs: [
      { name: 'baseColor', type: 'COLOR' },
      { name: 'roughness', type: 'FLOAT' },
      { name: 'metalness', type: 'FLOAT' },
      { name: 'emissive', type: 'COLOR' },
    ],
    outputs: [{ name: 'material', type: 'MATERIAL' }],
    widgets: [{ name: 'shading', kind: 'combo', value: 'pbr', values: ['pbr', 'unlit'] }],
    codeAffectingWidgets: ['shading'],
    width: 220,
  },
  {
    type: 'render/Environment',
    title: 'Environment',
    category: '渲染',
    description: '光照与阴影配置',
    inputs: [],
    outputs: [],
    widgets: [
      { name: 'ambient', kind: 'slider', value: 0.7, min: 0, max: 3, step: 0.05 },
      { name: 'dirIntensity', kind: 'slider', value: 2.2, min: 0, max: 8, step: 0.1 },
      { name: 'lightPosX', kind: 'number', value: 4, step: 0.1 },
      { name: 'lightPosY', kind: 'number', value: 6, step: 0.1 },
      { name: 'lightPosZ', kind: 'number', value: 4, step: 0.1 },
      { name: 'shadowEnabled', kind: 'boolean', value: true },
      { name: 'shadowMapSize', kind: 'combo', value: '1024', values: ['1024', '2048'] },
      { name: 'shadowBias', kind: 'number', value: -0.0005, step: 0.0001 },
    ],
    width: 220,
  },

  // ---------- Shader 值域 ----------
  {
    type: 'shader/Float',
    title: 'Float',
    category: '着色器',
    description: '数值常量（uniform）',
    inputs: [],
    outputs: [{ name: 'value', type: 'FLOAT' }],
    widgets: [{ name: 'value', kind: 'number', value: 0, step: 0.01 }],
    width: 160,
  },
  {
    type: 'shader/Color',
    title: 'Color',
    category: '着色器',
    description: '颜色常量（sRGB，写入前转线性）',
    inputs: [],
    outputs: [{ name: 'color', type: 'COLOR' }],
    widgets: [{ name: 'value', kind: 'text', value: '#8b9cff' }],
    width: 180,
  },
  {
    type: 'shader/UV',
    title: 'UV',
    category: '着色器',
    description: '顶点 UV（vShaderUv）',
    inputs: [],
    outputs: [{ name: 'uv', type: 'VEC2' }],
    widgets: [],
    width: 140,
  },
  {
    type: 'shader/Normal',
    title: 'Normal',
    category: '着色器',
    description: '视图空间法线',
    inputs: [],
    outputs: [{ name: 'normal', type: 'VEC3' }],
    widgets: [],
    width: 150,
  },
  {
    type: 'shader/Position',
    title: 'Position',
    category: '着色器',
    description: '视图空间位置',
    inputs: [],
    outputs: [{ name: 'position', type: 'VEC3' }],
    widgets: [],
    width: 150,
  },
  {
    type: 'shader/Time',
    title: 'Time',
    category: '着色器',
    description: '时间（逐帧更新；存在此节点时切 always 帧循环）',
    inputs: [],
    outputs: [{ name: 'time', type: 'FLOAT' }],
    widgets: [{ name: 'speed', kind: 'number', value: 1, min: 0, max: 10, step: 0.1 }],
    width: 170,
  },
  {
    type: 'shader/Texture',
    title: 'Texture',
    category: '着色器',
    description: '纹理采样',
    inputs: [{ name: 'uv', type: 'VEC2' }],
    outputs: [{ name: 'color', type: 'COLOR' }],
    widgets: [
      { name: 'assetId', kind: 'text', value: '' },
      { name: 'wrap', kind: 'combo', value: 'repeat', values: ['repeat', 'clamp', 'mirror'] },
      { name: 'flipY', kind: 'boolean', value: true },
    ],
    codeAffectingWidgets: ['assetId', 'wrap', 'flipY'],
    width: 200,
  },
  {
    type: 'shader/Math',
    title: 'Math',
    category: '着色器',
    description: '标量数学运算',
    inputs: [
      { name: 'a', type: 'FLOAT' },
      { name: 'b', type: 'FLOAT' },
    ],
    outputs: [{ name: 'result', type: 'FLOAT' }],
    widgets: [
      { name: 'op', kind: 'combo', value: 'mul', values: ['add', 'sub', 'mul', 'div', 'sin', 'pow', 'lerp'] },
    ],
    codeAffectingWidgets: ['op'],
    width: 170,
  },
  {
    type: 'shader/MixColor',
    title: 'Mix Color',
    category: '着色器',
    description: '两色按 t 混合',
    inputs: [
      { name: 'a', type: 'COLOR' },
      { name: 'b', type: 'COLOR' },
      { name: 't', type: 'FLOAT' },
    ],
    outputs: [{ name: 'color', type: 'COLOR' }],
    widgets: [],
    width: 180,
  },
  {
    type: 'shader/Vec3',
    title: 'Vec3',
    category: '着色器',
    description: '三维向量常量',
    inputs: [],
    outputs: [{ name: 'value', type: 'VEC3' }],
    widgets: [
      { name: 'x', kind: 'number', value: 0, step: 0.1 },
      { name: 'y', kind: 'number', value: 0, step: 0.1 },
      { name: 'z', kind: 'number', value: 0, step: 0.1 },
    ],
    width: 170,
  },

  // ---------- 后处理域 ----------
  {
    type: 'postfx/Bloom',
    title: 'Bloom',
    category: '后处理',
    description: '泛光',
    inputs: [{ name: 'in', type: 'POSTFX' }],
    outputs: [{ name: 'out', type: 'POSTFX' }],
    widgets: [
      { name: 'intensity', kind: 'slider', value: 0.8, min: 0, max: 5, step: 0.05 },
      { name: 'luminanceThreshold', kind: 'slider', value: 0.2, min: 0, max: 1, step: 0.01 },
      { name: 'mipmapBlur', kind: 'boolean', value: true },
    ],
    width: 200,
  },
  {
    type: 'postfx/SSAO',
    title: 'SSAO',
    category: '后处理',
    description: '环境光遮蔽',
    inputs: [{ name: 'in', type: 'POSTFX' }],
    outputs: [{ name: 'out', type: 'POSTFX' }],
    widgets: [
      { name: 'samples', kind: 'number', value: 16, min: 1, max: 64, step: 1 },
      { name: 'radius', kind: 'slider', value: 0.1, min: 0.01, max: 1, step: 0.01 },
      { name: 'intensity', kind: 'slider', value: 1, min: 0, max: 4, step: 0.05 },
    ],
    width: 190,
  },
  {
    type: 'postfx/Vignette',
    title: 'Vignette',
    category: '后处理',
    description: '暗角',
    inputs: [{ name: 'in', type: 'POSTFX' }],
    outputs: [{ name: 'out', type: 'POSTFX' }],
    widgets: [
      { name: 'darkness', kind: 'slider', value: 0.5, min: 0, max: 1, step: 0.01 },
      { name: 'offset', kind: 'slider', value: 0.3, min: 0, max: 1, step: 0.01 },
    ],
    width: 180,
  },
  {
    type: 'postfx/FXAA',
    title: 'FXAA',
    category: '后处理',
    description: '抗锯齿（SMAA）',
    inputs: [{ name: 'in', type: 'POSTFX' }],
    outputs: [{ name: 'out', type: 'POSTFX' }],
    widgets: [],
    width: 160,
  },
  {
    type: 'postfx/Output',
    title: 'PostFX Output',
    category: '后处理',
    description: '后处理链终端',
    inputs: [{ name: 'effects', type: 'POSTFX' }],
    outputs: [],
    widgets: [],
    terminal: true,
    width: 190,
  },
]

const definitionsByType = new Map(NODE_DEFINITIONS.map((definition) => [definition.type, definition]))

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return definitionsByType.get(type)
}

/** 读取节点某个 widget 的值；widget 顺序与定义一致 */
export function readWidgetValue(node: { type: string; widgets_values: unknown[] }, name: string): unknown {
  const definition = getNodeDefinition(node.type)
  const index = definition?.widgets.findIndex((widget) => widget.name === name) ?? -1
  if (index < 0) return undefined
  return node.widgets_values[index]
}

/** 节点库用：按分类分组并支持关键字过滤 */
export function searchNodeDefinitions(query: string): { category: string; nodes: NodeDefinition[] }[] {
  const keyword = query.trim().toLowerCase()
  const groups = new Map<string, NodeDefinition[]>()

  for (const definition of NODE_DEFINITIONS) {
    if (
      keyword &&
      !`${definition.title} ${definition.type} ${definition.category} ${definition.description}`
        .toLowerCase()
        .includes(keyword)
    ) {
      continue
    }
    const list = groups.get(definition.category) ?? []
    list.push(definition)
    groups.set(definition.category, list)
  }

  return [...groups.entries()].map(([category, nodes]) => ({ category, nodes }))
}
