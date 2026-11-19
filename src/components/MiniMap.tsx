import { useGraphActions } from '../graph/actions'
import { viewportGraphRect } from '../graph/coords'
import { useGraphStore } from '../graph/store'

const WIDTH = 200
const HEIGHT = 130
const PADDING = 80
/** 地图内容的最小跨度，避免只放一两个节点时被放大到失真 */
const MIN_SPAN_X = 1200
const MIN_SPAN_Y = 800

/** 迷你地图：展示节点分布与当前视口，点击可把视口中心移过去 */
export function MiniMap() {
  const nodes = useGraphStore((state) => state.nodes)
  const viewport = useGraphStore((state) => state.viewport)
  const canvasSize = useGraphStore((state) => state.canvasSize)
  const centerOn = useGraphActions((state) => state.centerOn)

  if (!nodes.length || canvasSize.w === 0 || canvasSize.h === 0) return null

  const { x: viewX, y: viewY, w: viewW, h: viewH } = viewportGraphRect(viewport, canvasSize)

  // 地图边界只由节点决定（不并入视口），否则点击移动视口后投影会重新缩放，
  // 表现为地图内容整体跳动、点击落点漂移。
  let minX = Math.min(...nodes.map((node) => node.pos[0])) - PADDING
  let minY = Math.min(...nodes.map((node) => node.pos[1])) - PADDING
  let maxX = Math.max(...nodes.map((node) => node.pos[0] + node.size[0])) + PADDING
  let maxY = Math.max(...nodes.map((node) => node.pos[1] + node.size[1])) + PADDING

  // 跨度过小时按最小跨度居中扩展，保证比例稳定
  if (maxX - minX < MIN_SPAN_X) {
    const extra = (MIN_SPAN_X - (maxX - minX)) / 2
    minX -= extra
    maxX += extra
  }
  if (maxY - minY < MIN_SPAN_Y) {
    const extra = (MIN_SPAN_Y - (maxY - minY)) / 2
    minY -= extra
    maxY += extra
  }

  const scale = Math.min(WIDTH / (maxX - minX), HEIGHT / (maxY - minY))
  const offsetX = (WIDTH - (maxX - minX) * scale) / 2
  const offsetY = (HEIGHT - (maxY - minY) * scale) / 2
  const project = (x: number, y: number) =>
    [offsetX + (x - minX) * scale, offsetY + (y - minY) * scale] as const

  const [viewportX, viewportY] = project(viewX, viewY)

  return (
    <div
      className="minimap"
      style={{ width: WIDTH, height: HEIGHT }}
      role="img"
      aria-label={`迷你地图，共 ${nodes.length} 个节点`}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const rect = event.currentTarget.getBoundingClientRect()
        // 绝对定位子元素的坐标原点是 padding box，需要扣掉边框宽度
        const localX = event.clientX - rect.left - event.currentTarget.clientLeft
        const localY = event.clientY - rect.top - event.currentTarget.clientTop
        centerOn(minX + (localX - offsetX) / scale, minY + (localY - offsetY) / scale)
      }}
    >
      {nodes.map((node) => {
        const [x, y] = project(node.pos[0], node.pos[1])
        return (
          <span
            key={node.id}
            className="minimap-node"
            style={{
              left: x,
              top: y,
              width: Math.max(3, node.size[0] * scale),
              height: Math.max(2, node.size[1] * scale),
            }}
          />
        )
      })}
      <span
        className="minimap-viewport"
        style={{
          left: viewportX,
          top: viewportY,
          width: Math.max(4, viewW * scale),
          height: Math.max(4, viewH * scale),
        }}
      />
    </div>
  )
}
