import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useGraphActions } from '../graph/actions'
import { useGraphStore } from '../graph/store'
import { useToastStore } from '../graph/toastStore'
import { createModelUrl, loadHdrTexture, loadTexture, registerAsset } from '../viewer/assets'
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

/**
 * 上传前校验文件头：
 * - GLB：magic 为 'glTF'；
 * - glTF：JSON 文本以 '{' 开头。
 * 拦截明显无效的文件，避免进入 loader 后产生未处理 rejection。
 */
async function looksLikeGltf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46) return true
  const text = await file.slice(0, 64).text()
  return text.trimStart().startsWith('{')
}

/** Radiance HDR 文件头应为 "#?RADIANCE" 或 "#?RGBE"。 */
async function looksLikeHdr(file: File): Promise<boolean> {
  const text = await file.slice(0, 16).text()
  return text.startsWith('#?RADIANCE') || text.startsWith('#?RGBE')
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
  const wireframeFallback = useViewerStore((state) => state.wireframe)
  const setWireframe = useViewerStore((state) => state.setWireframe)
  const nodes = useGraphStore((state) => state.nodes)
  const setWidgetValue = useGraphActions((state) => state.setWidgetValue)

  const meshNode = nodes.find((node) => node.type === 'scene/Mesh')
  const wireframeIndex = meshNode?.widgets.findIndex((widget) => widget.name === 'wireframe') ?? -1
  const wireframe = meshNode
    ? wireframeIndex >= 0 && meshNode.widgets[wireframeIndex].value === true
    : wireframeFallback
  const dockRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textureRef = useRef<HTMLInputElement>(null)
  const hdrRef = useRef<HTMLInputElement>(null)

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

  const handleWireframe = () => {
    const next = !wireframe
    setWireframe(next)
    if (!meshNode || wireframeIndex < 0) return
    setWidgetValue(meshNode.id, wireframeIndex, next)
  }

  const handleShape = (value: (typeof PRIMITIVES)[number]) => {
    setShape(value)
    // 有 scene/Mesh 时节点是唯一来源，工具条也要写回节点，否则点击不生效
    const meshNode = nodes.find((node) => node.type === 'scene/Mesh')
    if (!meshNode) return
    const shapeIndex = meshNode.widgets.findIndex((widget) => widget.name === 'shape')
    if (shapeIndex >= 0) setWidgetValue(meshNode.id, shapeIndex, value)
  }

  const handleTexture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const textureNode = nodes.find((node) => node.type === 'shader/Texture')
    if (!textureNode) {
      useToastStore.getState().show('请先添加 shader/Texture 节点', 'error')
      return
    }

    const assetIndex = textureNode.widgets.findIndex((widget) => widget.name === 'assetId')
    const wrapValue = String(
      textureNode.widgets.find((widget) => widget.name === 'wrap')?.value ?? 'repeat',
    )
    const wrap = wrapValue === 'clamp' ? 'clamp' : wrapValue === 'mirror' ? 'mirror' : 'repeat'
    const flipY = textureNode.widgets.find((widget) => widget.name === 'flipY')?.value !== false

    const assetId = `tex-${Date.now()}`
    try {
      await loadTexture(assetId, file, { wrap, flipY })
      if (assetIndex >= 0) setWidgetValue(textureNode.id, assetIndex, assetId)
      useToastStore.getState().show('贴图已应用到 shader/Texture', 'info')
    } catch {
      useToastStore.getState().show('贴图加载失败', 'error')
    }
  }

  const handleHdr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!(await looksLikeHdr(file))) {
      useToastStore.getState().show('文件不是有效的 Radiance HDR', 'error')
      return
    }

    const hdrNode = nodes.find((node) => node.type === 'texture/HDR')
    if (!hdrNode) {
      useToastStore.getState().show('请先添加 texture/HDR 节点', 'error')
      return
    }

    const assetIndex = hdrNode.widgets.findIndex((widget) => widget.name === 'assetId')
    const assetId = `hdr-${Date.now()}`
    try {
      await loadHdrTexture(assetId, file)
      if (assetIndex >= 0) setWidgetValue(hdrNode.id, assetIndex, assetId)
      useToastStore.getState().show('HDR 环境贴图已应用到 texture/HDR', 'info')
    } catch {
      useToastStore.getState().show('HDR 贴图加载失败', 'error')
    }
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!(await looksLikeGltf(file))) {
      useToastStore.getState().show('文件不是有效的 glTF / GLB', 'error')
      return
    }

    const url = createModelUrl(file)
    const assetId = `gltf-${Date.now()}`
    registerAsset(assetId, url)
    // 无 Mesh 节点时作为视口兜底
    setGltf(url, file.name)

    // 有 scene/Mesh 节点时，把模型写入节点，让节点图成为唯一来源
    const meshNode = nodes.find((node) => node.type === 'scene/Mesh')
    if (!meshNode) return
    const assetIndex = meshNode.widgets.findIndex((widget) => widget.name === 'assetId')
    const shapeIndex = meshNode.widgets.findIndex((widget) => widget.name === 'shape')
    if (assetIndex >= 0) setWidgetValue(meshNode.id, assetIndex, assetId)
    if (shapeIndex >= 0) setWidgetValue(meshNode.id, shapeIndex, 'gltf')
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
                onClick={() => handleShape(value)}
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
            <button
              type="button"
              className={wireframe ? 'is-active' : ''}
              title="线框模式"
              onClick={handleWireframe}
            >
              线框
            </button>
            <button
              type="button"
              title="上传贴图到 shader/Texture 节点"
              onClick={() => textureRef.current?.click()}
            >
              贴图
            </button>
            <button
              type="button"
              title="上传 HDR 到 texture/HDR 节点"
              onClick={() => hdrRef.current?.click()}
            >
              HDR
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
          <input ref={textureRef} type="file" accept="image/*" hidden onChange={handleTexture} />
          <input
            ref={hdrRef}
            type="file"
            accept=".hdr,image/vnd.radiance"
            hidden
            onChange={handleHdr}
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
