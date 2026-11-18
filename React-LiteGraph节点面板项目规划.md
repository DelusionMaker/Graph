# React + LiteGraph 节点面板复刻项目规划

> **版本**：v1.0  
> **日期**：2026-11-18  
> **状态**：待评审  
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

### 1.3 范围外（Out of Scope）

- 后端执行引擎（Python / PyTorch 推理）——本项目仅交付前端面板。
- 真实 AI 模型推理与 GPU 计算。
- 与 ComfyUI 官方 API 的完全兼容（v1 仅保证**数据格式相似**与**概念一致**）。
- 多人实时协同、云端存储。
- 移动端触控的完整支持（v1 以桌面端为主要目标，移动端保证"可查看、不崩坏"）。

### 1.4 高层成功标准

1. 熟悉 ComfyUI 的用户可在 **5 分钟内**完成"添加节点 → 连线 → 调参 → 导出 JSON"全流程。
2. **100 节点**工作流下，平移/缩放/连线拖拽保持 **≥ 50fps**（桌面 Chrome，中端设备）。
3. 刷新页面后工作流可完整恢复（节点位置、参数、连线、选择状态）。

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
| 图引擎 | LiteGraph.js（`@comfyorg/litegraph` 或官方 npm 包） | 提供成熟的图模型、画布渲染与交互；ComfyUI 同款 |
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

**关键原则**：**视口状态只有一份**（scale/offset），LiteGraph 的 `ds` 与 React 覆盖层的 CSS `transform` 由同一状态派生，杜绝漂移。

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
| `NodeView` | 单个节点的完整 UI，含拖拽手柄与端口热区 | `node`, `selected`, `onMove`, `onPortDown` |
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
    const lgraphCanvas = new LGraphCanvas(canvas, graph, {
      autoresize: true,
      show_grids: true,
      render_shadows: false,
    })

    // 关键：关闭 LiteGraph 原生节点绘制，仅保留连线与画布
    lgraphCanvas.render_shadows = false
    // 通过覆盖 drawNode 的方式跳过节点本体（具体 API 依版本而定）
    
    graphRef.current = graph
    onReady?.({ graph, lgraphCanvas })

    return () => {
      lgraphCanvas.clear()
      graph.clear()
      graphRef.current = null
    }
  }, [onReady])

  return <canvas ref={canvasRef} className="litegraph-canvas" />
}
```

> **待验证点**：LiteGraph 不同版本对"只绘制连线、不绘制节点"的支持程度不同。备选方案是让 LiteGraph 绘制节点背景（作为视觉底座），React 节点层透明叠加其上——此时需关闭 React 节点的背景色。此决策应在阶段 1 通过技术 Spike 确定。

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

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  setViewport: (v) => set({ viewport: v }),
  syncFromLiteGraph: (graph, canvas) => {
    const { scale, offset } = canvas.ds
    const nodes = graph.nodes.map(n => ({
      id: n.id as string,
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
    }}
  >
    {nodes.map(n => <NodeView key={n.id} node={n} />)}
  </div>
)
```

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

### 5.4 节点类型注册

```ts
import { LiteGraph } from '@comfyorg/litegraph'

LiteGraph.registerNodeType('model/LoadCheckpoint', class LoadCheckpoint {
  title = 'Load Checkpoint'
  inputs = []
  outputs = [
    { name: 'MODEL', type: 'MODEL' },
    { name: 'CLIP',  type: 'CLIP' },
    { name: 'VAE',   type: 'VAE' },
  ]
  constructor() {
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
  id: string
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

// 连线：[link_id, 源节点, 源槽位, 目标节点, 目标槽位, 类型]
type UILink = [number, string, number, string, number, PortType]

// 执行格式
type PromptAPI = Record<string, {
  class_type: string
  inputs: Record<string, [string, number] | unknown>
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
    for (const port of node.inputs) {
      if (port.link == null) continue
      const link = linkMap.get(port.link)
      if (link) inputs[port.name] = [link[1], link[2]]
    }
    node.widgets_values.forEach((v, i) => {
      inputs[node.inputs[i]?.name ?? `widget_${i}`] = v
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
- 版本字段：在 `config` 中写入 `schema_version`，便于后续迁移。

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
| **0. 技术 Spike** | 第 1 周 | 验证 LiteGraph 与 React 共存可行性 | 搭建 Vite+React+TS；运行最小 LGraph；验证"隐藏原生节点绘制、React 覆盖层同步坐标"；确定集成模式 A/B | 可运行 Spike + 技术决策记录 | 画布平移缩放时，React 节点与连线对齐误差 < 2px |
| **1. 画布基座** | 第 2–3 周 | 完成画布核心交互 | 初始化封装、视口同步、平移缩放、框选、多节点拖拽、连线创建/删除 | 画布组件 + 桥接层 v1 | 完成第 2.3 节全部画布交互 |
| **2. 节点系统** | 第 4–5 周 | 节点 UI 与类型系统 | NodeView/Widget 组件、端口渲染、类型校验、节点注册机制、节点库侧栏 | 节点组件库 + 类型注册 API | 可添加 5 种示例节点并正确连线 |
| **3. 数据与状态** | 第 6–7 周 | 序列化与状态能力 | 双格式模型与转换器、JSON 导入导出、localStorage 持久化、撤销/重做 | 数据层 + 单元测试 | 导出再导入后图完全一致；撤销/重做正确 |
| **4. 视觉与完善** | 第 8 周 | 产品化打磨 | 主题系统、LOD、迷你地图、检查器面板、响应式、无障碍 | 完整 UI | 主题切换无状态丢失；100 节点 ≥ 50fps |
| **5. 验收与文档** | 第 9 周 | 交付 | 全流程测试、性能 Profile、README、示例工作流 | 发布版本 + 文档 | 通过第 11 节全部验收标准 |

> 周期为参考估算，按 1 名熟悉 React 的开发者、每周 5 个工作日计。若并行开发或团队规模变化需重新排期。

---

## 10. 关键风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| LiteGraph 版本 API 差异，隐藏原生节点绘制困难 | 中 | 高 | 阶段 0 Spike 优先验证；准备"透明覆盖"备选方案（React 节点无背景，LiteGraph 画底座） |
| 视口坐标不同步导致节点与连线错位 | 中 | 高 | 强制单一视口状态；编写坐标转换单元测试；提供调试可视化 |
| React 频繁重渲染拖慢画布 | 高 | 中 | 节点组件 `React.memo`；Zustand 细粒度订阅；LOD 低缩放降级 |
| 拖拽与画布事件冲突（React DOM vs Canvas） | 中 | 中 | 明确事件委托边界：节点拖拽由 React 处理，空白处由 Canvas 处理；`pointer-events` 分层 |
| 端口命中测试在缩放后偏移 | 中 | 中 | 统一使用模型坐标做命中计算；缩放变更时重新采样 |
| localStorage 容量与版本迁移 | 低 | 中 | 限制存储大小；`schema_version` 字段 + 迁移函数 |
| 执行格式转换器边界情况（widget 与 input 名冲突） | 中 | 低 | 为 widget 生成唯一键；编写覆盖性单元测试 |

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

### 11.3 兼容性与质量验收

- [ ] Chrome / Edge / Firefox 最新两版本功能一致。
- [ ] 亮/暗主题切换无状态丢失、无视觉错位。
- [ ] 1280px 与 1920px 宽度下布局无溢出。
- [ ] 核心数据转换函数单元测试覆盖率 ≥ 80%。
- [ ] 无控制台错误与未处理 Promise rejection。

---

## 12. 后续演进方向（v2+ 参考）

- 接入真实执行后端（参考 ComfyUI 的 `POST /prompt` + WebSocket 模式）。
- 节点内集成 WebGL/WebGPU 预览（复用共享渲染上下文）。
- 子图（Subgraph）与节点组复用。
- 执行状态可视化（节点进度条、缓存命中标记）。
- 快捷键系统、命令面板（Ctrl+K 搜索节点与命令）。

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
- ComfyUI 官方文档：Nodes 2.0 架构说明
- ComfyUI 工作流元数据文档（workflow / prompt 双字段设计）
