import { useEffect, useRef } from 'react'
import { GraphCanvas } from './components/GraphCanvas'
import { HeaderActions } from './components/HeaderActions'
import { NodeLibrary } from './components/NodeLibrary'
import { SidePanel } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import { ToastStack } from './components/Toast'
import { useUiStore } from './graph/uiStore'
import { useLiteGraphBridge } from './graph/useLiteGraphBridge'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const context = useLiteGraphBridge(canvasRef)
  const theme = useUiStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="app">
      <header className="app-header">
        <strong>React + LiteGraph</strong>
        <span>阶段 4 · 视觉与完善</span>
        <HeaderActions />
      </header>
      <div className="workspace">
        <NodeLibrary onAdd={(type) => context?.addNode(type)} />
        <GraphCanvas canvasRef={canvasRef} context={context} />
        <SidePanel context={context} />
      </div>
      <StatusBar />
      <ToastStack />
    </div>
  )
}
