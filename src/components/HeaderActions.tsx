import { useRef } from 'react'
import { useGraphActions } from '../graph/actions'
import { SAMPLE_WORKFLOW } from '../graph/samples'
import { useToastStore } from '../graph/toastStore'
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
  const fitView = useGraphActions((state) => state.fitView)
  const theme = useUiStore((state) => state.theme)
  const toggleTheme = useUiStore((state) => state.toggleTheme)
  const showToast = useToastStore((state) => state.show)

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const result = importWorkflow(JSON.parse(await file.text()))
      if (!result.ok) {
        const first = result.issues[0]?.message ?? '未知错误'
        showToast(`导入失败：${first}`, 'error')
      } else if (result.issues.length > 0) {
        showToast(`导入完成，${result.issues.length} 条数据被修正`, 'info')
        fitView()
      } else {
        showToast('导入成功', 'info')
        fitView()
      }
    } catch {
      showToast('导入失败：文件不是合法的 JSON', 'error')
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
      <button
        type="button"
        onClick={() => {
          const result = importWorkflow(SAMPLE_WORKFLOW)
          if (result.ok) fitView()
          showToast(result.ok ? '已载入示例工作流' : '示例工作流加载失败', result.ok ? 'info' : 'error')
        }}
      >
        载入示例
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
