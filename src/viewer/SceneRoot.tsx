import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  DepthTexture,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  OrthographicCamera,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type Material as ThreeMaterial,
} from 'three'
import type { CompiledProgram } from '../shader/compiler'
import {
  GROUND_FRAGMENT,
  GROUND_VERTEX,
} from '../shader/glsl/chunks'
import { useProgramStore } from '../shader/useProgramStore'
import { resolveTexture } from './assets'
import { ModelAsset } from './ModelAsset'
import { createProgramMaterial, syncMaterial } from './material'
import { useRequestFrame } from './requestFrame'
import { useViewerStore } from './useViewerStore'

function createGroundMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    uniforms: {
      u_shadowMap: { value: resolveTexture('') },
      u_lightViewProjection: { value: new Matrix4() },
      u_shadowLightDir: { value: new Vector3(0, -1, 0) },
      u_shadowBias: { value: 0.0015 },
      u_shadowTexel: { value: 1 / 1024 },
      u_shadowSoftness: { value: 1 },
      u_shadowEnabled: { value: 0 },
    },
  })
}

/**
 * 自定义阴影深度 pass：不依赖 three 的 Light / shadowMap。
 * 只在外形或阴影配置变化时重渲染，结果写入 DepthTexture 供 shader 采样。
 */
function useShadowPass(
  program: CompiledProgram | null,
  material: ShaderMaterial,
  groundMaterial: ShaderMaterial,
  requestFrame: () => void,
) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const shadow = program?.lighting.shadow
  const directional = program?.lighting.lights.find((light) => light.type === 'directional')

  const target = useMemo(() => {
    if (!shadow?.enabled || !directional) return null
    const size = shadow.mapSize
    const renderTarget = new WebGLRenderTarget(size, size)
    renderTarget.depthTexture = new DepthTexture(size, size)
    return renderTarget
  }, [shadow?.enabled, shadow?.mapSize, Boolean(directional)])

  useEffect(() => () => target?.dispose(), [target])

  const lastKey = useRef('')

  useFrame(() => {
    if (!target || !directional) return
    const key = [
      program?.hash,
      shadow?.enabled,
      shadow?.mapSize,
      shadow?.bias,
      shadow?.softness,
      directional.intensity,
    ].join('|')
    if (lastKey.current === key) return
    lastKey.current = key

    // 光源相机：沿平行光反方向看向原点，正交范围覆盖单 mesh 场景
    const lightCamera = new OrthographicCamera(-3, 3, 3, -3, 0.1, 20)
    const [x, y, z] = directional.direction
    lightCamera.position.set(-x * 5, -y * 5, -z * 5)
    lightCamera.lookAt(0, 0, 0)
    lightCamera.updateMatrixWorld()
    lightCamera.updateProjectionMatrix()

    // 临时把所有投射 mesh 换成深度材质；接收阴影的地面不参与深度 pass
    const depthMaterial = new MeshDepthMaterial()
    const originals = new Map<Mesh, ThreeMaterial | ThreeMaterial[]>()
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh || mesh.userData.isShadowReceiver) return
      originals.set(mesh, mesh.material)
      mesh.material = depthMaterial
    })

    const previousBackground = scene.background
    scene.background = null
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, lightCamera)
    gl.setRenderTarget(null)
    scene.background = previousBackground

    originals.forEach((original, mesh) => {
      mesh.material = original
    })
    depthMaterial.dispose()

    const viewProjection = new Matrix4().multiplyMatrices(
      lightCamera.projectionMatrix,
      lightCamera.matrixWorldInverse,
    )

    for (const current of [material, groundMaterial]) {
      if (current.uniforms.u_shadowMap) current.uniforms.u_shadowMap.value = target.depthTexture
      if (current.uniforms.u_lightViewProjection) {
        current.uniforms.u_lightViewProjection.value = viewProjection
      }
      if (current.uniforms.u_shadowLightDir) {
        current.uniforms.u_shadowLightDir.value.set(...directional.direction)
      }
    }
    requestFrame()
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
  const material = useMemo(() => createProgramMaterial(programRef.current), [shading])
  const groundMaterial = useMemo(() => createGroundMaterial(), [])
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
    uniforms.u_shadowEnabled.value = shadow?.enabled && directional ? 1 : 0
    uniforms.u_shadowBias.value = shadow?.bias ?? 0.0015
    uniforms.u_shadowTexel.value = 1 / (shadow?.mapSize ?? 1024)
    uniforms.u_shadowSoftness.value = shadow?.softness ?? 1
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

  useShadowPass(program, material, groundMaterial, requestFrame)

  useFrame((state) => {
    const current = programRef.current
    if (!current) return
    for (const [name, uniform] of Object.entries(current.uniforms)) {
      if (uniform.animated && material.uniforms[name]) {
        material.uniforms[name].value = state.clock.elapsedTime
      }
    }
  })

  const mesh = program?.meshFromNode
    ? { shape: program.mesh.shape, assetId: program.mesh.assetId, scale: program.mesh.scale }
    : { shape: toolShape, assetId: toolUrl ?? '', scale: toolScale }

  return (
    <>
      <ModelAsset shape={mesh.shape} assetId={mesh.assetId} scale={mesh.scale} material={material} />
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
