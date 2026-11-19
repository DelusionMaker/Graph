import { create } from 'zustand'
import type { ImportIssue, WorkflowUI } from './workflow'

export interface ImportResult {
  ok: boolean
  issues: ImportIssue[]
}

/**
 * 图操作入口：由桥接层在挂载时注入实现，React 组件只依赖这里的方法签名，
 * 不直接接触 LGraph 实例（与"UI 不直接修改 LGraph"的约定一致）。
 */
export interface GraphActions {
  addNode: (type: string, pos?: [number, number]) => void
  setWidgetValue: (nodeId: number, index: number, value: unknown) => void
  /** 把视口中心移到指定图坐标（迷你地图导航用） */
  centerOn: (graphX: number, graphY: number) => void
  /** 选中节点并把视口中心移到它上面（错误定位用） */
  focusNode: (nodeId: number) => void
  /** 缩放到刚好容纳全部节点（载入工作流后使用） */
  fitView: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  exportWorkflow: () => WorkflowUI | null
  importWorkflow: (raw: unknown) => ImportResult
}

const noop = () => {}
const failedImport = (): ImportResult => ({
  ok: false,
  issues: [{ level: 1, message: '图尚未初始化' }],
})

export const defaultGraphActions: GraphActions = {
  addNode: noop,
  setWidgetValue: noop,
  centerOn: noop,
  focusNode: noop,
  fitView: noop,
  undo: noop,
  redo: noop,
  canUndo: false,
  canRedo: false,
  exportWorkflow: () => null,
  importWorkflow: failedImport,
}

export const useGraphActions = create<GraphActions>(() => ({ ...defaultGraphActions }))

export function resetGraphActions(): void {
  useGraphActions.setState({ ...defaultGraphActions })
}
