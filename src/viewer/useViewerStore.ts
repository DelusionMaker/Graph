import { create } from 'zustand'

export type MeshShape = 'box' | 'sphere' | 'torusknot' | 'gltf'
export type Frameloop = 'demand' | 'always'

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
}

interface ViewerState {
  /** 3D 视口相机状态，独立于节点图画布视口（canvas.ds） */
  camera: CameraState
  /**
   * 阶段 A 的模型兜底状态（工具条驱动）。
   * 阶段 D 起若图中存在 scene/Mesh 节点，则以该节点 widget 为准，这里只作为空图兜底。
   */
  shape: MeshShape
  gltfUrl: string | null
  gltfName: string | null
  modelScale: number
  /** R3F 帧循环：性能观察模式或存在 shader/Time 节点时为 always */
  frameloop: Frameloop
  perfMode: boolean
  /** 窄屏（< 1024px）下左栏抽屉是否展开 */
  dockOpen: boolean
  setCamera: (camera: CameraState) => void
  setShape: (shape: MeshShape) => void
  setGltf: (url: string | null, name?: string | null) => void
  setModelScale: (scale: number) => void
  setFrameloop: (frameloop: Frameloop) => void
  setPerfMode: (perfMode: boolean) => void
  setDockOpen: (dockOpen: boolean) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  camera: { position: [3, 2.4, 4.2], target: [0, 0, 0] },
  shape: 'box',
  gltfUrl: null,
  gltfName: null,
  modelScale: 1,
  frameloop: 'demand',
  perfMode: false,
  dockOpen: false,
  setCamera: (camera) => set({ camera }),
  setShape: (shape) => set({ shape }),
  setGltf: (gltfUrl, gltfName = null) => set({ gltfUrl, gltfName, shape: gltfUrl ? 'gltf' : 'box' }),
  setModelScale: (modelScale) => set({ modelScale }),
  setFrameloop: (frameloop) => set({ frameloop }),
  setPerfMode: (perfMode) => set({ perfMode, frameloop: perfMode ? 'always' : 'demand' }),
  setDockOpen: (dockOpen) => set({ dockOpen }),
}))
