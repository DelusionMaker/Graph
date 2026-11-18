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

/** 框选提示框，单位为画布内 CSS 像素（屏幕空间，不随缩放变化） */
export interface SelectionRect {
  x: number
  y: number
  w: number
  h: number
}

export interface LinkSnapshot {
  id: number
  originId: number
  originSlot: number
  targetId: number
  targetSlot: number
  type: string
}
