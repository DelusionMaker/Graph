import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { useUiStore } from '../graph/uiStore'
import { PerfHUD } from '../perf/PerfHUD'
import { PerfProbe } from '../perf/PerfProbe'
import { PostFXStack } from '../postfx/PostFXStack'
import { useProgramStore } from '../shader/useProgramStore'
import { Lights } from './Lights'
import { SceneRoot } from './SceneRoot'
import { useViewerStore } from './useViewerStore'

interface ControlsLike {
  target: { x: number; y: number; z: number }
}

export function Viewport3D() {
  const theme = useUiStore((state) => state.theme)
  const baseFrameloop = useViewerStore((state) => state.frameloop)
  const program = useProgramStore((state) => state.program)
  // 初始相机只取一次，之后由 OrbitControls 主导并写回 store
  const initialCamera = useRef(useViewerStore.getState().camera).current
  const background = theme === 'light' ? '#f6f7fa' : '#1a1b1e'

  // 存在 Time 节点时必须持续渲染，否则 demand 模式下时间会冻结
  const hasTime = useMemo(
    () => Object.values(program?.uniforms ?? {}).some((uniform) => uniform.animated),
    [program],
  )
  const frameloop = hasTime ? 'always' : baseFrameloop

  return (
    <div className="viewport-3d">
      <Canvas
        frameloop={frameloop}
        dpr={[1, 2]}
        shadows
        camera={{ position: initialCamera.position, fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[background]} />

        <Lights />
        <SceneRoot />

        {/* 阴影承接面只显示阴影，不参与"单 Mesh + 单材质"的节点图约束 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <shadowMaterial transparent opacity={0.28} />
        </mesh>

        <PostFXStack />
        <PerfProbe />

        <OrbitControls makeDefault target={initialCamera.target} enableDamping={false} />
        <CameraSync />
      </Canvas>
      <PerfHUD />
    </div>
  )
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** 相机状态写回 viewer store；只在数值实际变化时写入，避免无谓触发 */
function CameraSync() {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as ControlsLike | null
  const last = useRef('')

  useFrame(() => {
    if (!controls) return
    const { x, y, z } = camera.position
    const target = controls.target
    const key = `${x},${y},${z}|${target.x},${target.y},${target.z}`
    if (key === last.current) return
    last.current = key
    useViewerStore.getState().setCamera({
      position: [round(x), round(y), round(z)],
      target: [round(target.x), round(target.y), round(target.z)],
    })
  })

  return null
}
