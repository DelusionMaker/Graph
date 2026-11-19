import { create } from 'zustand'
import type {
  LinkSnapshot,
  NodeGeometryUpdate,
  NodeSnapshot,
  SelectionRect,
  Viewport,
} from './types'

interface GraphState {
  /** LiteGraph 的渲染镜像，唯一真相源仍是 LGraph */
  nodes: NodeSnapshot[]
  links: LinkSnapshot[]
  selectedIds: number[]
  viewport: Viewport
  /** 画布 DOM 尺寸（CSS 像素），供迷你地图等组件换算视口 */
  canvasSize: { w: number; h: number }
  selectionRect: SelectionRect | null
  setNodes: (nodes: NodeSnapshot[]) => void
  setLinks: (links: LinkSnapshot[]) => void
  setSelection: (ids: number[]) => void
  setSelectionRect: (rect: SelectionRect | null) => void
  setCanvasSize: (size: { w: number; h: number }) => void
  updateNodeGeometry: (updates: NodeGeometryUpdate[]) => void
  setViewport: (viewport: Viewport) => void
}

let viewportFrame = 0
let pendingViewport: Viewport | null = null

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  links: [],
  selectedIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  canvasSize: { w: 0, h: 0 },
  selectionRect: null,
  setNodes: (nodes) => set({ nodes }),
  setLinks: (links) => set({ links }),
  setSelection: (selectedIds) => set({ selectedIds }),
  setSelectionRect: (selectionRect) => set({ selectionRect }),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  // 拖动/缩放时只更新变化的节点，未变节点保持同一引用，配合 React.memo 避免全量重渲染
  updateNodeGeometry: (updates) =>
    set((state) => {
      if (!updates.length) return state
      const byId = new Map(updates.map((update) => [update.id, update]))
      let changed = false
      const nodes = state.nodes.map((node) => {
        const update = byId.get(node.id)
        if (!update) return node
        changed = true
        return {
          ...node,
          pos: update.pos,
          size: update.size,
          inputs: update.inputs ?? node.inputs,
          outputs: update.outputs ?? node.outputs,
        }
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
