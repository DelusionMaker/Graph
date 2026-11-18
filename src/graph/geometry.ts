import { LiteGraph } from '@comfyorg/litegraph'

/**
 * 共享几何常量的唯一来源：全部从 LiteGraph 运行时读取。
 *
 * 端口圆心坐标不在这里推导，而是同步时直接取
 * `node.getInputPos(i)` / `node.getOutputPos(i)` 减去 `node.pos`，
 * 即 LiteGraph 自己用于绘制的坐标，避免"公式对齐、实际差 1px"的隐性错位。
 */
export const SLOT_START_Y = LiteGraph.NODE_TITLE_HEIGHT

export const GEOMETRY = {
  titleHeight: LiteGraph.NODE_TITLE_HEIGHT,
  slotHeight: LiteGraph.NODE_SLOT_HEIGHT,
  nodeWidth: 220,
  nodeHeight: 120,
  /** 端口圆点半径（纯 React 视觉尺寸，LiteGraph 自身命中区为 NODE_SLOT_HEIGHT） */
  slotRadius: 6,
} as const
