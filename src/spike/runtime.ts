import type { LGraph, LGraphCanvas } from '@comfyorg/litegraph'

/** Spike 专用：把运行中的图与画布暴露给验证面板做几何测量。 */
export const runtime: {
  graph: LGraph | null
  canvas: LGraphCanvas | null
} = {
  graph: null,
  canvas: null,
}
