import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'

/** VSM 需要 RGBA16F 可渲染；缺扩展时由调用方回退 PCF。 */
export function supportsVsm(gl: WebGLRenderer): boolean {
  return gl.capabilities.isWebGL2 && gl.extensions.has('EXT_color_buffer_float')
}

export interface VsmTargets {
  moment: WebGLRenderTarget
  blur: WebGLRenderTarget
}

export function createVsmTargets(size: number): VsmTargets {
  const createTarget = () => {
    const target = new WebGLRenderTarget(size, size, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    target.texture.generateMipmaps = false
    return target
  }

  return { moment: createTarget(), blur: createTarget() }
}

export function disposeVsmTargets(targets: VsmTargets | null): void {
  if (!targets) return
  targets.moment.dispose()
  targets.blur.dispose()
}

const MOMENT_VERTEX = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const MOMENT_FRAGMENT = `
void main() {
  float depth = gl_FragCoord.z;
  gl_FragColor = vec4(depth, depth * depth, 0.0, 1.0);
}
`

const BLUR_VERTEX = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const BLUR_FRAGMENT = `
uniform sampler2D u_input;
uniform vec2 u_direction;
varying vec2 vUv;

void main() {
  vec4 sum = texture2D(u_input, vUv) * 0.227027;
  sum += texture2D(u_input, vUv + u_direction * 1.3846153846) * 0.3162162162;
  sum += texture2D(u_input, vUv - u_direction * 1.3846153846) * 0.3162162162;
  sum += texture2D(u_input, vUv + u_direction * 3.2307692308) * 0.0702702703;
  sum += texture2D(u_input, vUv - u_direction * 3.2307692308) * 0.0702702703;
  gl_FragColor = sum;
}
`

export interface VsmResources {
  momentMaterial: ShaderMaterial
  blurMaterial: ShaderMaterial
  blurScene: Scene
  blurCamera: OrthographicCamera
  dispose: () => void
}

export function createVsmResources(): VsmResources {
  const momentMaterial = new ShaderMaterial({
    vertexShader: MOMENT_VERTEX,
    fragmentShader: MOMENT_FRAGMENT,
  })

  const blurMaterial = new ShaderMaterial({
    uniforms: {
      u_input: { value: null },
      u_direction: { value: new Vector2() },
    },
    vertexShader: BLUR_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
  })

  const quadGeometry = new PlaneGeometry(2, 2)
  const quad = new Mesh(quadGeometry, blurMaterial)
  const blurScene = new Scene()
  blurScene.add(quad)
  const blurCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  return {
    momentMaterial,
    blurMaterial,
    blurScene,
    blurCamera,
    dispose: () => {
      blurScene.remove(quad)
      quadGeometry.dispose()
      momentMaterial.dispose()
      blurMaterial.dispose()
    },
  }
}

export function renderVsmBlur(
  gl: WebGLRenderer,
  resources: VsmResources,
  source: Texture,
  target: WebGLRenderTarget,
  direction: [number, number],
): void {
  resources.blurMaterial.uniforms.u_input.value = source
  ;(resources.blurMaterial.uniforms.u_direction.value as Vector2).set(direction[0], direction[1])
  gl.setRenderTarget(target)
  gl.clear()
  gl.render(resources.blurScene, resources.blurCamera)
  gl.setRenderTarget(null)
}
