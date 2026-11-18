import type { LGraph, LGraphCanvas } from '@comfyorg/litegraph'
import { useGraphActions } from './actions'
import {
  measureNativeDrawing,
  measureNodeBoxes,
  measurePorts,
  type BoxMeasurement,
  type NativeMeasurement,
  type PortMeasurement,
} from './measure'
import { writePersistedWorkflow } from './persistence'
import { graphToWorkflow } from './serialize'
import { toPromptAPI, type ImportIssue, type PromptAPI, type WorkflowUI } from './workflow'

/**
 * 开发期调试接口：只用于手动排查与 E2E 脚本。
 * 生产构建里由调用方通过 import.meta.env.DEV 决定是否挂载。
 */
export interface GraphDebugApi {
  graph: LGraph
  canvas: LGraphCanvas
  /** 直接设置视口（scale + offset），用于脚本复现缩放/平移 */
  setView: (scale: number, x: number, y: number) => void
  measurePorts: () => PortMeasurement[]
  measureNodeBoxes: () => BoxMeasurement[]
  measureNativeDrawing: () => NativeMeasurement | null
  exportWorkflow: () => WorkflowUI
  exportPrompt: () => PromptAPI
  importWorkflow: (raw: unknown) => { ok: boolean; issues: ImportIssue[] }
  undo: () => void
  redo: () => void
  historyState: () => { canUndo: boolean; canRedo: boolean }
  /** 立即写入 localStorage，跳过 1s 防抖（仅测试使用） */
  saveNow: () => void
}

declare global {
  interface Window {
    __graphDebug?: GraphDebugApi
  }
}

export function attachDebugApi(graph: LGraph, canvas: LGraphCanvas): () => void {
  const api: GraphDebugApi = {
    graph,
    canvas,
    setView: (scale, x, y) => {
      canvas.ds.scale = scale
      canvas.ds.offset = [x, y]
      canvas.ds.onChanged?.(canvas.ds.scale, canvas.ds.offset)
      canvas.setDirty(true, true)
      canvas.draw(true, true)
    },
    measurePorts: () => measurePorts(graph, canvas),
    measureNodeBoxes: () => measureNodeBoxes(graph, canvas),
    measureNativeDrawing: () => measureNativeDrawing(graph, canvas),
    exportWorkflow: () => graphToWorkflow(graph),
    exportPrompt: () => toPromptAPI(graphToWorkflow(graph)),
    importWorkflow: (raw) => useGraphActions.getState().importWorkflow(raw),
    undo: () => useGraphActions.getState().undo(),
    redo: () => useGraphActions.getState().redo(),
    historyState: () => {
      const state = useGraphActions.getState()
      return { canUndo: state.canUndo, canRedo: state.canRedo }
    },
    saveNow: () => writePersistedWorkflow(graphToWorkflow(graph)),
  }

  window.__graphDebug = api
  return () => {
    if (window.__graphDebug === api) delete window.__graphDebug
  }
}
