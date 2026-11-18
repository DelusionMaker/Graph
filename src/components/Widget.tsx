import { useGraphActions } from '../graph/actions'
import type { WidgetSnapshot } from '../graph/types'

interface Props {
  nodeId: number
  widget: WidgetSnapshot
  /** Inspector 里可显示中文标签；画布节点上仍用原始 widget 名 */
  label?: string
}

export function Widget({ nodeId, widget, label }: Props) {
  const setWidgetValue = useGraphActions((state) => state.setWidgetValue)
  const update = (value: unknown) => setWidgetValue(nodeId, widget.index, value)

  return (
    <div className="graph-widget" data-widget-name={widget.name}>
      <span className="graph-widget-label" title={widget.name}>
        {label ?? widget.name}
      </span>
      <WidgetControl widget={widget} onChange={update} />
    </div>
  )
}

function WidgetControl({ widget, onChange }: { widget: WidgetSnapshot; onChange: (value: unknown) => void }) {
  switch (widget.kind) {
    case 'combo':
      return (
        <select
          className="graph-widget-select"
          aria-label={widget.name}
          value={String(widget.value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {(widget.values ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case 'number':
      return (
        <input
          className="graph-widget-number"
          type="number"
          aria-label={widget.name}
          value={Number(widget.value)}
          min={widget.min}
          max={widget.max}
          step={widget.step ?? 1}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )
    case 'slider':
      return (
        <span className="graph-widget-slider">
          <input
            type="range"
            aria-label={widget.name}
            value={Number(widget.value)}
            min={widget.min ?? 0}
            max={widget.max ?? 1}
            step={widget.step ?? 0.01}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <span className="graph-widget-value">{Number(widget.value).toFixed(2)}</span>
        </span>
      )
    case 'boolean':
      return (
        <input
          className="graph-widget-toggle"
          type="checkbox"
          aria-label={widget.name}
          checked={Boolean(widget.value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      )
    default:
      return (
        <input
          className="graph-widget-text"
          type="text"
          aria-label={widget.name}
          value={String(widget.value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}
