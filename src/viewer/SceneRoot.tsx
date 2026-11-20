import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Matrix4, ShaderMaterial, Vector3 } from 'three'
import { GROUND_VERTEX, groundFragment } from '../shader/glsl/chunks'
import { DEFAULT_SHADOW_METHOD, type ShadowMethod } from '../shader/glsl/shadow'
import { useProgramStore } from '../shader/useProgramStore'
import { resolveTexture } from './assets'
import { ModelAsset } from './ModelAsset'
import { createProgramMaterial, syncMaterial } from './material'
import { useShadowPass } from './passes/ShadowPassScheduler'
import { useRequestFrame } from './requestFrame'
import { useViewerStore } from './useViewerStore'

function createGroundMaterial(method: ShadowMethod): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: GROUND_VERTEX,
    fragmentShader: groundFragment(method),
    uniforms: {
      u_shadowMap: { value: resolveTexture('') },
      u_shadowMoments: { value: resolveTexture('') },
      u_shadowUseVsm: { value: 0 },
      u_lightViewProjection: { value: new Matrix4() },
      u_shadowLightDir: { value: new Vector3(0, -1, 0) },
      u_shadowBias: { value: 0.0015 },
      u_shadowNormalBias: { value: 0.02 },
      u_shadowTexel: { value: 1 / 1024 },
      u_shadowSoftness: { value: 1 },
      u_shadowEnabled: { value: 0 },
      u_shadowLightSize: { value: 6 },
      u_shadowBlockerSamples: { value: 8 },
      u_shadowPcfSamples: { value: 16 },
    },
  })
}

/**
 * 场景唯一的渲染根：
 * - 有 scene/Mesh 节点时由编译产物驱动；否则回退到工具条状态；
 * - 材质始终是自定义 ShaderMaterial，光照与阴影都由编译产物中的 GLSL 计算；
 * - 逐帧只更新 shader/Time 标记的 uniform。
 */
export function SceneRoot() {
  const program = useProgramStore((state) => state.program)
  const toolShape = useViewerStore((state) => state.shape)
  const toolUrl = useViewerStore((state) => state.gltfUrl)
  const toolScale = useViewerStore((state) => state.modelScale)
  const toolWireframe = useViewerStore((state) => state.wireframe)

  const programRef = useRef(program)
  programRef.current = program

  const shading = program?.shading ?? 'pbr'
  const shadowMethod = program?.lighting.shadow?.method ?? DEFAULT_SHADOW_METHOD
  const material = useMemo(() => createProgramMaterial(programRef.current), [shading])
  const groundMaterial = useMemo(() => createGroundMaterial(shadowMethod), [shadowMethod])
  const requestFrame = useRequestFrame()

  useEffect(() => {
    syncMaterial(material, program)
    // demand 模式下 effect 内改 three 对象不会自动重绘，必须显式请求一帧
    requestFrame()
  }, [material, program, requestFrame])

  useEffect(() => {
    const shadow = program?.lighting.shadow
    const directional = program?.lighting.lights.find((light) => light.type === 'directional')
    const uniforms = groundMaterial.uniforms
    uniforms.u_shadowEnabled.value = shadow && directional ? 1 : 0
    uniforms.u_shadowBias.value = shadow?.bias ?? 0.0015
    uniforms.u_shadowNormalBias.value = shadow?.normalBias ?? 0.02
    uniforms.u_shadowTexel.value = 1 / (shadow?.mapSize ?? 1024)
    uniforms.u_shadowSoftness.value = shadow?.softness ?? 1
    uniforms.u_shadowLightSize.value = shadow?.lightSize ?? 6
    uniforms.u_shadowBlockerSamples.value = shadow?.blockerSamples ?? 8
    uniforms.u_shadowPcfSamples.value = shadow?.pcfSamples ?? 16
    requestFrame()
  }, [program, groundMaterial, requestFrame])

  // 有 Mesh 节点时以节点为准；无节点时才用工具条兜底
  const wireframe = program?.meshFromNode ? program.mesh.wireframe : toolWireframe
  useEffect(() => {
    material.wireframe = wireframe
    requestFrame()
  }, [material, wireframe, requestFrame])

  useEffect(
    () => () => {
      material.dispose()
      groundMaterial.dispose()
    },
    [material, groundMaterial],
  )

  const mesh = program?.meshFromNode
    ? { shape: program.mesh.shape, assetId: program.mesh.assetId, scale: program.mesh.scale }
    : { shape: toolShape, assetId: toolUrl ?? '', scale: toolScale }
  const geometryKey = `${mesh.shape}|${mesh.assetId}|${mesh.scale}`

  useShadowPass(program, material, groundMaterial, requestFrame, geometryKey)

  useFrame((state) => {
    const current = programRef.current
    if (!current) return
    for (const [name, uniform] of Object.entries(current.uniforms)) {
      if (uniform.animated && material.uniforms[name]) {
        material.uniforms[name].value = state.clock.elapsedTime
      }
    }
  })

  return (
    <>
      <ModelAsset
        shape={mesh.shape}
        assetId={mesh.assetId}
        scale={mesh.scale}
        material={material}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.25, 0]}
        userData={{ isShadowReceiver: true }}
        material={groundMaterial}
      >
        <planeGeometry args={[12, 12]} />
      </mesh>
    </>
  )
}
