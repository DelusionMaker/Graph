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
