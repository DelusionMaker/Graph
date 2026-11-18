import { useGraphStore } from '../graph/store'

/** 框选提示框：React 绘制，保证在高 DPI 与节点覆盖层之上都显示正确 */
export function SelectionBox() {
  const rect = useGraphStore((s) => s.selectionRect)
  if (!rect) return null

  return (
    <div
      className="selection-box"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  )
}
