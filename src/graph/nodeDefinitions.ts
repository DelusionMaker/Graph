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
      { name: 'wireframe', kind: 'boolean', value: false }
    ],
    codeAffectingWidgets: ['shape', 'assetId'],
    width: 220,
  },
  {
    type: 'scene/Root',
    title: 'Scene Root',
    category: '场景',
    description: '场景渲染根：接收几何体、材质与灯光组',
    inputs: [
      { name: 'geometry', type: 'GEOMETRY' },
      { name: 'material', type: 'MATERIAL' },
      { name: 'lights', type: 'LIGHTS' },
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
    widgets: [
      { name: 'shading', kind: 'combo', value: 'pbr', values: ['pbr', 'unlit'] },
      // 未连线时的兜底常量；连线后以上游节点为准
      { name: 'baseColor', kind: 'text', value: '#8b9cff' },
      { name: 'roughness', kind: 'slider', value: 0.5, min: 0, max: 1, step: 0.01 },
      { name: 'metalness', kind: 'slider', value: 0.2, min: 0, max: 1, step: 0.01 },
      { name: 'emissive', kind: 'text', value: '#000000' },
    ],
    codeAffectingWidgets: ['shading'],
    width: 220,
  },
  {
    type: 'render/AmbientLight',
    title: '环境光',
    category: '渲染',
    description: '均匀环境光，直接进入自定义光照结果',
    inputs: [],
    outputs: [{ name: 'light', type: 'LIGHT' }],
    widgets: [
      { name: 'color', kind: 'text', value: '#ffffff' },
      { name: 'intensity', kind: 'slider', value: 0.5, min: 0, max: 4, step: 0.05 },
    ],
    width: 200,
  },
  {
    type: 'render/DirectionalLight',
    title: '平行光',
    category: '渲染',
    description: '方向光，方向由向量控制',
    inputs: [],
    outputs: [{ name: 'light', type: 'LIGHT' }],
    widgets: [
      { name: 'color', kind: 'text', value: '#ffffff' },
      { name: 'intensity', kind: 'slider', value: 1.2, min: 0, max: 8, step: 0.1 },
      { name: 'dirX', kind: 'number', value: -0.5, step: 0.1 },
      { name: 'dirY', kind: 'number', value: -1, step: 0.1 },
      { name: 'dirZ', kind: 'number', value: -0.4, step: 0.1 },
    ],
    width: 210,
  },
  {
    type: 'render/PointLight',
    title: '点光',
    category: '渲染',
    description: '点光源，带距离衰减',
    inputs: [],
    outputs: [{ name: 'light', type: 'LIGHT' }],
    widgets: [
      { name: 'color', kind: 'text', value: '#ffd7a8' },
      { name: 'intensity', kind: 'slider', value: 2.0, min: 0, max: 10, step: 0.1 },
      { name: 'posX', kind: 'number', value: 2, step: 0.1 },
      { name: 'posY', kind: 'number', value: 2, step: 0.1 },
      { name: 'posZ', kind: 'number', value: 2, step: 0.1 },
      { name: 'decay', kind: 'slider', value: 2, min: 0, max: 4, step: 0.1 },
    ],
    width: 210,
  },
  {
    type: 'render/LightRig',
    title: '灯光组',
    category: '渲染',
    description: '最多组合 3 盏灯，输出到 Scene Root',
    inputs: [
      { name: 'light1', type: 'LIGHT' },
      { name: 'light2', type: 'LIGHT' },
      { name: 'light3', type: 'LIGHT' },
    ],
    outputs: [{ name: 'lights', type: 'LIGHTS' }],
    widgets: [],
    width: 190,
  },
  {
    type: 'render/Shadow',
    title: '阴影',
    category: '渲染',
    description: '方向光阴影（自定义 shadow map + PCF）',
    inputs: [],
    outputs: [],
    widgets: [
      { name: 'enabled', kind: 'boolean', value: true },
      { name: 'mapSize', kind: 'combo', value: '1024', values: ['1024', '2048'] },
      { name: 'bias', kind: 'number', value: 0.0015, step: 0.0005 },
      { name: 'softness', kind: 'slider', value: 1, min: 1, max: 4, step: 1 },
    ],
    width: 200,
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
      { name: 'worldDistanceThreshold', kind: 'slider', value: 0.5, min: 0, max: 2, step: 0.01 },
      { name: 'worldDistanceFalloff', kind: 'slider', value: 0.1, min: 0, max: 1, step: 0.01 },
      { name: 'worldProximityThreshold', kind: 'slider', value: 0.5, min: 0, max: 2, step: 0.01 },
      { name: 'worldProximityFalloff', kind: 'slider', value: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    width: 210,
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
