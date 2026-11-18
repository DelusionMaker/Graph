import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { usePerfStore } from './usePerfStore'

const SAMPLE_INTERVAL_MS = 250

/** 4Hz 采样：帧时间、draw calls、三角面数写入独立 perf store */
export function PerfProbe() {
  const gl = useThree((state) => state.gl)
  const lastFrame = useRef(performance.now())
  const lastPublish = useRef(performance.now())
  const frameCount = useRef(0)
  const totalFrameMs = useRef(0)

  useFrame(() => {
    const now = performance.now()
    totalFrameMs.current += now - lastFrame.current
    lastFrame.current = now
    frameCount.current += 1

    if (now - lastPublish.current < SAMPLE_INTERVAL_MS) return

    const frameMs = frameCount.current > 0 ? totalFrameMs.current / frameCount.current : 0
    usePerfStore.getState().setMetrics({
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMs,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    })

    frameCount.current = 0
    totalFrameMs.current = 0
    lastPublish.current = now
  })

  return null
}
