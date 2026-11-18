import { useGraphActions } from '../graph/actions'
import { compileWorkflow, CompileError, refreshProgram } from './compiler'
import { computeSignature } from './signature'
import { useProgramStore } from './useProgramStore'

const DEBOUNCE_MS = 120

let timer: ReturnType<typeof setTimeout> | null = null

/**
 * 数据失效 → 编译。
 *
 * - 120ms 防抖，合并一次操作里的多次 commit；
 * - 签名不变时只刷新 uniform / mesh / environment / 后处理参数，不重编译；
 * - 编译失败保留 lastGoodProgram，错误写入 store；
 * - version token 保证过期结果不会写回。
 */
export function invalidateProgram(options?: { immediate?: boolean }): void {
  const store = useProgramStore.getState()
  store.setStatus('dirty')
  const version = store.bumpVersion()

  if (timer) {
    clearTimeout(timer)
    timer = null
  }

  const run = () => {
    timer = null
    if (useProgramStore.getState().version !== version) return

    const workflow = useGraphActions.getState().exportWorkflow()
    if (!workflow) return

    const signature = computeSignature(workflow)
    const state = useProgramStore.getState()

    if (state.lastGoodProgram && state.lastGoodProgram.hash === signature) {
      state.setProgram(refreshProgram(workflow, state.lastGoodProgram))
      return
    }

    state.setStatus('compiling')
    try {
      const program = compileWorkflow(workflow)
      if (useProgramStore.getState().version !== version) return
      useProgramStore.getState().setProgram({ ...program, version })
    } catch (error) {
      if (useProgramStore.getState().version !== version) return
      const message = error instanceof Error ? error.message : String(error)
      useProgramStore.getState().setError([
        { nodeId: error instanceof CompileError ? error.nodeId : undefined, message },
      ])
    }
  }

  if (options?.immediate) run()
  else timer = setTimeout(run, DEBOUNCE_MS)
}

/** 卸载或测试收尾时清理防抖定时器 */
export function cancelProgramCompile(): void {
  if (!timer) return
  clearTimeout(timer)
  timer = null
}
