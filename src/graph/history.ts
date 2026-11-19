export interface HistoryOptions {
  /** 历史栈上限，超出丢弃最早记录 */
  limit?: number
  /** 合并窗口：窗口内的高频操作（如连续调参）只保留一条记录 */
  coalesceWindowMs?: number
  /** 便于测试注入时钟 */
  now?: () => number
}

/**
 * 快照式撤销/重做：每条记录是一份 UI 工作流的 JSON 字符串。
 * 结构简单、恢复可靠，代价是每步都要序列化整个图——在阶段 3 的图规模下可接受。
 */
export class SnapshotHistory {
  private entries: string[] = []
  private index = -1
  private readonly limit: number
  private readonly coalesceWindowMs: number
  private readonly now: () => number
  private lastPushAt = 0
  private lastCoalesce = false

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 50
    this.coalesceWindowMs = options.coalesceWindowMs ?? 600
    this.now = options.now ?? Date.now
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1
  }

  get size(): number {
    return this.entries.length
  }

  current(): string | null {
    return this.entries[this.index] ?? null
  }

  reset(snapshot?: string): void {
    this.entries = snapshot === undefined ? [] : [snapshot]
    this.index = this.entries.length - 1
    this.lastPushAt = 0
    this.lastCoalesce = false
  }

  /** 返回是否写入；与当前快照相同则忽略（例如仅选中节点也会触发提交） */
  push(snapshot: string, options: { coalesce?: boolean } = {}): boolean {
    if (this.entries[this.index] === snapshot) return false

    const now = this.now()
    const coalesce = options.coalesce === true
    // 只合并"连续同类"的高频操作：一次拖拽不会并进前一次调参
    if (
      coalesce &&
      this.lastCoalesce &&
      this.index >= 0 &&
      now - this.lastPushAt < this.coalesceWindowMs
    ) {
      this.entries[this.index] = snapshot
      this.lastPushAt = now
      return true
    }

    if (this.index < this.entries.length - 1) this.entries.splice(this.index + 1)
    this.entries.push(snapshot)
    if (this.entries.length > this.limit) this.entries.shift()
    this.index = this.entries.length - 1
    this.lastPushAt = now
    this.lastCoalesce = coalesce
    return true
  }

  undo(): string | null {
    if (!this.canUndo) return null
    this.index--
    this.lastPushAt = 0
    this.lastCoalesce = false
    return this.entries[this.index]
  }

  redo(): string | null {
    if (!this.canRedo) return null
    this.index++
    this.lastPushAt = 0
    this.lastCoalesce = false
    return this.entries[this.index]
  }
}
