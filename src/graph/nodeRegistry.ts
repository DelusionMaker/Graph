import { LiteGraph } from '@comfyorg/litegraph'
import { EditorNode } from './EditorNode'
import { GEOMETRY } from './geometry'

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
]

const definitionsByType = new Map(NODE_DEFINITIONS.map((definition) => [definition.type, definition]))

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return definitionsByType.get(type)
}

export function nodeSize(definition: NodeDefinition): [number, number] {
  const slotRows = Math.max(definition.inputs.length, definition.outputs.length, 1)
  const widgetsHeight = definition.widgets.length * GEOMETRY.widgetRowHeight
  return [
    definition.width ?? GEOMETRY.nodeWidth,
    GEOMETRY.titleHeight + slotRows * GEOMETRY.slotHeight + widgetsHeight + 8,
  ]
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

const WIDGET_LIB_TYPES: Record<WidgetKind, 'number' | 'slider' | 'combo' | 'text' | 'toggle'> = {
  number: 'number',
  slider: 'slider',
  combo: 'combo',
  text: 'text',
  boolean: 'toggle',
}

function widgetOptions(definition: WidgetDefinition): Record<string, unknown> | undefined {
  if (definition.kind === 'combo') return { values: definition.values ?? [] }
  if (definition.kind === 'number' || definition.kind === 'slider') {
    return { min: definition.min, max: definition.max, step: definition.step }
  }
  return undefined
}

let registered = false

/** 把 NodeDefinition 注册为 LiteGraph 节点类型；React 层只读同一份定义 */
export function registerNodeDefinitions(): void {
  if (registered) return
  registered = true

  for (const definition of NODE_DEFINITIONS) {
    const NodeClass = class extends EditorNode {
      static definition = definition
      // LiteGraph.createNode 用 `base_class.title || type` 作为默认标题，
      // 不设置会退化成类名或注册名
      static title = definition.title

      constructor(title?: string) {
        super(title ?? definition.title)
        for (const input of definition.inputs) this.addInput(input.name, input.type)
        for (const output of definition.outputs) this.addOutput(output.name, output.type)

        const addWidget = this.addWidget.bind(this) as (
          type: string,
          name: string,
          value: unknown,
          callback: (() => void) | null,
          options?: Record<string, unknown>,
        ) => unknown

        for (const widget of definition.widgets) {
          addWidget(WIDGET_LIB_TYPES[widget.kind], widget.name, widget.value, () => {}, widgetOptions(widget))
        }

        this.setSize(nodeSize(definition))
      }
    }

    LiteGraph.registerNodeType(definition.type, NodeClass)
  }
}
