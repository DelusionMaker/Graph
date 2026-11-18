import { create } from 'zustand'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'node-editor:theme'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // 隐私模式下读取失败，走系统偏好
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

interface UiState {
  theme: Theme
  toggleTheme: () => void
}

export const useUiStore = create<UiState>((set) => ({
  theme: initialTheme(),
  toggleTheme: () =>
    set((state) => {
      const theme: Theme = state.theme === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_KEY, theme)
      } catch {
        // 忽略持久化失败
      }
      return { theme }
    }),
}))
