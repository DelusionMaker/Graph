import { LiteGraphCanvas } from './spike/LiteGraphCanvas'
import { NodeOverlay } from './spike/NodeOverlay'
import { SpikePanel } from './spike/SpikePanel'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <strong>React + LiteGraph Spike</strong>
        <span>阶段 0 · 共存可行性验证</span>
      </header>
      <div className="app-body">
        <aside className="spike-panel">
          <SpikePanel />
        </aside>
        <main className="canvas-area">
          <LiteGraphCanvas />
          <NodeOverlay />
        </main>
      </div>
    </div>
  )
}
