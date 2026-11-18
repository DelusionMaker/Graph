import { LiteGraph } from '@comfyorg/litegraph'
import { EditorNode } from './EditorNode'
import { GEOMETRY } from './geometry'

/** 阶段 1 的示例节点，仅用于验证画布基座；阶段 2 会替换为节点注册机制 */
export class DemoSource extends EditorNode {
  constructor(title: string) {
    super(title)
    this.addOutput('MODEL', 'MODEL')
    this.addOutput('CLIP', 'CLIP')
    this.addWidget('combo', 'ckpt', 'sd15.safetensors', () => {}, {
      values: ['sd15.safetensors', 'sdxl.safetensors'],
    })
    this.setSize([GEOMETRY.nodeWidth, GEOMETRY.nodeHeight])
  }
}

export class DemoTarget extends EditorNode {
  constructor(title: string) {
    super(title)
    this.addInput('MODEL', 'MODEL')
    this.addInput('CLIP', 'CLIP')
    this.setSize([GEOMETRY.nodeWidth, GEOMETRY.nodeHeight])
  }
}

let registered = false

export function registerDemoNodes(): void {
  if (registered) return
  registered = true
  LiteGraph.registerNodeType('demo/Source', DemoSource)
  LiteGraph.registerNodeType('demo/Target', DemoTarget)
}
