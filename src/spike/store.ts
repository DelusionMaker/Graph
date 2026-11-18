import { create } from 'zustand'
import type { NodeSnapshot, Viewport } from './types'

interface GraphState {
  nodes: NodeSnapshot[]
  viewport: Viewport
  selectedIds: number[]
  linkCount: number
  setNodes: (nodes: NodeSnapshot[]) => void
  updateNodePositions: (positions: Map<number, [number, number]>) => void
  setViewport: (v: Viewport) => void
  setSelected: (ids: number[]) => void
  setLinkCount: (n: number) => void
}

let viewportFrame = 0
let pendingViewport: Viewport | null = null

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedIds: [],
  linkCount: 0,
  setNodes: (nodes) => set({ nodes }),
  // 拖动时只更新位置变化的节点，未变节点保持同一引用，配合 React.memo 避免全量重渲染
  updateNodePositions: (positions) =>
    set((state) => {
      let changed = false
      const nodes = state.nodes.map((n) => {
        const p = positions.get(n.id)
        if (!p || (n.pos[0] === p[0] && n.pos[1] === p[1])) return n
        changed = true
        return { ...n, pos: p }
      })
      return changed ? { nodes } : state
    }),
  // 视口高频更新用 rAF 合并，避免平移时每帧触发 React commit
  setViewport: (v) => {
    pendingViewport = v
    if (viewportFrame) return
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = 0
      if (pendingViewport) set({ viewport: pendingViewport })
      pendingViewport = null
    })
  },
  setSelected: (selectedIds) => set({ selectedIds }),
  setLinkCount: (linkCount) => set({ linkCount }),
}))
