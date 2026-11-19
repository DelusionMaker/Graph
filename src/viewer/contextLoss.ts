import type { WebGLRenderer } from 'three'

/**
 * WebGL 上下文丢失/恢复处理。
 * - lost：必须 preventDefault，否则浏览器不会尝试恢复；
 * - restored：触发重编译并请求一帧，材质与 Composer 由 three/R3F 重建。
 */
export function installContextLossHandling(gl: WebGLRenderer, onRestored: () => void): () => void {
  const canvas = gl.domElement

  const handleLost = (event: Event) => {
    event.preventDefault()
    console.warn('[viewer] WebGL 上下文丢失，等待恢复')
  }

  const handleRestored = () => {
    console.warn('[viewer] WebGL 上下文已恢复，重新编译')
    onRestored()
  }

  canvas.addEventListener('webglcontextlost', handleLost, false)
  canvas.addEventListener('webglcontextrestored', handleRestored, false)

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost)
    canvas.removeEventListener('webglcontextrestored', handleRestored)
  }
}
