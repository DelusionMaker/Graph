import { useGraphStore } from '../graph/store'

export function StatusBar() {
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const linkCount = useGraphStore((s) => s.links.length)
  const selectedCount = useGraphStore((s) => s.selectedIds.length)
  const zoom = useGraphStore((s) => s.viewport.zoom)

  return (
    <footer className="status-bar">
      <span>节点 {nodeCount}</span>
      <span>连线 {linkCount}</span>
      <span>选中 {selectedCount}</span>
      <span>缩放 {(zoom * 100).toFixed(0)}%</span>
      <span className="status-hint">
        滚轮缩放 · 中键平移 · 空白框选 · 点击连线后 Delete 删除 · Ctrl/⌘+Z 撤销
      </span>
    </footer>
  )
}
