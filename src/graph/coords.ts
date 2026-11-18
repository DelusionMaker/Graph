import type { LGraphCanvas } from '@comfyorg/litegraph'
import type { Viewport } from './types'

type Tuple = [number, number]

/** 与 DOMRect 同形的只读矩形，便于在测试中传入假数据 */
export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 坐标换算的唯一入口。
 *
 * 约定：屏幕（client）坐标 = (图坐标 + offset) * zoom。
 * - 拿到 canvas 实例的路径（桥接层、测量、拖放）走 `graphToScreen` / `screenToGraph`，
 *   内部直接调用 LiteGraph 的 `DragAndScale`，不复刻公式；
 * - 拿不到 canvas 的纯 React 路径（覆盖层 CSS、迷你地图投影）走 `graphToCanvas` /
 *   `canvasToGraph` / `overlayTransform`，公式只在本文件出现一次。
 */

/** 从 LiteGraph 画布读取当前视口（ds 是画布视口的唯一真相源） */
export function readViewport(canvas: LGraphCanvas): Viewport {
  const { scale, offset } = canvas.ds
  return { x: offset[0], y: offset[1], zoom: scale }
}

/** 纯换算：图坐标 → 画布内 CSS 坐标 */
export function graphToCanvas(viewport: Viewport, x: number, y: number): Tuple {
  return [(x + viewport.x) * viewport.zoom, (y + viewport.y) * viewport.zoom]
}

/** 纯换算：画布内 CSS 坐标 → 图坐标 */
export function canvasToGraph(viewport: Viewport, x: number, y: number): Tuple {
  return [x / viewport.zoom - viewport.x, y / viewport.zoom - viewport.y]
}

/** 权威换算：图坐标 → 画布内 CSS 坐标（复用 LiteGraph） */
export function graphToCanvasPoint(canvas: LGraphCanvas, x: number, y: number): Tuple {
  return canvas.ds.convertOffsetToCanvas([x, y]) as Tuple
}

/** 权威换算：画布内 CSS 坐标 → 图坐标（复用 LiteGraph） */
export function canvasPointToGraph(canvas: LGraphCanvas, x: number, y: number): Tuple {
  return canvas.convertCanvasToOffset([x, y]) as Tuple
}

/** 屏幕（client）坐标 → 图坐标 */
export function screenToGraph(canvas: LGraphCanvas, clientX: number, clientY: number): Tuple {
  const rect = canvas.canvas.getBoundingClientRect()
  return canvasPointToGraph(canvas, clientX - rect.left, clientY - rect.top)
}

/** 图坐标 → 屏幕（client）坐标 */
export function graphToScreen(canvas: LGraphCanvas, x: number, y: number): Tuple {
  const rect = canvas.canvas.getBoundingClientRect()
  const [cx, cy] = graphToCanvasPoint(canvas, x, y)
  return [rect.left + cx, rect.top + cy]
}

/**
 * React 节点覆盖层的 CSS transform。
 * 必须写成 scale() 再 translate()：CSS 函数从右往左作用，
 * 等价于 LiteGraph 的 toCanvasContext()——先 translate(offset) 再 scale()。
 * 写成 translate() scale() 时 offset 不参与缩放，缩放后节点会与连线错位。
 */
export function overlayTransform(viewport: Viewport): string {
  return `scale(${viewport.zoom}) translate(${viewport.x}px, ${viewport.y}px)`
}

/** 让指定图坐标落在画布中心所需的 ds.offset */
export function centerOffset(
  viewport: Viewport,
  graphX: number,
  graphY: number,
  width: number,
  height: number,
): Tuple {
  return [width / (2 * viewport.zoom) - graphX, height / (2 * viewport.zoom) - graphY]
}

/** 当前视口在图坐标中的矩形（迷你地图投影用） */
export function viewportGraphRect(
  viewport: Viewport,
  canvasSize: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  return {
    x: -viewport.x,
    y: -viewport.y,
    w: canvasSize.w / viewport.zoom,
    h: canvasSize.h / viewport.zoom,
  }
}
