# React + LiteGraph 节点面板复刻项目规划

> **版本**：v1.2（按 LiteGraph 0.17.2 类型定义校准）  
> **日期**：2026-11-18  
> **状态**：待评审  
> **修订要点**：v1.1 基于通用 LiteGraph 知识修订，v1.2 依据 `@comfyorg/litegraph@0.17.2` 的 `.d.ts` 与可编译 Spike 回正两处 API（`LGraphCanvas` 构造仍为 options 对象、`addWidget` 仍为位置参数）；锁定版本；明确事件归属与端口几何一致性；修正 `toPromptAPI` 覆盖缺陷与 id 类型；补充导入校验、阶段 0 量化验证清单与测试策略。
> **定位**：在 Web 端复刻 ComfyUI 风格的可视化节点编辑器，以 React 构建 UI 层、LiteGraph.js 作为节点图引擎。

---

## 1. 项目目标与范围

### 1.1 项目目标

构建一个可运行的 Web 节点编辑器原型，具备与 ComfyUI 同级别的画布交互体验（平移、缩放、连线、框选、多节点操作），并采用 **React 负责 UI、LiteGraph 负责图与画布** 的分层架构。核心验证目标是：**证明 React 声明式 UI 与 LiteGraph 命令式画布可以稳定共存**，为后续接入真实执行后端留出清晰接口。

### 1.2 范围内（In Scope）

| 模块 | 具体内容 |
|---|---|
| 节点画布 | 平移、缩放、框选、多节点拖拽、连线创建/重连/删除、节点折叠、分组框（Frame） |
| 节点库 | 分类目录、关键字搜索、拖拽/点击添加节点 |
| 节点 UI | 标题栏、输入/输出端口、参数控件（widget）、执行状态指示、节点静音/旁路 |
| 数据模型 | UI 格式（含布局坐标）与执行格式（纯拓扑）双向转换，JSON 导入/导出 |
| 状态管理 | 选择集、撤销/重做、图持久化（localStorage） |
| 类型系统 | 端口类型校验、类型颜色编码、非法连接拦截 |
| 视觉 | 亮/暗主题、响应式侧栏、节点端口高亮 |
| 快捷键 | v1 仅实现撤销/重做、删除、保存等少数高频键（见 2.3）；**完整快捷键框架与命令面板属 v2** |

### 1.3 范围外（Out of Scope）

- 后端执行引擎（Python / PyTorch 推理）——本项目仅交付前端面板。
- 真实 AI 模型推理与 GPU 计算。
- 与 ComfyUI 官方 API 的完全兼容（v1 仅保证**数据格式相似**与**概念一致**）。
- 多人实时协同、云端存储。
- 移动端触控的完整支持（v1 以桌面端为主要目标，移动端保证"可查看、不崩坏"）。

### 1.4 高层成功标准

1. 熟悉 ComfyUI 的用户可在 **5 分钟内**完成"添加节点 → 连线 → 调参 → 导出 JSON"全流程。
2. **100 节点**工作流下，平移/缩放/连线拖拽保持 **≥ 50fps**（桌面 Chrome，中端设备）。
3. 刷新页面后工作流可完整恢复（节点位置、参数、连线、视口）；选择集属会话态，不持久化（见 7.1）。

---

## 2. 参考面板结构拆解

### 2.1 整体布局分区

| 区域 | 位置 | 职责 | 关键元素 |
|---|---|---|---|
| 顶部工具栏 | 顶部固定，高 48px | 全局操作 | Logo、新建/打开/保存、撤销/重做、主题切换、运行按钮、队列状态 |
| 节点库侧栏 | 左侧，宽 260px，可折叠 | 节点发现与添加 | 搜索框、分类树、节点卡片（含图标与描述） |
| 画布区 | 中央，占据剩余空间 | 节点编辑主战场 | LiteGraph Canvas、React 节点覆盖层、网格背景、迷你地图 |
| 属性/检查器面板 | 右侧，宽 300px，可折叠 | 选中节点的详细参数编辑 | 参数表单、节点元数据、类型说明 |
| 底部状态栏 | 底部固定，高 32px | 状态反馈 | 节点数/连线数、缩放比例、当前模式、提示信息 |

### 2.2 节点结构拆解

| 部位 | 说明 | 实现归属 |
|---|---|---|
| 标题栏 | 节点名称、折叠按钮、状态色条 | React DOM（可含图标） |
| 输入端口 | 左侧圆点 + 标签，按类型着色 | LiteGraph Canvas 绘制端口圆点；React 渲染标签 |
| 输出端口 | 右侧圆点 + 标签 | 同上 |
| Widget 区 | 滑块、下拉、文本框、颜色选择等 | React DOM（核心决策：见第 3 节） |
| 预览区 | 图像/数值预览缩略 | React DOM（可接 Canvas/WebGL） |
| 状态指示 | 执行中/成功/错误/缓存命中 | React DOM（边框色 + 角标） |

### 2.3 交互清单

| 交互动作 | 触发方式 | 预期反馈 |
|---|---|---|
| 平移画布 | 中键拖拽 / 空格 + 左键 / 空白处左键拖拽 | 画布与节点同步移动 |
| 缩放画布 | 滚轮 | 以鼠标位置为中心缩放，范围 0.2x–3x |
| 添加节点 | 从侧栏拖拽到画布 / 双击画布搜索 | 节点出现在鼠标位置，自动选中 |
| 创建连线 | 从输出端口按下拖拽到输入端口松开 | 预览虚线 → 贴合后吸附高亮 → 生成连线 |
| 删除连线 | 选中连线后 Delete / 右键菜单 | 连线移除，两端端口恢复 |
| 框选节点 | 空白处左键拖拽（框选模式） | 框内节点高亮 |
| 多选拖拽 | Shift + 点击 / 框选后拖拽 | 选中节点整体移动，保持相对位置 |
| 折叠节点 | 点击标题栏折叠按钮 | 隐藏 widget 区，仅保留端口 |
| 撤销/重做 | Ctrl/Cmd + Z / Ctrl/Cmd + Shift + Z | 图状态回滚/前进 |

---

## 3. 技术选型与架构决策

### 3.1 技术栈

| 层级 | 选型 | 理由 |
|---|---|---|
| UI 框架 | React 18/19 + TypeScript | 团队既有能力；类型安全对节点端口/数据模型至关重要 |
| 构建工具 | Vite | 快速 HMR，适合高频 UI 迭代 |
| 图引擎 | `@comfyorg/litegraph@0.17.2`（已锁定；npm 标记 deprecated 但仍为 latest） | 提供成熟的图模型、画布渲染与交互。**风险提示**：LiteGraph 各版本 API 差异显著，所有 API 用法以锁定版本的 `.d.ts` 为准（见 5.1 / 5.4 核实记录），禁止跨版本照抄示例 |
| 状态管理 | Zustand | 轻量、无 Provider 嵌套、与命令式引擎桥接简单 |
| 样式 | CSS Modules + CSS 变量（或 Tailwind CSS） | 主题切换友好，避免全局污染 |
| 图标 | Lucide React | 轻量、Tree-shaking 友好 |

### 3.2 LiteGraph 集成模式对比

| 模式 | 描述 | 优点 | 缺点 | 适用 |
|---|---|---|---|---|
| **A. 画布主导** | LiteGraph 独占 canvas，widget 用 LiteGraph 内置 `addWidget`（canvas 绘制） | 最简单、性能最佳、交互开箱即用 | 节点内无法使用富 React 组件；样式受限于 canvas 绘制 | MVP 快速验证 |
| **B. React 覆盖层**（推荐） | LiteGraph 管图模型/连线/画布交互；React 渲染节点主体为 DOM 覆盖层 | 节点内可用任意 React 组件；完整 CSS 能力；支持 IME | 坐标同步与命中测试需自行桥接 | 目标架构 |
| **C. 完全自研** | 弃用 LiteGraph，纯 React + Canvas/WebGPU | 完全可控 | 成本高、重复造轮子 | 不推荐（违背需求） |

### 3.3 推荐架构：分层混合

采用 **模式 B 为目标、模式 A 为可回退基线** 的渐进路线：

- **LiteGraph 负责**：`LGraph` 数据模型、连线绘制、网格与背景、画布平移缩放、端口命中测试、选择框。
- **React 负责**：节点主体 DOM（标题、widget、状态）、全部面板、工具栏、主题。
- **桥接层负责**：坐标同步（单一视口状态）、事件转发、数据双向绑定。

**三条不可妥协的关键原则**：

1. **视口状态只有一份**（scale/offset）：LiteGraph 的 `ds` 与 React 覆盖层的 CSS `transform` 由同一状态派生，杜绝漂移。视口更新用 `requestAnimationFrame` 合并，避免与 LiteGraph 渲染循环互相触发。
2. **事件归属唯一**：节点 widget / 标题栏由 React 处理；**端口拖拽连线归 LiteGraph**——端口热区必须 `pointer-events: none` 让事件穿透到 canvas（见 5.1/5.2）；空白处画布交互归 LiteGraph。禁止两边同时响应同一事件。
3. **几何常量单一来源**：标题栏高度、槽位间距、端口圆点位置等尺寸由共享配置提供，React DOM 与 LiteGraph 内部绘制必须读取同一份常量。节点整体对齐但连线端点偏离端口圆点，是本项目最隐蔽的错位风险。

---

## 4. React 组件划分

### 4.1 组件树

```
<App>
├── <Toolbar />                      # 顶部工具栏
├── <div className="workspace">
│   ├── <NodeLibrary />              # 左侧节点库
│   ├── <CanvasWorkspace>            # 画布容器（核心）
│   │   ├── <LiteGraphCanvas />      # 画布：canvas 元素 + LiteGraph 实例
│   │   ├── <NodeOverlay />          # React 节点覆盖层
│   │   │   └── <NodeView /> × N     # 单个节点
│   │   │       ├── <NodeHeader />
│   │   │       ├── <PortRow />      # 输入/输出端口标签
│   │   │       ├── <WidgetPanel />  # 参数控件区
│   │   │       │   └── <Widget /> × M
│   │   │       └── <NodeStatus />
│   │   ├── <MiniMap />              # 迷你地图（可选）
│   │   └── <CanvasContextMenu />    # 右键菜单
│   ├── <InspectorPanel />           # 右侧属性面板
│   └── <StatusBar />
├── <ToastHost />                    # 全局提示
└── <ModalHost />                    # 对话框（新建/导入/设置）
```

### 4.2 核心组件职责

| 组件 | 职责 | 关键 Props / State |
|---|---|---|
| `LiteGraphCanvas` | 创建/销毁 `LGraph` 与 `LGraphCanvas`，绑定原生事件，转发给桥接层 | `graph`, `onViewportChange`, `onGraphChange` |
| `NodeOverlay` | 根据视口状态渲染所有可见节点，处理节点级事件委托 | `visibleNodes`, `viewport` |
| `NodeView` | 单个节点的完整 UI，标题栏为拖拽手柄；**端口热区 `pointer-events: none`，连线事件归 LiteGraph** | `node`, `selected`, `onMove`, `onWidgetChange` |
| `Widget` | 参数控件分发器（text/number/slider/combo/color/boolean） | `schema`, `value`, `onChange` |
| `useLiteGraphBridge` | **核心 Hook**：LiteGraph ↔ Zustand 双向同步 | 见第 5 节 |

---

## 5. LiteGraph 集成方式

### 5.1 初始化流程

```ts
// LiteGraphCanvas.tsx（核心骨架）
import { useEffect, useRef } from 'react'
import { LGraph, LGraphCanvas } from '@comfyorg/litegraph'

export function LiteGraphCanvas({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const graphRef = useRef<LGraph | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const graph = new LGraph()
    // 0.17.2：第三参数是 options 对象，仅支持 skip_events / viewport / skip_render / autoresize
    const lgraphCanvas = new LGraphCanvas(canvas, graph, { autoresize: true })

    // 视觉配置是实例属性，构造后赋值；0.17.2 没有 show_grids 属性
    lgraphCanvas.render_shadows = false

    // 关闭原生节点绘制：只 arrange() 维持槽位坐标，不画节点本体
    lgraphCanvas.drawNode = (node) => { node.arrange() }

    graphRef.current = graph
    onReady?.({ graph, lgraphCanvas })

    return () => {
      graph.stop()
      lgraphCanvas.clear()
      graph.clear()
      graphRef.current = null
    }
  }, [onReady])

  return <canvas ref={canvasRef} className="litegraph-canvas" />
}
```

> **阶段 0 必须验证的三个点**：
> 1. **隐藏原生节点绘制**的可行性。不同版本支持程度不同；备选方案是让 LiteGraph 绘制节点背景（视觉底座），React 节点层透明叠加（关闭 React 节点背景色）。
> 2. **事件穿透**：React 端口热区设 `pointer-events: none` 后，LiteGraph 能否正常从端口发起连线。若不成立，需切换为 React 全权接管连线（复杂度显著上升），此决策必须在阶段 0 定案。
> 3. **几何对齐**：连线端点与 React 端口圆心的偏差 < 2px，且标题栏高度 / 槽位间距来自同一份共享常量。
>
> 注：原文将此项列为"阶段 1 确定"，实际它是架构可行性的前提，必须前移至阶段 0。

### 5.2 桥接层设计（核心）

```ts
// useLiteGraphBridge.ts — 单一视口状态 + 双向同步
import { create } from 'zustand'

interface Viewport { x: number; y: number; zoom: number }

interface GraphState {
  nodes: NodeSnapshot[]          // React 侧的节点镜像
  viewport: Viewport
  setViewport: (v: Viewport) => void
  syncFromLiteGraph: (graph: LGraph, canvas: LGraphCanvas) => void
}

let viewportFrame = 0
let pendingViewport: Viewport | null = null

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  // 视口高频更新用 rAF 合并，避免平移时每帧触发 React commit
  setViewport: (v) => {
    pendingViewport = v
    if (viewportFrame) return
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = 0
      if (pendingViewport) set({ viewport: pendingViewport })
      pendingViewport = null
    })
  },
  syncFromLiteGraph: (graph, canvas) => {
    const { scale, offset } = canvas.ds
    const nodes = graph.nodes.map(n => ({
      id: n.id as number,
      type: n.type,
      pos: [n.pos[0], n.pos[1]] as [number, number],
      size: [n.size[0], n.size[1]] as [number, number],
      title: n.title,
      inputs: n.inputs?.map(i => ({ name: i.name, type: i.type, link: i.link })) ?? [],
      outputs: n.outputs?.map(o => ({ name: o.name, type: o.type, links: o.links })) ?? [],
      values: n.widgets?.map(w => w.value) ?? [],
    }))
    set({ nodes, viewport: { x: offset[0], y: offset[1], zoom: scale } })
  },
}))
```

**React 覆盖层应用同一视口变换**：

```tsx
// NodeOverlay.tsx
const { nodes, viewport } = useGraphStore()
return (
  <div
    className="node-overlay"
    style={{
      transformOrigin: '0 0',
      transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
      // 容器不吃事件，空白区域穿透到 canvas；仅 widget / 标题栏热区开启 auto
      pointerEvents: 'none',
    }}
  >
    {nodes.map(n => <NodeView key={n.id} node={n} />)}
  </div>
)
```

> **事件分层**（承接 3.3 节原则 2）：`node-overlay` 容器 `pointer-events: none`；`WidgetPanel` / `NodeHeader` 设 `pointer-events: auto` 接收 React 交互；**端口圆点保持 `none`**，让 `mousedown` 穿透到 canvas 由 LiteGraph 发起连线。若端口需要 hover 高亮，由 React 读状态渲染，不拦截事件。

### 5.3 事件同步表

| 源 | 事件 | 同步动作 |
|---|---|---|
| LiteGraph | `onNodeMoved` / `onNodeDragged` | 更新 Zustand `nodes[i].pos`，React 节点重定位 |
| LiteGraph | `onNodeSelected` / `onDeselect` | 更新 `selectedIds`，高亮 React 节点 |
| LiteGraph | `onLinkCreated` / `onLinkRemoved` | 更新 `links`，通知 React 端口状态 |
| LiteGraph | 画布平移/缩放（`ds` 变化） | 更新 `viewport`，同步 React 层 transform |
| React | 节点 widget 值变更 | 写回 `graph.nodes[i].widgets[j].value`，`canvas.setDirty(true)` |
| React | 节点标题栏拖拽 | 更新 `node.pos`，`canvas.setDirty(true)` |
| React | 属性面板编辑 | 同上 |

> 表中 `on*` 均为 `LGraphCanvas` 的实例属性（函数赋值），不是 EventEmitter 事件；具体可用名称须按锁定版本逐项核对。连线合法性校验统一走 `LGraph.isValidConnection`（见 6.3），不要在 React 层重复实现一套。
>
> **阶段 0 实测坑**：LiteGraph 在 **capture 阶段**处理 `pointerup` 并调用 `stopPropagation()`，冒泡阶段收不到该事件。桥接层必须在 capture 阶段监听，并用 `requestAnimationFrame` **延后一帧**再同步，否则会出现"连线已建立（`graph.links.size` 为 1）但 React 面板显示 0 条"的假失败。验证脚本见 `scripts/verify-spike.mjs`。
>
> **StrictMode**：LiteGraph 的命令式实例不适合 React StrictMode 双挂载（`unbindEvents()` 不会移除全部监听器），本项目不启用 StrictMode。

### 5.4 节点类型注册

```ts
import { LiteGraph, LGraphNode } from '@comfyorg/litegraph'

// 必须继承 LGraphNode，否则 addWidget / 端口相关方法均不可用
LiteGraph.registerNodeType('model/LoadCheckpoint', class LoadCheckpoint extends LGraphNode {
  static slot_start_y = LiteGraph.NODE_TITLE_HEIGHT

  constructor(title: string) {
    super(title)
    // 0.17.2 推荐用 addInput / addOutput，而不是类字段数组
    this.addOutput('MODEL', 'MODEL')
    this.addOutput('CLIP', 'CLIP')
    this.addOutput('VAE', 'VAE')
    // 0.17.2 的 addWidget 仍是位置参数形式（不是对象参数）
    this.addWidget('combo', 'ckpt_name', 'sd15.safetensors', () => {}, {
      values: ['sd15.safetensors', 'sdxl.safetensors'],
    })
  }
})
```

---

## 6. 节点与连线数据模型

### 6.1 双格式设计（借鉴 ComfyUI）

| 格式 | 用途 | 是否含布局 | 结构 |
|---|---|---|---|
| **UI 格式** | 保存到画布、恢复编辑状态 | 是 | `{ nodes: [], links: [], groups: [], config: {} }` |
| **执行格式** | 提交给后端、程序化生成 | 否 | `{ "1": { class_type, inputs } }` |

### 6.2 TypeScript 类型定义

```ts
// UI 格式
interface WorkflowUI {
  last_node_id: number
  last_link_id: number
  nodes: UINode[]
  links: UILink[]
  groups: UIGroup[]
  config: Record<string, unknown>
}

interface UINode {
  id: number                      // 与 LiteGraph node.id / last_node_id 保持一致，避免映射歧义
  type: string                    // 注册类型名，如 'model/LoadCheckpoint'
  title?: string
  pos: [number, number]
  size: [number, number]
  mode?: 0 | 1 | 2                // 0=正常, 1=静音, 2=旁路
  inputs: PortDef[]
  outputs: PortDef[]
  widgets_values: unknown[]
}

interface PortDef {
  name: string
  type: PortType
  link?: number | null            // 输入
  links?: number[]                // 输出（可多连）
}

interface UIGroup {
  id: number
  title: string
  pos: [number, number]
  size: [number, number]
  color?: string
  nodes?: number[]                // 组内节点 id，便于序列化还原
}

// 连线：[link_id, 源节点 id, 源槽位, 目标节点 id, 目标槽位, 类型]
type UILink = [number, number, number, number, number, PortType]

// 执行格式
type PromptAPI = Record<string, {
  class_type: string
  inputs: Record<string, unknown> // 连线值为 [nodeId, slot]，字面量直接写值
  _meta?: { title?: string }
}>

type PortType =
  | 'MODEL' | 'CLIP' | 'VAE' | 'CONDITIONING' | 'LATENT'
  | 'IMAGE' | 'MASK' | 'CONTROL_NET' | 'SIGMAS'
  | 'INT' | 'FLOAT' | 'STRING' | 'BOOLEAN' | '*'
```

### 6.3 端口类型系统

| 类型组 | 类型名 | 颜色（亮色主题） | 语义 |
|---|---|---|---|
| 模型 | `MODEL` `CLIP` `VAE` | 紫 / 青 / 橙 | 模型组件 |
| 数据 | `IMAGE` `LATENT` `MASK` | 绿 / 粉 / 灰 | 图像与潜变量 |
| 条件 | `CONDITIONING` `CONTROL_NET` | 蓝 / 深蓝 | 生成条件 |
| 基础 | `INT` `FLOAT` `STRING` `BOOLEAN` | 灰 / 灰 / 灰 / 灰 | 字面量 |
| 通配 | `*` | 白 | 任意类型 |

**连接校验规则**：
1. 类型相等，或任一端为 `*`，或配置中声明的兼容组（如 `INT` ↔ `FLOAT` 自动转换）；
2. 输出 → 输入的单向约束；
3. 禁止自环与环（执行阶段需 DAG，前端提前拦截）。

**实现落点**：统一在 `LGraph.isValidConnection(input, output)` 中实现上述三条，环检测用 DFS（注意大图上的性能），非法连接由 LiteGraph 原生拒绝；同时在该回调中触发 React 侧提示。不要在 React 层重复实现一套校验。

### 6.4 连接关系表示

- **UI 格式**：六元组 + 节点侧双向索引（`input.link` / `output.links`），便于 O(1) 查询与删除清理。
- **执行格式**：二元组 `[源节点 id, 输出槽位索引]` 作为输入值，字面量直接写值。

**转换器**（纯函数，需单元测试）：

```ts
export function toPromptAPI(ui: WorkflowUI): PromptAPI {
  const linkMap = new Map(ui.links.map(l => [l[0], l]))
  const result: PromptAPI = {}
  for (const node of ui.nodes) {
    if (node.mode !== 0) continue                  // 静音/旁路不入执行图
    const inputs: Record<string, unknown> = {}
    const connected = new Set<string>()

    for (const port of node.inputs) {
      if (port.link == null) continue
      const link = linkMap.get(port.link)
      if (link) {
        inputs[port.name] = [link[1], link[2]]
        connected.add(port.name)                   // 已连线：禁止 widget 值覆盖
      }
    }

    // widget 值仅在对应 input 未连线时写入；widgets_values 与 inputs 并非严格一一对应
    node.widgets_values.forEach((v, i) => {
      const name = node.inputs[i]?.name ?? `widget_${i}`
      if (!connected.has(name)) inputs[name] = v
    })

    result[node.id] = { class_type: node.type, inputs }
  }
  return result
}
```

---

## 7. 交互与状态管理方案

### 7.1 状态分层

| 状态域 | 存储位置 | 是否持久化 | 说明 |
|---|---|---|---|
| 图数据（节点/连线） | LiteGraph `LGraph` + Zustand 镜像 | 是 | 唯一真相源为 `LGraph`，Zustand 为渲染镜像 |
| 视口（scale/offset） | Zustand `viewport` | 是 | 由 LiteGraph `ds` 派生，驱动 React 层 transform |
| 选择集 | Zustand `selectedIds` | 否 | 由 LiteGraph 选择事件同步 |
| UI 状态（侧栏折叠/主题/面板） | Zustand `ui` | 部分 | 主题与侧栏状态持久化 |
| 执行状态（节点运行中/完成/错误） | Zustand `execution` | 否 | 预留接口，v1 可 mock |

### 7.2 交互事件流

```
用户操作
  → LiteGraph 原生事件（或 React DOM 事件）
  → 桥接层规范化为 GraphAction
  → Zustand dispatch
  → 更新镜像状态 + 写回 LGraph
  → canvas.setDirty(true) / React 重渲染
```

**原则**：UI 不直接修改 `LGraph`，统一经桥接层；避免双向写入导致状态分叉。

### 7.3 撤销/重做

采用 **命令模式 + 状态快照结合**：

- 对"添加/删除节点、创建/删除连线、批量移动、参数变更"记录 `UndoEntry { before, after, label }`。
- 高频操作（拖拽、滑块）在**操作结束时**合并为一条记录，避免历史爆炸。
- 历史栈上限 **50 条**，超出丢弃最早记录。
- `Ctrl+Z` / `Ctrl+Shift+Z` 触发，恢复时同时重置 `LGraph` 与 Zustand 镜像。

### 7.4 持久化

- 自动保存：图变更防抖 **1s** 后写入 `localStorage`（键 `node-editor:workflow:v1`）。
- 手动导出：下载 `workflow.json`（UI 格式）；支持"导出执行格式"。
- 导入：校验 JSON 结构 → 重建 `LGraph` → 同步 Zustand。
  - **三级校验**：① 结构完整性（必需字段存在且类型正确）；② 引用完整性（`inputs.link` / `outputs.links` 指向的 link 存在且两端节点存在）；③ 类型合法性（端口类型在 `PortType` 联合类型内）。
  - **失败策略**：① 级失败直接拒绝并提示；② 级失败丢弃悬空连线后导入并警告；③ 级失败按 `*` 通配类型降级并警告。禁止静默导入。
- 版本字段：在 `config` 中写入 `schema_version`，便于后续迁移；读取时按版本分派迁移函数。

---

## 8. 样式与响应式要求

### 8.1 主题系统

- 使用 CSS 变量定义主题令牌，如 `--bg-canvas`、`--node-bg`、`--port-model`、`--text-primary`。
- 亮/暗双主题通过根元素 `data-theme="light|dark"` 切换，LiteGraph 绘制颜色需从同一令牌读取（避免画布与 DOM 主题不一致）。
- 主题切换不得导致图数据丢失或视口重置。

### 8.2 节点视觉规范

| 元素 | 规格 |
|---|---|
| 节点宽度 | 默认 220px，可拖拽调整，最小 160px |
| 标题栏高度 | 28px |
| 端口圆点 | 直径 12px，选中时外发光 2px |
| Widget 行高 | 24px，间距 4px |
| 选中态 | 2px 主色边框 + 轻微阴影 |
| 静音态 | 整体透明度 0.6，加斜纹背景 |

> 上表尺寸（标题栏 28px、Widget 行高 24px、端口直径 12px）即为 3.3 节原则 3 所说的**共享几何常量**，必须同时驱动 React DOM 与 LiteGraph 内部槽位计算，不得各写一份。

### 8.3 缩放与响应式

- 画布缩放范围 **0.2x–3x**，以鼠标位置为中心。
- 低缩放（< 0.5x）时隐藏节点内文字与 widget，仅保留色块与端口（LOD 策略），降低 DOM 与绘制开销。
- 侧栏：宽度 ≥ 1280px 时常驻；< 1280px 可折叠为图标条；< 768px 默认隐藏，通过按钮唤出抽屉。
- 画布容器监听 `ResizeObserver`，变化时通知 `LGraphCanvas` 调整尺寸。

### 8.4 无障碍

- 工具栏与侧栏按钮提供 `aria-label`。
- 节点可通过 Tab 键聚焦（快捷键操作预留）。
- 颜色不作为唯一信息载体：端口同时提供文字类型标签。
- 尊重 `prefers-reduced-motion`，关闭非必要动画。

---

## 9. 开发阶段划分

| 阶段 | 周期 | 核心目标 | 关键任务 | 交付物 | 阶段验收 |
|---|---|---|---|---|---|
| **0. 技术 Spike** | **第 1–2 周** | 验证 LiteGraph 与 React 共存可行性 | 锁定 LiteGraph 版本；搭建 Vite+React+TS；运行最小 LGraph；逐项验证下方"阶段 0 验证清单"；确定集成模式 A/B | 可运行 Spike + 技术决策记录 + 几何常量共享配置 | 三项验证全部通过（见下方清单） |
| **1. 画布基座** | 第 3–4 周 | 完成画布核心交互 | 初始化封装、视口同步、平移缩放、框选、多节点拖拽、连线创建/删除 | 画布组件 + 桥接层 v1 | 完成第 2.3 节全部画布交互 |
| **2. 节点系统** | 第 5–6 周 | 节点 UI 与类型系统 | NodeView/Widget 组件、端口渲染、类型校验、节点注册机制、节点库侧栏 | 节点组件库 + 类型注册 API | 可添加 5 种示例节点并正确连线 |
| **3. 数据与状态** | 第 7–8 周 | 序列化与状态能力 | 双格式模型与转换器、JSON 导入导出、localStorage 持久化、撤销/重做 | 数据层 + 单元测试 | 导出再导入后图完全一致；撤销/重做正确 |
| **4. 视觉与完善** | 第 9 周 | 产品化打磨 | 主题系统、LOD、迷你地图、检查器面板、响应式、无障碍 | 完整 UI | 主题切换无状态丢失；100 节点 ≥ 50fps |
| **5. 验收与文档** | 第 10 周 | 交付 | 全流程测试、性能 Profile、README、示例工作流 | 发布版本 + 文档 | 通过第 11 节全部验收标准 |

> 周期为参考估算，按 1 名熟悉 React 的开发者、每周 5 个工作日计。阶段 0 由 1 周延长至 2 周：事件边界与几何对齐验证是架构可行性的前提，不可压缩；若并行开发或团队规模变化需重新排期。

**阶段 0 验证清单**（三项必须全部通过，任一失败即触发架构回退）：

| # | 验证项 | 方法 | 通过的量化标准 |
|---|---|---|---|
| 1 | 隐藏原生节点绘制 | 覆写 `drawNode` 后截图对比 | 画布只剩连线 / 网格，无 LiteGraph 原生节点残影；备选"透明覆盖"方案已就绪 |
| 2 | 事件穿透与连线 | 从 React 端口圆点按下拖到另一端口 | LiteGraph 正常生成连线、预览线可见；React 端口热区未拦截 `mousedown` |
| 3 | 几何对齐 | 0.2x / 1x / 3x 三档缩放下截图测量 | 节点整体对齐误差 < 2px；**连线端点与 React 端口圆心偏差 < 2px** |

> 原规划把"隐藏原生节点绘制"列为阶段 1 决策，实际它与事件边界共同决定模式 B 是否成立，必须前移至阶段 0。

---

## 10. 关键风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| LiteGraph 版本 API 差异，隐藏原生节点绘制困难 | 中 | 高 | 阶段 0 **锁定版本后校准全部 API**；Spike 优先验证；准备"透明覆盖"备选方案（React 节点无背景，LiteGraph 画底座） |
| 视口坐标不同步导致节点与连线错位 | 中 | 高 | 强制单一视口状态；视口更新用 rAF 合并；编写坐标转换单元测试；提供调试可视化 |
| React 频繁重渲染拖慢画布 | 高 | 中 | 节点组件 `React.memo`；Zustand 细粒度订阅；视口 transform 只作用于 overlay 容器、不下传到 NodeView；LOD 低缩放降级 |
| 拖拽与画布事件冲突（React DOM vs Canvas） | 中 | **高** | 明确事件归属：widget / 标题栏归 React，**端口拖拽连线与空白处归 Canvas**；`pointer-events` 分层，见 3.3 / 5.2 |
| React 镜像状态滞后于 LiteGraph 图状态 | 中 | 中 | `pointerup` 用 capture 阶段监听 + rAF 延后同步；调试时直接读 `graph.links.size` 而非只看 React 镜像 |
| 拖动节点时 React 节点不跟随、松手瞬移 | 高 | 中 | 原生节点绘制关闭后必须在 `pointermove` 实时同步位置（capture + rAF）；store 用增量更新 + `React.memo(NodeView)` 避免全量重渲染 |
| React 端口几何与 LiteGraph 内部槽位计算不一致 | 中 | **高** | 标题栏高度 / 槽位间距抽为共享常量，两侧读取同一份；阶段 0 验证连线端点与 React 端口圆心偏差 < 2px |
| 端口命中测试在缩放后偏移 | 中 | 中 | 统一使用模型坐标做命中计算；缩放变更时重新采样 |
| localStorage 容量与版本迁移 | 低 | 中 | 限制存储大小；`schema_version` 字段 + 迁移函数 |
| 执行格式转换器边界情况（widget 与 input 名冲突） | 中 | 低 | 已连线 input 跳过 widget 值写入（见 6.4）；编写覆盖性单元测试 |

---

## 11. 验收标准

### 11.1 功能验收

- [ ] 可从节点库添加至少 5 类节点，并按类型着色的端口正确连线。
- [ ] 非法连接（类型不匹配、输出→输出、环路）被拦截并给出提示。
- [ ] 平移/缩放/框选/多选拖拽/连线删除全部可用。
- [ ] JSON 导出（UI 格式与执行格式）结构正确，可重新导入还原。
- [ ] 撤销/重做覆盖节点增删、连线、移动、参数变更。
- [ ] 刷新页面后工作流完整恢复。

### 11.2 性能验收

- [ ] 100 节点工作流下，平移/缩放帧率 ≥ 50fps（桌面 Chrome，中端设备）。
- [ ] 添加/删除单节点 UI 响应时间 < 100ms。
- [ ] 画布与 React 覆盖层在 0.2x–3x 缩放全范围内对齐误差 < 2px。
- [ ] 连线端点与 React 端口圆心在 0.2x–3x 全范围内偏差 < 2px（几何一致性）。
- [ ] 拖动节点时 React 节点实时跟随，无松手瞬移或明显滞后。

### 11.3 兼容性与质量验收

- [ ] Chrome / Edge / Firefox 最新两版本功能一致。
- [ ] 亮/暗主题切换无状态丢失、无视觉错位。
- [ ] 1280px 与 1920px 宽度下布局无溢出。
- [ ] 核心数据转换函数单元测试覆盖率 ≥ 80%；坐标变换与 `toPromptAPI` 均有单测。
- [ ] 端口几何对齐至少有一条 E2E 用例（平移 / 缩放后测量端点与圆心偏差）。
- [ ] 无控制台错误与未处理 Promise rejection。

---

## 12. 后续演进方向（v2+ 参考）

- 接入真实执行后端（参考 ComfyUI 的 `POST /prompt` + WebSocket 模式）。
- 节点内集成 WebGL/WebGPU 预览（复用共享渲染上下文）。
- 子图（Subgraph）与节点组复用。
- 执行状态可视化（节点进度条、缓存命中标记）。
- 完整快捷键系统、命令面板（Ctrl+K 搜索节点与命令）——v1 仅保留少数高频键，见 1.2。

---

## 附录 A：关键术语

| 术语 | 含义 |
|---|---|
| LiteGraph | 开源 Canvas 节点图引擎，ComfyUI 早期前端采用 |
| `LGraph` / `LGraphCanvas` | LiteGraph 的图数据模型 / 画布控制器 |
| `ds` | DragAndScale，LiteGraph 的视口变换对象（scale + offset） |
| UI 格式 | 含坐标与布局的工作流 JSON，用于画布恢复 |
| 执行格式 | 纯拓扑的 prompt JSON，用于提交执行 |
| Widget | 节点内的参数控件 |
| LOD | Level of Detail，低缩放时简化渲染 |

## 附录 B：参考资源

- LiteGraph.js GitHub 仓库与示例
- ComfyUI 官方文档：Nodes 2.0 架构说明（**注意**：ComfyUI 新前端已演进到 Vue + 新渲染层；本项目复刻的是 LiteGraph 时代的工作流风格与交互，不追求与新前端技术栈一致）
- ComfyUI 工作流元数据文档（workflow / prompt 双字段设计）
