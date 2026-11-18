import {
  Color,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector2,
  Vector3,
  type IUniform,
  type Material,
} from 'three'
import type { CompiledProgram, UniformValue } from '../shader/compiler'
import { SHADER_UV_ASSIGN, SHADER_UV_VARYING } from '../shader/glsl/chunks'
import { resolveTexture } from './assets'

/** onBeforeCompile 提供的 shader 对象中我们实际用到的最小结构 */
interface CompiledShader {
  uniforms: Record<string, IUniform>
  vertexShader: string
  fragmentShader: string
}

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

export function buildUniforms(program: CompiledProgram | null): Record<string, IUniform> {
  const uniforms: Record<string, IUniform> = {}
  if (!program) return uniforms
  for (const [name, uniform] of Object.entries(program.uniforms)) {
    uniforms[name] = { value: toThreeValue(uniform) }
  }
  return uniforms
}

/** 把 PBR 注入片段写进 three 的 shader 参数 */
function applyInjection(target: CompiledShader, program: CompiledProgram): void {
  target.uniforms = { ...target.uniforms, ...buildUniforms(program) }

  // GLSL 侧必须显式声明 uniform，否则注入片段里的 u_<id>_* 是未定义标识符
  const declarations = program.uniformDeclarations.join('\n')
  target.vertexShader = `${SHADER_UV_VARYING}\n${target.vertexShader}`.replace(
    '#include <uv_vertex>',
    `#include <uv_vertex>\n${SHADER_UV_ASSIGN}`,
  )
  target.fragmentShader = `${declarations}\n${SHADER_UV_VARYING}\n${target.fragmentShader}`

  const { injection } = program
  if (injection.color) {
    target.fragmentShader = target.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${injection.color}`,
    )
  }
  if (injection.roughness) {
    target.fragmentShader = target.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\n${injection.roughness}`,
    )
  }
  if (injection.metalness) {
    target.fragmentShader = target.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>\n${injection.metalness}`,
    )
  }
  if (injection.emissive) {
    target.fragmentShader = target.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n${injection.emissive}`,
    )
  }
}

/**
 * 创建材质：
 * - PBR：MeshStandardMaterial + onBeforeCompile，customProgramCacheKey 用结构 hash；
 * - Unlit：完整 ShaderMaterial。
 * 材质本身不随结构变化重建，靠 customProgramCacheKey 让 three 重新编译。
 */
export function createProgramMaterial(
  program: CompiledProgram | null,
): MeshStandardMaterial | ShaderMaterial {
  if (program?.shading === 'unlit' && program.unlit) {
    return new ShaderMaterial({
      vertexShader: program.unlit.vertexShader,
      fragmentShader: program.unlit.fragmentShader,
      uniforms: buildUniforms(program),
    })
  }

  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })
  material.userData.program = program
  material.onBeforeCompile = (shader) => {
    const current = material.userData.program as CompiledProgram | null
    if (current) applyInjection(shader as unknown as CompiledShader, current)
    material.userData.shader = shader
  }
  material.customProgramCacheKey = () =>
    String((material.userData.program as CompiledProgram | null)?.hash ?? 'default')
  return material
}

/**
 * 同步编译产物到已有材质：
 * - uniform-only 变化只改 uniform，不重建材质、不触发重编译；
 * - 结构 hash 变化时置 needsUpdate，由 onBeforeCompile 重新注入。
 */
export function syncMaterial(material: Material, program: CompiledProgram | null): void {
  material.userData.program = program

  if (material instanceof ShaderMaterial) {
    if (!program?.unlit) return
    material.vertexShader = program.unlit.vertexShader
    material.fragmentShader = program.unlit.fragmentShader
    material.uniforms = buildUniforms(program)
    material.needsUpdate = true
    return
  }

  const shader = material.userData.shader as CompiledShader | undefined
  if (shader && program) {
    const next = buildUniforms(program)
    for (const [name, uniform] of Object.entries(next)) shader.uniforms[name] = uniform
  }

  if (material.userData.hash !== program?.hash) {
    material.userData.hash = program?.hash
    material.needsUpdate = true
  }
}
