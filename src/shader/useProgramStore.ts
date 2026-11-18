import { create } from 'zustand'
import type { CompiledProgram } from './compiler'

export type ProgramStatus = 'idle' | 'dirty' | 'compiling' | 'ready' | 'error'

export interface ProgramError {
  nodeId?: number
  message: string
}

interface ProgramState {
  status: ProgramStatus
  program: CompiledProgram | null
  lastGoodProgram: CompiledProgram | null
  errors: ProgramError[]
  programHash: string
  /** 每次触发 +1，用于丢弃过期编译结果 */
  version: number
  setStatus: (status: ProgramStatus) => void
  setProgram: (program: CompiledProgram) => void
  setError: (errors: ProgramError[]) => void
  bumpVersion: () => number
}

/** 独立扁平 store：编译产物与节点图镜像解耦 */
export const useProgramStore = create<ProgramState>((set, get) => ({
  status: 'idle',
  program: null,
  lastGoodProgram: null,
  errors: [],
  programHash: '',
  version: 0,
  setStatus: (status) => set({ status }),
  setProgram: (program) =>
    set({
      status: 'ready',
      program,
      lastGoodProgram: program,
      programHash: program.hash,
      errors: [],
    }),
  // 编译失败时保留 program / lastGoodProgram，保证视口不闪屏
  setError: (errors) => set({ status: 'error', errors }),
  bumpVersion: () => {
    const version = get().version + 1
    set({ version })
    return version
  },
}))
