import { create } from 'zustand'

export type ToastKind = 'info' | 'error'

export interface ToastMessage {
  id: number
  text: string
  kind: ToastKind
}

interface ToastState {
  toasts: ToastMessage[]
  show: (text: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let nextId = 1

/** 轻量提示：用于连接被拒、导入结果等即时反馈 */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (text, kind = 'info') => {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, text, kind }] }))
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    }, 3200)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
