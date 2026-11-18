import { usePerfStore } from './usePerfStore'

/** DOM 浮层（不画在 canvas 内），细粒度订阅独立 perf store */
export function PerfHUD() {
  const fps = usePerfStore((state) => state.fps)
  const frameMs = usePerfStore((state) => state.frameMs)
  const drawCalls = usePerfStore((state) => state.drawCalls)
  const triangles = usePerfStore((state) => state.triangles)

  return (
    <div className="perf-hud" aria-live="off">
      <span title="每秒帧数">FPS {fps > 0 ? fps.toFixed(0) : '--'}</span>
      <span title="帧时间">{frameMs > 0 ? `${frameMs.toFixed(1)}ms` : '--'}</span>
      <span title="Draw calls">DC {drawCalls > 0 ? drawCalls : '--'}</span>
      <span title="三角面数">△ {triangles > 0 ? triangles.toLocaleString() : '--'}</span>
    </div>
  )
}
