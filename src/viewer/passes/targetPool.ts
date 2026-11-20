import { DepthTexture, WebGLRenderTarget } from 'three'

export interface DepthShadowTarget {
  target: WebGLRenderTarget
  dispose: () => void
}

export function createDepthShadowTarget(size: number): DepthShadowTarget {
  const target = new WebGLRenderTarget(size, size)
  target.depthTexture = new DepthTexture(size, size)
  return {
    target,
    dispose: () => target.dispose(),
  }
}
