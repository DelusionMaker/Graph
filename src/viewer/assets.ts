import type { Material, Mesh, Object3D, Texture } from 'three'

/** 本模块创建、需要显式回收的 blob URL */
const modelUrls = new Set<string>()

/** 为一个 glTF 文件创建受管理的 blob URL */
export function createModelUrl(file: File): string {
  const url = URL.createObjectURL(file)
  modelUrls.add(url)
  return url
}

/** 释放模型 URL；只处理本模块创建的 URL，重复调用安全 */
export function revokeModelUrl(url: string | null): void {
  if (!url || !modelUrls.has(url)) return
  URL.revokeObjectURL(url)
  modelUrls.delete(url)
}

/** 递归释放 Object3D 的几何体、材质与贴图 */
export function disposeObject3D(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value && (value as Texture).isTexture) {
      ;(value as Texture).dispose()
    }
  }
  material.dispose()
}
