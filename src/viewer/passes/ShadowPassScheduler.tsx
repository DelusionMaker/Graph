import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Box3,
  Color,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  OrthographicCamera,
  Vector3,
  type Camera,
  type Material as ThreeMaterial,
  type Scene,
  type ShaderMaterial,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import type { CompiledProgram } from '../../shader/compiler'
import { DEFAULT_SHADOW_METHOD } from '../../shader/glsl/shadow'
import { resolveTexture } from '../assets'
import {
  createVsmResources,
  createVsmTargets,
  disposeVsmTargets,
  renderVsmBlur,
  supportsVsm,
} from './vsm'
import { createDepthShadowTarget } from './targetPool'

const CORNERS: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
]

function renderSceneWithShadowMaterial(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  target: WebGLRenderTarget,
  material: ThreeMaterial,
  clearWhite = false,
): void {
  const originals = new Map<Mesh, ThreeMaterial | ThreeMaterial[]>()
  const hiddenReceivers = new Map<Mesh, boolean>()

  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    if (mesh.userData.isShadowReceiver) {
      hiddenReceivers.set(mesh, mesh.visible)
      mesh.visible = false
      return
    }
    originals.set(mesh, mesh.material)
    mesh.material = material
  })

  const previousBackground = scene.background
  const previousClearColor = new Color()
  gl.getClearColor(previousClearColor)
  const previousClearAlpha = gl.getClearAlpha()

  scene.background = null
  if (clearWhite) gl.setClearColor(0xffffff, 1)
  gl.setRenderTarget(target)
  gl.clear()
  gl.render(scene, camera)
  gl.setRenderTarget(null)
  scene.background = previousBackground
  gl.setClearColor(previousClearColor, previousClearAlpha)

  originals.forEach((original, mesh) => {
    mesh.material = original
  })
  hiddenReceivers.forEach((visible, mesh) => {
    mesh.visible = visible
  })
}

/** 根据 caster 包围盒拟合光源正交相机，避免固定 ±3 范围截断阴影。 */
export function fitShadowCamera(scene: Scene, direction: [number, number, number]) {
  const box = new Box3()
  let hasCaster = false

  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible || mesh.userData.isShadowReceiver) return
    box.expandByObject(mesh)
    hasCaster = true
  })

  const center = hasCaster ? box.getCenter(new Vector3()) : new Vector3()
  const size = hasCaster ? box.getSize(new Vector3()) : new Vector3(6, 6, 6)
  const radius = Math.max(size.length() * 0.5, 3)
  const lightDirection = new Vector3(...direction).normalize()
  const near = 0.1
  const distance = radius * 2 + near
  const camera = new OrthographicCamera(
    -radius,
    radius,
    radius,
    -radius,
    near,
    distance * 2 + radius,
  )
  camera.position.copy(center).addScaledVector(lightDirection, -distance)
  camera.lookAt(center)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()

  if (hasCaster) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const point = new Vector3()

    for (const [ix, iy, iz] of CORNERS) {
      point.set(
        ix === 0 ? box.min.x : box.max.x,
        iy === 0 ? box.min.y : box.max.y,
        iz === 0 ? box.min.z : box.max.z,
      )
      point.applyMatrix4(camera.matrixWorldInverse)
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }

    const padding = Math.max(0.5, radius * 0.05)
    camera.left = minX - padding
    camera.right = maxX + padding
    camera.bottom = minY - padding
    camera.top = maxY + padding
    camera.updateProjectionMatrix()
  }

  return camera
}

export function useShadowPass(
  program: CompiledProgram | null,
  material: ShaderMaterial,
  groundMaterial: ShaderMaterial,
  requestFrame: () => void,
  geometryKey: string,
): void {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const shadow = program?.lighting.shadow
  const directional = program?.lighting.lights.find((light) => light.type === 'directional')
  const vsmSupported = useMemo(
    () => (shadow?.method === 'vsm' ? supportsVsm(gl) : false),
    [gl, shadow?.method],
  )
  const useVsm = shadow?.method === 'vsm' && vsmSupported
  const hasShadow = shadow !== null
  const mapSize = shadow?.mapSize ?? 1024
  const hasDirectional = Boolean(directional)

  const depthTarget = useMemo(
    () => (hasShadow && hasDirectional ? createDepthShadowTarget(mapSize) : null),
    [hasShadow, hasDirectional, mapSize],
  )
  const vsmTargets = useMemo(() => (useVsm ? createVsmTargets(mapSize) : null), [useVsm, mapSize])
  const vsmResources = useMemo(() => (useVsm ? createVsmResources() : null), [useVsm])

  useEffect(() => () => depthTarget?.dispose(), [depthTarget])
  useEffect(() => () => disposeVsmTargets(vsmTargets), [vsmTargets])
  useEffect(() => () => vsmResources?.dispose(), [vsmResources])

  const lastKey = useRef('')

  useFrame(() => {
    if (!depthTarget || !directional) return
    const key = [
      program?.hash,
      geometryKey,
      shadow !== null,
      shadow?.mapSize,
      shadow?.method ?? DEFAULT_SHADOW_METHOD,
      useVsm,
      ...directional.direction,
    ].join('|')
    if (lastKey.current === key) return
    lastKey.current = key

    const lightCamera = fitShadowCamera(scene, directional.direction)
    const depthMaterial = new MeshDepthMaterial()
    renderSceneWithShadowMaterial(gl, scene, lightCamera, depthTarget.target, depthMaterial)
    depthMaterial.dispose()

    if (useVsm && vsmTargets && vsmResources) {
      renderSceneWithShadowMaterial(
        gl,
        scene,
        lightCamera,
        vsmTargets.moment,
        vsmResources.momentMaterial,
        true,
      )
      renderVsmBlur(gl, vsmResources, vsmTargets.moment.texture, vsmTargets.blur, [1 / mapSize, 0])
      renderVsmBlur(gl, vsmResources, vsmTargets.blur.texture, vsmTargets.moment, [0, 1 / mapSize])
    }

    const viewProjection = new Matrix4().multiplyMatrices(
      lightCamera.projectionMatrix,
      lightCamera.matrixWorldInverse,
    )

    for (const current of [material, groundMaterial]) {
      if (current.uniforms.u_shadowMap) {
        current.uniforms.u_shadowMap.value = depthTarget.target.depthTexture
      }
      if (current.uniforms.u_shadowMoments) {
        current.uniforms.u_shadowMoments.value = vsmTargets?.moment.texture ?? resolveTexture('')
      }
      if (current.uniforms.u_shadowUseVsm) current.uniforms.u_shadowUseVsm.value = useVsm ? 1 : 0
      if (current.uniforms.u_shadowBias)
        current.uniforms.u_shadowBias.value = shadow?.bias ?? 0.0015
      if (current.uniforms.u_shadowNormalBias) {
        current.uniforms.u_shadowNormalBias.value = shadow?.normalBias ?? 0.02
      }
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
