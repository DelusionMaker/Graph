import { useMemo, useState } from 'react'
import { searchNodeDefinitions, type NodeDefinition } from '../graph/nodeRegistry'

interface Props {
  onAdd: (type: string) => void
}

export const NODE_DRAG_MIME = 'application/x-graph-node'

export function NodeLibrary({ onAdd }: Props) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => searchNodeDefinitions(query), [query])

  return (
    <aside className="node-library">
      <div className="node-library-head">
        <h2>节点库</h2>
        <input
          className="node-library-search"
          type="search"
          placeholder="搜索节点"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="node-library-list">
        {groups.map((group) => (
          <section key={group.category} className="node-library-group">
            <h3>{group.category}</h3>
            {group.nodes.map((definition) => (
              <LibraryItem key={definition.type} definition={definition} onAdd={onAdd} />
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className="node-library-empty">没有匹配的节点</p>}
      </div>
    </aside>
  )
}

function LibraryItem({ definition, onAdd }: { definition: NodeDefinition; onAdd: (type: string) => void }) {
  return (
    <button
      type="button"
      className="node-library-item"
      title={definition.description}
      draggable
      onClick={() => onAdd(definition.type)}
      onDragStart={(event) => {
        event.dataTransfer.setData(NODE_DRAG_MIME, definition.type)
        event.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <span className="node-library-title">{definition.title}</span>
      <span className="node-library-desc">{definition.description}</span>
    </button>
  )
}
