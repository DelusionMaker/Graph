import { useRef } from 'react'
import { GraphCanvas } from './components/GraphCanvas'
import { HeaderActions } from './components/HeaderActions'
import { NodeLibrary } from './components/NodeLibrary'
import { StatusBar } from './components/StatusBar'
import { useLiteGraphBridge } from './graph/useLiteGraphBridge'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const context = useLiteGraphBridge(canvasRef)

  return (
    <div className="app">
      <header className="app-header">
        <strong>React + LiteGraph</strong>
        <span>阶段 3 · 数据与状态</span>
        <HeaderActions />
      </header>
      <div className="workspace">
        <NodeLibrary onAdd={(type) => context?.addNode(type)} />
        <GraphCanvas canvasRef={canvasRef} context={context} />
      </div>
      <StatusBar />
    </div>
  )
}
