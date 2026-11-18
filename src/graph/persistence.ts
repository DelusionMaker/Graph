import type { WorkflowUI } from './workflow'

export const STORAGE_KEY = 'node-editor:workflow:v1'

/** 读取本地持久化工作流；数据损坏时返回 null，由调用方回退到示例图 */
export function readPersistedWorkflow(): unknown | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writePersistedWorkflow(workflow: WorkflowUI): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow))
  } catch {
    // 容量超限 / 隐私模式：自动保存失败不应影响编辑
  }
}

export function clearPersistedWorkflow(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}
