import { LiteGraph } from '@comfyorg/litegraph'
import { EditorNode } from './EditorNode'
import { GEOMETRY } from './geometry'
import {
  NODE_DEFINITIONS,
  type NodeDefinition,
  type WidgetDefinition,
  type WidgetKind,
} from './nodeDefinitions'

/**
 * 节点定义（纯数据）在 nodeDefinitions.ts，这里只负责注册到 LiteGraph。
 * 编译器与测试只依赖 nodeDefinitions，避免在 Node 环境加载 LiteGraph / DOM。
 */
export * from './nodeDefinitions'

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

function nodeSize(definition: NodeDefinition): [number, number] {
  const slotRows = Math.max(definition.inputs.length, definition.outputs.length, 1)
  const widgetsHeight = definition.widgets.length * GEOMETRY.widgetRowHeight
  return [
    definition.width ?? GEOMETRY.nodeWidth,
    GEOMETRY.titleHeight + slotRows * GEOMETRY.slotHeight + widgetsHeight + 8,
  ]
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
          addWidget(
            WIDGET_LIB_TYPES[widget.kind],
            widget.name,
            widget.value,
            () => {},
            widgetOptions(widget),
          )
        }

        this.setSize(nodeSize(definition))
      }
    }

    LiteGraph.registerNodeType(definition.type, NodeClass)
  }
}
