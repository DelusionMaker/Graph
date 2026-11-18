import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { useUiStore } from '../graph/uiStore'
import { PerfHUD } from '../perf/PerfHUD'
import { ModelAsset } from './ModelAsset'
import { useViewerStore } from './useViewerStore'

interface ControlsLike {
  target: { x: number; y: number; z: number }
}

export function Viewport3D() {
  const theme = useUiStore((state) => state.theme)
  const frameloop = useViewerStore((state) => state.frameloop)
  // 初始相机只取一次，之后由 OrbitControls 主导并写回 store
  const initialCamera = useRef(useViewerStore.getState().camera).current
  const background = theme === 'light' ? '#f6f7fa' : '#1a1b1e'

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
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 4]} intensity={2.2} castShadow />
        <ModelAsset />
        {/* 阴影承接面只显示阴影，不参与"单 Mesh + 单材质"的节点图约束 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <shadowMaterial transparent opacity={0.28} />
        </mesh>
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
