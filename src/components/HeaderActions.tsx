import { useRef } from 'react'
import { useGraphActions } from '../graph/actions'
import { useUiStore } from '../graph/uiStore'

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function HeaderActions() {
  const fileRef = useRef<HTMLInputElement>(null)
  const canUndo = useGraphActions((state) => state.canUndo)
  const canRedo = useGraphActions((state) => state.canRedo)
  const undo = useGraphActions((state) => state.undo)
  const redo = useGraphActions((state) => state.redo)
  const exportWorkflow = useGraphActions((state) => state.exportWorkflow)
  const exportPrompt = useGraphActions((state) => state.exportPrompt)
  const importWorkflow = useGraphActions((state) => state.importWorkflow)
  const theme = useUiStore((state) => state.theme)
  const toggleTheme = useUiStore((state) => state.toggleTheme)

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const result = importWorkflow(JSON.parse(await file.text()))
      if (!result.ok) {
        alert(`导入失败：\n${result.issues.map((issue) => issue.message).join('\n')}`)
      } else if (result.issues.length > 0) {
        alert(`导入完成，存在警告：\n${result.issues.map((issue) => issue.message).join('\n')}`)
      }
    } catch {
      alert('导入失败：文件不是合法的 JSON')
    }
  }

  return (
    <div className="header-actions">
      <button type="button" onClick={undo} disabled={!canUndo} title="Ctrl/Cmd + Z">
        撤销
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} title="Ctrl/Cmd + Shift + Z">
        重做
      </button>
      <span className="header-divider" />
      <button
        type="button"
        onClick={() => {
          const workflow = exportWorkflow()
          if (workflow) downloadJson('workflow.json', workflow)
        }}
      >
        导出工作流
      </button>
      <button
        type="button"
        onClick={() => {
          const prompt = exportPrompt()
          if (prompt) downloadJson('prompt.json', prompt)
        }}
      >
        导出执行格式
      </button>
      <button type="button" onClick={() => fileRef.current?.click()}>
        导入
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`切换到${theme === 'dark' ? '浅色' : '深色'}主题`}
      >
        {theme === 'dark' ? '浅色' : '深色'}
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleImport} />
    </div>
  )
}
