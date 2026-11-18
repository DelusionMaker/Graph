import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useEffect, type ReactNode } from 'react'
import type { Material, Mesh } from 'three'
import { disposeObject3D, resolveModelUrl, revokeModelUrl } from './assets'
import type { MeshShape } from './useViewerStore'

type PrimitiveShape = Exclude<MeshShape, 'gltf'>

interface Props {
  shape: MeshShape
  assetId: string
  scale: number
  material: Material
}

/** 模型入口：内置几何体 + glTF；材质由 SceneRoot 统一提供 */
export function ModelAsset({ shape, assetId, scale, material }: Props) {
  const url = shape === 'gltf' ? resolveModelUrl(assetId) : null

  if (url) {
    const fallback = <PrimitiveMesh shape="box" scale={scale} material={material} />
    return (
      // key 让更换文件时重置错误边界，避免一次失败后永远显示兜底
      <ModelErrorBoundary key={url} fallback={fallback}>
        <Suspense fallback={fallback}>
          <GltfModel url={url} scale={scale} material={material} />
        </Suspense>
      </ModelErrorBoundary>
    )
  }

  return (
    <PrimitiveMesh shape={shape === 'gltf' ? 'box' : shape} scale={scale} material={material} />
  )
}

function PrimitiveMesh({
  shape,
  scale,
  material,
}: {
  shape: PrimitiveShape
  scale: number
  material: Material
}) {
  return (
    <mesh scale={scale} castShadow receiveShadow material={material}>
      {shape === 'box' ? <boxGeometry args={[1.6, 1.6, 1.6]} /> : null}
      {shape === 'sphere' ? <sphereGeometry args={[1, 48, 32]} /> : null}
      {shape === 'torusknot' ? <torusKnotGeometry args={[0.7, 0.26, 180, 24]} /> : null}
    </mesh>
  )
}

function GltfModel({ url, scale, material }: { url: string; scale: number; material: Material }) {
  const { scene } = useGLTF(url)

  useEffect(() => {
    const entries: Array<{ mesh: Mesh; original: Mesh['material'] }> = []

    scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      entries.push({ mesh, original: mesh.material })
      mesh.material = material
      mesh.castShadow = true
      mesh.receiveShadow = true
    })

    return () => {
      // 先恢复原始材质，避免后续 dispose 误伤 SceneRoot 的共享材质
      for (const entry of entries) entry.mesh.material = entry.original
      disposeObject3D(scene)
      useGLTF.clear(url)
      revokeModelUrl(url)
    }
  }, [scene, url, material])

  return <primitive object={scene} scale={scale} />
}

interface BoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

class ModelErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.warn('[viewer] glTF 加载失败，已回退到默认几何体', error)
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
