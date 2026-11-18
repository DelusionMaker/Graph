import { useEffect, useRef } from 'react'
import { GraphCanvas } from './components/GraphCanvas'
import { HeaderActions } from './components/HeaderActions'
import { NodeLibrary } from './components/NodeLibrary'
import { SidePanel } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import { ToastStack } from './components/Toast'
import { ViewerDock } from './components/ViewerDock'
import { useUiStore } from './graph/uiStore'
import { useLiteGraphBridge } from './graph/useLiteGraphBridge'
import { useViewerStore } from './viewer/useViewerStore'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const context = useLiteGraphBridge(canvasRef)
  const theme = useUiStore((state) => state.theme)
  const dockOpen = useViewerStore((state) => state.dockOpen)
  const setDockOpen = useViewerStore((state) => state.setDockOpen)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="app">
      <header className="app-header">
        <strong>React + LiteGraph</strong>
        <span>阶段 4 · 视觉与完善</span>
        <button
          type="button"
          className="dock-trigger"
          aria-expanded={dockOpen}
          onClick={() => setDockOpen(!dockOpen)}
        >
          3D 面板
        </button>
        <HeaderActions />
      </header>
      <div className="workspace">
        <ViewerDock>
          <NodeLibrary onAdd={(type) => context?.addNode(type)} />
        </ViewerDock>
        <GraphCanvas canvasRef={canvasRef} context={context} />
        <SidePanel context={context} />
      </div>
      <StatusBar />
      <ToastStack />
    </div>
  )
}
