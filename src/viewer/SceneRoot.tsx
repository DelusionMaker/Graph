import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ShaderMaterial, type IUniform } from 'three'
import { useProgramStore } from '../shader/useProgramStore'
import { ModelAsset } from './ModelAsset'
import { createProgramMaterial, syncMaterial } from './material'
import { useRequestFrame } from './requestFrame'
import { useViewerStore } from './useViewerStore'

/**
 * 场景唯一的渲染根：
 * - 有 scene/Mesh 节点时由编译产物驱动；否则回退到工具条状态；
 * - 材质在结构 hash 变化时靠 customProgramCacheKey 重新编译，不重建材质；
 * - 逐帧只更新 shader/Time 标记的 uniform。
 */
export function SceneRoot() {
  const program = useProgramStore((state) => state.program)
  const toolShape = useViewerStore((state) => state.shape)
  const toolUrl = useViewerStore((state) => state.gltfUrl)
  const toolScale = useViewerStore((state) => state.modelScale)

  const programRef = useRef(program)
  programRef.current = program

  const shading = program?.shading ?? 'pbr'
  const material = useMemo(() => createProgramMaterial(programRef.current), [shading])
  const requestFrame = useRequestFrame()

  useEffect(() => {
    syncMaterial(material, program)
    // demand 模式下 effect 内改 three 对象不会自动重绘，必须显式请求一帧
    requestFrame()
  }, [material, program, requestFrame])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const current = programRef.current
    if (!current) return

    if (material instanceof ShaderMaterial) {
      for (const [name, uniform] of Object.entries(current.uniforms)) {
        if (uniform.animated && material.uniforms[name]) {
          material.uniforms[name].value = state.clock.elapsedTime
        }
      }
      return
    }

    const shader = material.userData.shader as { uniforms: Record<string, IUniform> } | undefined
    if (!shader) return
    for (const [name, uniform] of Object.entries(current.uniforms)) {
      if (uniform.animated && shader.uniforms[name]) {
        shader.uniforms[name].value = state.clock.elapsedTime
      }
    }
  })

  const mesh = program?.meshFromNode
    ? { shape: program.mesh.shape, assetId: program.mesh.assetId, scale: program.mesh.scale }
    : { shape: toolShape, assetId: toolUrl ?? '', scale: toolScale }

  return (
    <ModelAsset shape={mesh.shape} assetId={mesh.assetId} scale={mesh.scale} material={material} />
  )
}
