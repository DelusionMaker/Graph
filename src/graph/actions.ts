import { create } from 'zustand'
import type { ImportIssue, PromptAPI, WorkflowUI } from './workflow'

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
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  exportWorkflow: () => WorkflowUI | null
  exportPrompt: () => PromptAPI | null
  importWorkflow: (raw: unknown) => ImportResult
}

const noop = () => {}
const failedImport = (): ImportResult => ({ ok: false, issues: [{ level: 1, message: '图尚未初始化' }] })

export const defaultGraphActions: GraphActions = {
  addNode: noop,
  setWidgetValue: noop,
  undo: noop,
  redo: noop,
  canUndo: false,
  canRedo: false,
  exportWorkflow: () => null,
  exportPrompt: () => null,
  importWorkflow: failedImport,
}

export const useGraphActions = create<GraphActions>(() => ({ ...defaultGraphActions }))

export function resetGraphActions(): void {
  useGraphActions.setState({ ...defaultGraphActions })
}
