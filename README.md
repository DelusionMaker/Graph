# React + LiteGraph 节点编辑器

按《React-LiteGraph节点面板项目规划》实现的 Web 节点编辑器。当前处于 **阶段 1：画布基座**——LiteGraph 负责图模型与画布交互，React 渲染节点 DOM 与外围 UI。

## 环境

- Node.js 24+
- npm 11+

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:5173 。中央是画布，右侧是仅开发环境可见的验证面板。

构建检查：

```bash
npm run build
```

自动验证（需先启动 dev server）：

```bash
npm run verify:canvas
```

## 当前能力（阶段 1）

| 交互 | 说明 |
|---|---|
| 缩放 | 滚轮以鼠标位置为中心缩放，范围 0.2x–3x |
| 平移 | 中键拖拽 |
| 框选 | 空白处左键拖拽 |
| 移动节点 | 拖动节点标题栏；多选后拖动其中一个，整组保持相对位置 |
| 连线 | 从输出端口拖到输入端口；端口热区 `pointer-events: none`，事件穿透到 canvas |
| 删除连线 | 点击连线使其高亮（蓝色），按 Delete/Backspace |
| 选中高亮 | LiteGraph 选择集 → Zustand → React 节点描边 |

右侧「开发验证」面板可手动测量几何偏差与原生绘制隐藏情况；`window.__graphDebug` 提供同一套测量接口供自动化脚本调用（仅开发构建挂载）。

## 验证口径

`npm run verify:canvas` 共 31 项检查：

- **几何**：0.2x / 1x / 3x 三档缩放且各带不同平移量，端口圆心与节点框偏差均 < 2px；节点包围盒与 DOM 对齐 < 1px；
- **原生绘制**：对比"节点在画布内 / 临时移出画布"两帧的 canvas 像素差异（0%），并用反证用例确认恢复 `drawNode` 后差异为 100%；
- **交互**：端口拖拽连线、状态栏同步、端口连接态、中键平移、滚轮缩放后连线端点贴合端口（读 canvas 像素，实测 < 2px）、点击选中连线、Delete 删除、点击选中节点、框选提示框跟随指针（< 2px）、框选同步、多选拖拽、拖动实时跟随；
- **回归**：节点上方空白处框选不误选；
- **稳定性**：无页面异常。

## LiteGraph 0.17.2 API 核实记录

以 `node_modules/@comfyorg/litegraph/dist/*.d.ts` 与可运行代码为准：

| 项 | 正确写法 |
|---|---|
| 画布构造 | `new LGraphCanvas(canvas, graph, { autoresize: true })`，第三参数是 options 对象，支持 `skip_events` / `viewport` / `skip_render` / `autoresize` |
| 导航模式 | `LiteGraph.canvasNavigationMode = 'standard'`：空白左键框选、中键平移。默认 `'legacy'` 是左键平移、Ctrl+左键框选 |
| 滚轮 | `'standard'` 模式下原生只处理 Ctrl+滚轮；普通滚轮自行调 `ds.changeScale(scale, [clientX, clientY])` |
| 注册节点 | `LiteGraph.registerNodeType(type, class extends LGraphNode)`，构造函数须 `super(title)` |
| 添加端口 | `this.addInput(name, type)` / `this.addOutput(name, type)` |
| Widget | `addWidget(type, name, value, callback, options)` —— 仍是**位置参数**，不是对象参数 |
| 槽位起点 | `static slot_start_y = LiteGraph.NODE_TITLE_HEIGHT` |
| 端口坐标 | `node.getInputPos(i)` / `node.getOutputPos(i)`，返回图坐标；React 侧直接复用（减去 `node.pos` 得到节点内偏移） |
| 选择集 | `canvas.selectedItems`（含节点/组/reroute）；`selected_nodes` 已废弃 |
| 连线命中 | 无公开 API。用渲染时缓存的 `link.path`（`Path2D`）配合 `ctx.isPointInStroke(path, x, y)`，命中容差用 `lineWidth` 控制 |
| 连线菜单 | 点击连线中心会调用 `canvas.showLinkMenu`；本阶段覆写为空实现，改为"选中 + Delete" |
| 节点包围盒 | 默认 `measure()` 产出 `[pos.x, pos.y - NODE_TITLE_HEIGHT, w, h + NODE_TITLE_HEIGHT]`（标题栏在 pos 上方）；需与 React 节点对齐时覆写 `measure()` |
| 强制重绘 | `canvas.setDirty(fg, bg)` 只是打脏标记；需要同步出帧时调用 `canvas.draw(true, true)` |
| 视口 | `canvas.ds.offset` / `canvas.ds.scale`，变化回调 `canvas.ds.onChanged` |

> 注意：`@comfyorg/litegraph@0.17.2` 在 npm 上被标记为 deprecated，但仍是 latest tag。

## 关键实现决策

1. **事件同步时机**：LiteGraph 的 Pointer 在 canvas 的 capture 阶段处理 `pointerdown` 并 `stopImmediatePropagation`，冒泡阶段收不到；`pointerup` 也有 `stopPropagation`。桥接层在 capture 阶段监听 `pointerup`，用 `requestAnimationFrame` 延后一帧同步，确保读到连线落点完成后的状态。"按下位置"改在 `window` 的 capture 阶段记录，否则拿不到。
2. **拖动实时性**：原生节点绘制关闭后，React 节点必须在拖动过程中实时跟随。`pointermove` 用 capture 监听 + rAF 合并；store 用 `updateNodePositions` 做增量更新，未变节点保持引用不变，配合 `React.memo(NodeView)` 避免全量重渲染。否则会出现"拖动时节点不动、松手瞬移"。
3. **未启用 StrictMode**：LiteGraph 是命令式引擎，`unbindEvents()` 不会移除全部监听器；StrictMode 的双挂载会留下旧实例的监听器。因此 `main.tsx` 没有包裹 `StrictMode`。
4. **几何不复刻公式**：端口圆心由同步时读取 `getInputPos` / `getOutputPos` 得到，而不是在 React 侧再写一遍 `(slot + 0.7) * NODE_SLOT_HEIGHT`。节点盒必须用 `outline` 而非 `border` 画描边——`border` 会把绝对定位子元素的坐标原点推移 1px，实测导致端口偏差 1.41px。
5. **视口变换顺序**：`DragAndScale.toCanvasContext()` 是 `ctx.scale(s)` 再 `ctx.translate(offset)`，屏幕坐标 = `(图坐标 + offset) * zoom`。React 覆盖层必须写成 `scale(zoom) translate(x, y)`（CSS 从右往左作用），写成 `translate(...) scale(...)` 时 offset 不参与缩放，缩放后节点相对连线漂移 `offset * (1 - zoom)` 像素。测量代码同理不能自己复刻公式，`measure.ts` 直接调用 `ds.convertOffsetToCanvas()`。
6. **连线选中自实现**：0.17.2 的 `deleteSelected()` 只处理节点/组/reroute，不处理连线，也没有连线命中测试。桥接层用 `link.path` + `isPointInStroke` 做命中，选中后改 `link.color` 高亮，Delete 时 `graph.removeLink()`，再走统一快照同步。
7. **节点包围盒对齐 DOM**：LiteGraph 原生节点把标题栏画在 `pos` 上方，包围盒从 `pos.y - 30` 开始；本项目 `pos` 就是节点可见左上角，标题栏在框内。所有节点继承 `EditorNode` 并覆写 `measure()`，让 `boundingRect = [pos.x, pos.y, size.w, size.h]`。否则框选矩形、点击命中、节点剔除都会整体上移 30px——表现为"在节点上方空白处框选也会选中它"。
8. **框选提示框由 React 绘制**：LiteGraph 的矩形按 `safeOffset * devicePixelRatio` 绘制，但画布缓冲区并不按 DPR 放大（`resize()` 直接取父容器 `offsetWidth`），浏览器/系统缩放后矩形会整体放大偏移；而且它画在 canvas 上会被 React 节点遮住。桥接层在框选期间把矩形换算成画布内 CSS 坐标写入 store，由 `SelectionBox` 覆盖在节点之上，同时临时隐藏原生矩形。

## 项目结构

```
src/
├── main.tsx                    # React 入口
├── App.tsx                     # 头部 + 画布 + 状态栏
├── index.css                   # 主题变量与布局（flex）
├── vite-env.d.ts               # Vite 环境类型
├── graph/                      # 图引擎层（与 UI 解耦）
│   ├── types.ts                # 节点/连线/视口快照类型
│   ├── store.ts                # Zustand 镜像状态（视口 rAF 合并）
│   ├── geometry.ts             # 复用 LiteGraph 常量的尺寸配置
│   ├── EditorNode.ts           # 节点基类（包围盒与 React DOM 对齐）
│   ├── registerNodes.ts        # 示例节点注册（阶段 2 替换为节点注册机制）
│   ├── seed.ts                 # 示例图
│   ├── useLiteGraphBridge.ts   # 核心桥接：生命周期 + 视口/节点/连线/选中同步
│   ├── measure.ts              # 几何对齐与原生绘制测量
│   └── debug.ts                # 开发期 window.__graphDebug
├── components/
│   ├── GraphCanvas.tsx         # 画布容器（挂载桥接层）
│   ├── NodeOverlay.tsx         # React 节点覆盖层
│   ├── NodeView.tsx            # 单节点 DOM
│   ├── SelectionBox.tsx        # 框选提示框（React 绘制，位于节点之上）
│   ├── StatusBar.tsx           # 节点/连线/选中/缩放
│   └── DevPanel.tsx            # 开发验证面板（仅 DEV）
scripts/
└── verify-canvas.mjs           # 画布基座自动验证
```

## 后续阶段

阶段 2：节点 UI 与类型系统（Widget 渲染、端口类型校验、节点库侧栏）；阶段 3：双格式模型、导入导出、持久化、撤销重做。
