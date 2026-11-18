import { LiteGraph } from '@comfyorg/litegraph'

/**
 * 共享几何常量：React DOM 直接读取 LiteGraph 的运行时常量，
 * 这是"几何常量单一来源"原则的落地，而不是另写一份硬编码。
 */
export const SLOT_START_Y = LiteGraph.NODE_TITLE_HEIGHT

export const GEOMETRY = {
  titleHeight: LiteGraph.NODE_TITLE_HEIGHT,
  slotHeight: LiteGraph.NODE_SLOT_HEIGHT,
  nodeWidth: 220,
  slotRadius: 6,
} as const

/**
 * 输入端口圆心相对节点左上角的偏移。
 * 公式与 LiteGraph LGraphNode.getInputSlotPos 保持一致。
 */
export function inputSlotOffset(index: number): [number, number] {
  return [
    LiteGraph.NODE_SLOT_HEIGHT * 0.5,
    (index + 0.7) * LiteGraph.NODE_SLOT_HEIGHT + SLOT_START_Y,
  ]
}

/**
 * 输出端口圆心相对节点左上角的偏移。
 * 公式与 LiteGraph LGraphNode.getOutputPos 保持一致。
 */
export function outputSlotOffset(index: number, nodeWidth: number): [number, number] {
  return [
    nodeWidth + 1 - LiteGraph.NODE_SLOT_HEIGHT * 0.5,
    (index + 0.7) * LiteGraph.NODE_SLOT_HEIGHT + SLOT_START_Y,
  ]
}
