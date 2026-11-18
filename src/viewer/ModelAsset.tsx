import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useEffect, type ReactNode } from 'react'
import type { Mesh } from 'three'
import { disposeObject3D, revokeModelUrl } from './assets'
import { useViewerStore, type MeshShape } from './useViewerStore'

type PrimitiveShape = Exclude<MeshShape, 'gltf'>

/** 阶段 A 的模型入口：内置几何体 + 上传的 glTF，加载失败时回退到 Box */
export function ModelAsset() {
  const shape = useViewerStore((state) => state.shape)
  const gltfUrl = useViewerStore((state) => state.gltfUrl)
  const scale = useViewerStore((state) => state.modelScale)

  if (shape === 'gltf' && gltfUrl) {
    const fallback = <PrimitiveMesh shape="box" scale={scale} />
    return (
      // key 让更换文件时重置错误边界，避免一次失败后永远显示兜底
      <ModelErrorBoundary key={gltfUrl} fallback={fallback}>
        <Suspense fallback={fallback}>
          <GltfModel url={gltfUrl} scale={scale} />
        </Suspense>
      </ModelErrorBoundary>
    )
  }

  return <PrimitiveMesh shape={shape === 'gltf' ? 'box' : shape} scale={scale} />
}

function PrimitiveMesh({ shape, scale }: { shape: PrimitiveShape; scale: number }) {
  return (
    <mesh scale={scale} castShadow receiveShadow>
      {shape === 'box' ? <boxGeometry args={[1.6, 1.6, 1.6]} /> : null}
      {shape === 'sphere' ? <sphereGeometry args={[1, 48, 32]} /> : null}
      {shape === 'torusknot' ? <torusKnotGeometry args={[0.7, 0.26, 180, 24]} /> : null}
      <meshStandardMaterial color="#8b9cff" roughness={0.35} metalness={0.25} />
    </mesh>
  )
}

function GltfModel({ url, scale }: { url: string; scale: number }) {
  const { scene } = useGLTF(url)

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
  }, [scene])

  useEffect(() => {
    return () => {
      // 切换模型或卸载时回收 GPU 资源与 blob URL；清掉 drei 缓存避免同名 URL 复用脏数据
      disposeObject3D(scene)
      useGLTF.clear(url)
      revokeModelUrl(url)
    }
  }, [scene, url])

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
