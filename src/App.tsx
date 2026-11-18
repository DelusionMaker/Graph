import { GraphCanvas } from './components/GraphCanvas'
import { StatusBar } from './components/StatusBar'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <strong>React + LiteGraph</strong>
        <span>阶段 1 · 画布基座</span>
      </header>
      <GraphCanvas />
      <StatusBar />
    </div>
  )
}
