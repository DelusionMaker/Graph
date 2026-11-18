import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createModelUrl } from '../viewer/assets'
import { useViewerStore } from '../viewer/useViewerStore'
import { Viewport3D } from '../viewer/Viewport3D'

const MIN_TOP = 40
const MAX_TOP = 82
const PRIMITIVES = ['box', 'sphere', 'torusknot'] as const

const PRIMITIVE_LABELS: Record<(typeof PRIMITIVES)[number], string> = {
  box: 'Box',
  sphere: 'Sphere',
  torusknot: 'Knot',
}

/** 左栏：上半 3D 视口 + 下半节点库，中间可拖拽分隔条 */
export function ViewerDock({ children }: { children: ReactNode }) {
  const [topPercent, setTopPercent] = useState(60)
  // < 1400px 默认折叠节点库；之后由用户手动控制
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1399px)').matches)
  const shape = useViewerStore((state) => state.shape)
  const setShape = useViewerStore((state) => state.setShape)
  const setGltf = useViewerStore((state) => state.setGltf)
  const perfMode = useViewerStore((state) => state.perfMode)
  const setPerfMode = useViewerStore((state) => state.setPerfMode)
  const dockOpen = useViewerStore((state) => state.dockOpen)
  const dockRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSeparatorDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dock = dockRef.current
    if (!dock) return
    event.preventDefault()
    const rect = dock.getBoundingClientRect()
    const onMove = (moveEvent: PointerEvent) => {
      const percent = ((moveEvent.clientY - rect.top) / rect.height) * 100
      setTopPercent(Math.min(MAX_TOP, Math.max(MIN_TOP, percent)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('is-resizing-dock')
    }
    document.body.classList.add('is-resizing-dock')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setGltf(createModelUrl(file), file.name)
  }

  return (
    <section
      ref={dockRef}
      className={`viewer-dock${dockOpen ? ' is-open' : ''}`}
      aria-label="3D 预览与节点库"
    >
      <div
        className="viewer-dock-viewport"
        style={{ flex: collapsed ? '1 1 auto' : `0 0 ${topPercent}%` }}
      >
        <div className="viewer-toolbar">
          <div className="viewer-shapes" role="group" aria-label="几何体">
            {PRIMITIVES.map((value) => (
              <button
                key={value}
                type="button"
                className={shape === value ? 'is-active' : ''}
                onClick={() => setShape(value)}
              >
                {PRIMITIVE_LABELS[value]}
              </button>
            ))}
            <button
              type="button"
              className={shape === 'gltf' ? 'is-active' : ''}
              title="上传 glTF / GLB 文件"
              onClick={() => fileRef.current?.click()}
            >
              glTF
            </button>
          </div>
          <label className="viewer-perf-toggle" title="持续渲染并采样帧统计">
            <input
              type="checkbox"
              checked={perfMode}
              onChange={(event) => setPerfMode(event.target.checked)}
            />
            性能
          </label>
          <button
            type="button"
            className="viewer-collapse"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? '节点库' : '收起库'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".gltf,.glb,model/gltf+json,model/gltf-binary"
            hidden
            onChange={handleFile}
          />
        </div>
        <Viewport3D />
      </div>

      {!collapsed && (
        <>
          <div
            className="viewer-separator"
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={handleSeparatorDown}
          />
          <div className="viewer-library" style={{ flex: `0 0 ${100 - topPercent}%` }}>
            {children}
          </div>
        </>
      )}
    </section>
  )
}
