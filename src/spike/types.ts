export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface PortSnapshot {
  index: number
  name: string
  type: string
  connected: boolean
  /** 端口圆心相对节点左上角的偏移，直接取自 LiteGraph 的 getInputPos / getOutputPos */
  offset: [number, number]
}

export interface NodeSnapshot {
  id: number
  type: string
  title: string
  pos: [number, number]
  size: [number, number]
  inputs: PortSnapshot[]
  outputs: PortSnapshot[]
}
