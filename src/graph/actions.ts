import { create } from 'zustand'

/**
 * 图操作入口：由桥接层在挂载时注入实现，React 组件只依赖这里的方法签名，
 * 不直接接触 LGraph 实例（与"UI 不直接修改 LGraph"的约定一致）。
 */
export interface GraphActions {
  addNode: (type: string, pos?: [number, number]) => void
  setWidgetValue: (nodeId: number, index: number, value: unknown) => void
}

const noop = () => {}

export const useGraphActions = create<GraphActions>(() => ({
  addNode: noop,
  setWidgetValue: noop,
}))
