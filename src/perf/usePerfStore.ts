import { create } from 'zustand'

export interface PerfMetrics {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
}

interface PerfState extends PerfMetrics {
  setMetrics: (metrics: PerfMetrics) => void
}

/** 独立 store：4Hz 采样写入，避免与节点图状态互相触发重渲染 */
export const usePerfStore = create<PerfState>((set) => ({
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  setMetrics: (metrics) => set(metrics),
}))
