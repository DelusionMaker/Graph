import {
  Color,
  Matrix4,
  ShaderMaterial,
  Vector2,
  Vector3,
  type IUniform,
  type Material,
} from 'three'
import type { CompiledProgram, UniformValue } from '../shader/compiler'
import { applyTextureSettings, resolveTexture } from './assets'

const MAX_LIGHTS = 3

function toThreeValue(uniform: UniformValue): unknown {
  const value = uniform.value
  switch (uniform.type) {
    case 'float':
      return Number(value)
    case 'vec2': {
      const [x, y] = Array.isArray(value) ? value : [0, 0]
      return new Vector2(Number(x), Number(y))
    }
    case 'vec3': {
      const [x, y, z] = Array.isArray(value) ? value : [0, 0, 0]
      return new Vector3(Number(x), Number(y), Number(z))
    }
    case 'color': {
      const [r, g, b] = Array.isArray(value) ? value : [0, 0, 0]
      return new Color(Number(r), Number(g), Number(b))
    }
    case 'texture':
      return resolveTexture(String(value))
    case 'time':
    default:
      return 0
  }
}

/** 把光照描述转成 shader 的定长 uniform 数组 */
function buildLightUniforms(program: CompiledProgram): Record<string, IUniform> {
  const lights = program.lighting.lights
  const types: number[] = []
  const colors: Vector3[] = []
  const intensities: number[] = []
  const directions: Vector3[] = []
  const positions: Vector3[] = []
  const decays: number[] = []

  for (let index = 0; index < MAX_LIGHTS; index += 1) {
    const light = lights[index]
    if (light) {
      types.push(light.type === 'ambient' ? 0 : light.type === 'directional' ? 1 : 2)
      colors.push(new Vector3(...light.color))
      intensities.push(light.intensity)
      directions.push(new Vector3(...light.direction))
      positions.push(new Vector3(...light.position))
      decays.push(light.decay)
    } else {
      types.push(0)
      colors.push(new Vector3(0, 0, 0))
      intensities.push(0)
      directions.push(new Vector3(0, -1, 0))
      positions.push(new Vector3(0, 0, 0))
      decays.push(0)
    }
  }

  return {
    u_lightCount: { value: Math.min(lights.length, MAX_LIGHTS) },
    u_lightType: { value: types },
    u_lightColor: { value: colors },
    u_lightIntensity: { value: intensities },
    u_lightDirection: { value: directions },
    u_lightPosition: { value: positions },
    u_lightDecay: { value: decays },
  }
}

function buildShadowUniforms(program: CompiledProgram): Record<string, IUniform> {
  const shadow = program.lighting.shadow
  const directionalIndex = program.lighting.lights.findIndex(
    (light) => light.type === 'directional',
  )
  const directional = directionalIndex >= 0 ? program.lighting.lights[directionalIndex] : null

  return {
    // 未渲染 depth pass 时用白色兜底纹理，采样结果 1 = 完全受光
    u_shadowMap: { value: resolveTexture('') },
    u_lightViewProjection: { value: new Matrix4() },
    u_shadowLightDir: {
      value: new Vector3(...(directional?.direction ?? [0, -1, 0])),
    },
    u_shadowBias: { value: shadow?.bias ?? 0.0015 },
    u_shadowTexel: { value: 1 / (shadow?.mapSize ?? 1024) },
    u_shadowSoftness: { value: shadow?.softness ?? 1 },
    u_shadowEnabled: { value: shadow && directional ? 1 : 0 },
    // 只让对应的那一盏灯接收阴影；没有投影灯时为 -1
    u_shadowLightIndex: { value: shadow && directional ? directionalIndex : -1 },
  }
}

export function buildUniforms(program: CompiledProgram | null): Record<string, IUniform> {
  const uniforms: Record<string, IUniform> = {}
  if (!program) return uniforms

  for (const [name, uniform] of Object.entries(program.uniforms)) {
    uniforms[name] = { value: toThreeValue(uniform) }
  }

  // 纹理的 wrap / flipY 来自节点 widget，编译后按 slot 重新应用
  for (const slot of program.textureSlots) {
    const texture = resolveTexture(slot.assetId)
    applyTextureSettings(texture, slot.wrap, slot.flipY)
    uniforms[slot.uniform] = { value: texture }
  }

  return { ...uniforms, ...buildLightUniforms(program), ...buildShadowUniforms(program) }
}

function createFallbackMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader:
      'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(0.55, 0.61, 1.0, 1.0); }',
  })
}

function selectShaderSource(program: CompiledProgram) {
  switch (program.shading) {
    case 'unlit':
      return program.unlit
    case 'lambert':
      return program.lambert
    case 'blinnPhong':
      return program.blinnPhong
    case 'pbr':
    default:
      return program.pbr
  }
}

/** 所有着色模型都走 ShaderMaterial，光照完全由编译产物里的 GLSL 计算 */
export function createProgramMaterial(program: CompiledProgram | null): ShaderMaterial {
  if (!program) return createFallbackMaterial()

  const source = selectShaderSource(program)
  if (!source) return createFallbackMaterial()

  const material = new ShaderMaterial({
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader,
    uniforms: buildUniforms(program),
  })
  material.wireframe = program.mesh.wireframe
  material.userData.hash = program.hash
  return material
}

/**
 * 同步编译产物：
 * - 结构 hash 变化时替换 shader 源并触发重编译；
 * - 仅 uniform / 光照参数变化时只替换 uniforms，不重编译。
 */
export function syncMaterial(material: Material, program: CompiledProgram | null): void {
  if (!(material instanceof ShaderMaterial) || !program) return

  const source = selectShaderSource(program)
  if (!source) return

  if (material.userData.hash !== program.hash) {
    material.vertexShader = source.vertexShader
    material.fragmentShader = source.fragmentShader
    material.userData.hash = program.hash
    material.needsUpdate = true
  }

  material.uniforms = buildUniforms(program)
  material.wireframe = program.mesh.wireframe
}
