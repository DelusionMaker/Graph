import { LGraphNode, LiteGraph } from '@comfyorg/litegraph'
import { GEOMETRY, SLOT_START_Y } from './geometry'

export class SpikeSource extends LGraphNode {
  static slot_start_y = SLOT_START_Y

  constructor(title: string) {
    super(title)
    this.addOutput('MODEL', 'MODEL')
    this.addOutput('CLIP', 'CLIP')
    this.addWidget('combo', 'ckpt', 'sd15.safetensors', () => {}, {
      values: ['sd15.safetensors', 'sdxl.safetensors'],
    })
    this.setSize([GEOMETRY.nodeWidth, 120])
  }
}

export class SpikeTarget extends LGraphNode {
  static slot_start_y = SLOT_START_Y

  constructor(title: string) {
    super(title)
    this.addInput('MODEL', 'MODEL')
    this.addInput('CLIP', 'CLIP')
    this.setSize([GEOMETRY.nodeWidth, 120])
  }
}

let registered = false

export function registerSpikeNodes(): void {
  if (registered) return
  registered = true
  LiteGraph.registerNodeType('spike/Source', SpikeSource)
  LiteGraph.registerNodeType('spike/Target', SpikeTarget)
}
