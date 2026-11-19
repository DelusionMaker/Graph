import { useState } from 'react'
import type { GraphContext } from '../graph/useLiteGraphBridge'
import { DevPanel } from './DevPanel'
import { InspectorPanel } from './InspectorPanel'

type Tab = 'inspector' | 'dev'

export function SidePanel({ context }: { context: GraphContext | null }) {
  const [tab, setTab] = useState<Tab>('inspector')
  const showDev = import.meta.env.DEV && context !== null

  return (
    <aside className="side-panel">
      <div className="side-tabs" role="tablist" aria-label="右侧面板">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inspector'}
          className={tab === 'inspector' ? 'is-active' : ''}
          onClick={() => setTab('inspector')}
        >
          检查器
        </button>
        {showDev && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'dev'}
            className={tab === 'dev' ? 'is-active' : ''}
            onClick={() => setTab('dev')}
          >
            开发验证
          </button>
        )}
      </div>
      <div className="side-body">
        {tab === 'dev' && context ? <DevPanel context={context} /> : <InspectorPanel />}
      </div>
    </aside>
  )
}
