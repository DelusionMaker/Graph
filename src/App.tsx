import { useEffect, useRef } from 'react'
import { GraphCanvas } from './components/GraphCanvas'
import { NodeLibrary } from './components/NodeLibrary'
import { StatusBar } from './components/StatusBar'
import { seedDemoGraph } from './graph/seed'
import { useLiteGraphBridge } from './graph/useLiteGraphBridge'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const context = useLiteGraphBridge(canvasRef)

  useEffect(() => {
    if (context) seedDemoGraph(context.graph)
  }, [context])

  return (
    <div className="app">
      <header className="app-header">
        <strong>React + LiteGraph</strong>
        <span>阶段 2 · 节点系统</span>
      </header>
      <div className="workspace">
        <NodeLibrary onAdd={(type) => context?.addNode(type)} />
        <GraphCanvas canvasRef={canvasRef} context={context} />
      </div>
      <StatusBar />
    </div>
  )
}
