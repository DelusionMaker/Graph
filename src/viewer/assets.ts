import {
  ClampToEdgeWrapping,
  DataTexture,
  EquirectangularReflectionMapping,
  LinearFilter,
  MirroredRepeatWrapping,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'

/** 本模块创建、需要显式回收的 blob URL */
const modelUrls = new Set<string>()
/** assetId → blob URL（scene/Mesh 的 assetId 通过这里解析） */
const assetUrls = new Map<string, string>()
/** assetId → 纹理（shader/Texture 通过这里解析） */
const textures = new Map<string, Texture>()

let fallbackTexture: DataTexture | null = null

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

/** 把 assetId 绑定到模型 URL（scene/Mesh 的 assetId 使用） */
export function registerAsset(id: string, url: string): void {
  assetUrls.set(id, url)
}

export function resolveAsset(id: string): string | null {
  return assetUrls.get(id) ?? null
}

/** 解析模型地址：先查 assetId 映射，再允许直接传 blob URL */
export function resolveModelUrl(assetId: string): string | null {
  if (!assetId) return null
  const mapped = resolveAsset(assetId)
  if (mapped) return mapped
  return assetId.startsWith('blob:') ? assetId : null
}

export function revokeAsset(id: string): void {
  const url = assetUrls.get(id)
  if (!url) return
  revokeModelUrl(url)
  assetUrls.delete(id)
}

/** 注册纹理资源 */
export function registerTexture(id: string, texture: Texture): void {
  const previous = textures.get(id)
  if (previous && previous !== texture) previous.dispose()
  textures.set(id, texture)
}

/** 把节点的 wrap / flipY 设置应用到纹理 */
export function applyTextureSettings(
  texture: Texture,
  wrap: 'repeat' | 'clamp' | 'mirror',
  flipY: boolean,
): void {
  const mode =
    wrap === 'clamp'
      ? ClampToEdgeWrapping
      : wrap === 'mirror'
        ? MirroredRepeatWrapping
        : RepeatWrapping

  if (texture.wrapS !== mode) {
    texture.wrapS = mode
    texture.needsUpdate = true
  }
  if (texture.wrapT !== mode) {
    texture.wrapT = mode
    texture.needsUpdate = true
  }
  if (texture.flipY !== flipY) {
    texture.flipY = flipY
    texture.needsUpdate = true
  }
}

/** 从本地图片创建纹理并注册到 assetId */
export function loadTexture(
  id: string,
  file: File,
  options: { wrap: 'repeat' | 'clamp' | 'mirror'; flipY: boolean },
): Promise<Texture> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    new TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace
        applyTextureSettings(texture, options.wrap, options.flipY)
        registerTexture(id, texture)
        URL.revokeObjectURL(url)
        resolve(texture)
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(url)
        reject(error instanceof Error ? error : new Error('纹理加载失败'))
      },
    )
  })
}

/** 从本地 .hdr 文件加载等距柱状环境贴图并注册到 assetId */
export function loadHdrTexture(id: string, file: File): Promise<Texture> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    new RGBELoader().load(
      url,
      (texture) => {
        texture.mapping = EquirectangularReflectionMapping
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        texture.generateMipmaps = false
        texture.wrapS = ClampToEdgeWrapping
        texture.wrapT = ClampToEdgeWrapping
        texture.needsUpdate = true
        registerTexture(id, texture)
        URL.revokeObjectURL(url)
        resolve(texture)
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(url)
        reject(error instanceof Error ? error : new Error('HDR 贴图加载失败'))
      },
    )
  })
}

/** 纹理未加载时回退到 1×1 白色贴图，不阻断渲染 */
export function resolveTexture(id: string): Texture {
  const hit = textures.get(id)
  if (hit) return hit
  if (!fallbackTexture) {
    fallbackTexture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    fallbackTexture.needsUpdate = true
  }
  return fallbackTexture
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
    if (
      value &&
      typeof value === 'object' &&
      'isTexture' in value &&
      (value as Texture).isTexture
    ) {
      ;(value as Texture).dispose()
    }
  }
  material.dispose()
}
