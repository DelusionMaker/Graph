import { create } from 'zustand'
import type { LinkSnapshot, NodeSnapshot, SelectionRect, Viewport } from './types'

interface GraphState {
  /** LiteGraph 的渲染镜像，唯一真相源仍是 LGraph */
  nodes: NodeSnapshot[]
  links: LinkSnapshot[]
  selectedIds: number[]
  viewport: Viewport
  selectionRect: SelectionRect | null
  setNodes: (nodes: NodeSnapshot[]) => void
  setLinks: (links: LinkSnapshot[]) => void
  setSelection: (ids: number[]) => void
  setSelectionRect: (rect: SelectionRect | null) => void
  updateNodePositions: (positions: Map<number, [number, number]>) => void
  setViewport: (viewport: Viewport) => void
}

let viewportFrame = 0
let pendingViewport: Viewport | null = null

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  links: [],
  selectedIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectionRect: null,
  setNodes: (nodes) => set({ nodes }),
  setLinks: (links) => set({ links }),
  setSelection: (selectedIds) => set({ selectedIds }),
  setSelectionRect: (selectionRect) => set({ selectionRect }),
  // 拖动时只更新位置变化的节点，未变节点保持同一引用，配合 React.memo 避免全量重渲染
  updateNodePositions: (positions) =>
    set((state) => {
      let changed = false
      const nodes = state.nodes.map((node) => {
        const next = positions.get(node.id)
        if (!next || (node.pos[0] === next[0] && node.pos[1] === next[1])) return node
        changed = true
        return { ...node, pos: next }
      })
      return changed ? { nodes } : state
    }),
  // 视口高频更新用 rAF 合并，避免平移/缩放时每帧触发 React commit
  setViewport: (viewport) => {
    pendingViewport = viewport
    if (viewportFrame) return
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = 0
      if (pendingViewport) set({ viewport: pendingViewport })
      pendingViewport = null
    })
  },
}))
