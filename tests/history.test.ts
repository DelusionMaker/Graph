import { describe, expect, it } from 'vitest'
import { SnapshotHistory } from '../src/graph/history'

describe('SnapshotHistory', () => {
  it('初始状态不可撤销，push 后可撤销', () => {
    const history = new SnapshotHistory({ limit: 10 })
    expect(history.canUndo).toBe(false)
    history.push('a')
    history.push('b')
    expect(history.canUndo).toBe(true)
    expect(history.undo()).toBe('a')
    expect(history.canRedo).toBe(true)
    expect(history.redo()).toBe('b')
  })

  it('与当前快照相同的 push 会被忽略', () => {
    const history = new SnapshotHistory()
    history.push('a')
    expect(history.push('a')).toBe(false)
    expect(history.size).toBe(1)
  })

  it('撤销后新的 push 会截断 redo 分支', () => {
    const history = new SnapshotHistory()
    history.push('a')
    history.push('b')
    history.undo()
    history.push('c')
    expect(history.canRedo).toBe(false)
    expect(history.current()).toBe('c')
  })

  it('超过上限时丢弃最早记录', () => {
    const history = new SnapshotHistory({ limit: 3 })
    for (const snapshot of ['a', 'b', 'c', 'd']) history.push(snapshot)
    expect(history.size).toBe(3)
    expect(history.current()).toBe('d')
    expect(history.undo()).toBe('c')
    expect(history.undo()).toBe('b')
    expect(history.canUndo).toBe(false)
  })

  it('连续的合并操作在窗口内只保留一条', () => {
    let now = 0
    const history = new SnapshotHistory({ coalesceWindowMs: 600, now: () => now })
    history.push('a')
    history.push('w1', { coalesce: true })
    now = 100
    history.push('w2', { coalesce: true })
    expect(history.size).toBe(2)
    expect(history.current()).toBe('w2')
    expect(history.undo()).toBe('a')
  })

  it('窗口外或非合并操作不会并入上一条', () => {
    let now = 0
    const history = new SnapshotHistory({ coalesceWindowMs: 600, now: () => now })
    history.push('a')
    history.push('w1', { coalesce: true })
    now = 1000
    history.push('w2', { coalesce: true })
    expect(history.size).toBe(3)

    now = 1100
    history.push('drag', { coalesce: false })
    history.push('widget', { coalesce: true })
    expect(history.size).toBe(5)
    expect(history.current()).toBe('widget')
    expect(history.undo()).toBe('drag')
  })
})
