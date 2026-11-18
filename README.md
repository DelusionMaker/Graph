# React + LiteGraph 阶段 0 Spike

用于验证《React-LiteGraph节点面板项目规划》阶段 0 的三项核心假设：LiteGraph 与 React 覆盖层能否稳定共存。

## 环境

- Node.js 24+
- npm 11+

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:5173 。左侧是验证面板，右侧是画布。

构建检查：

```bash
npm run build
```

自动验证（需先启动 dev server）：

```bash
npm run verify:spike
```

该脚本会自动测量几何偏差、模拟端口拖拽连线，并检查 React 面板是否正确同步。

## 三项验证

### ① 隐藏原生节点绘制

`LiteGraphCanvas.tsx` 覆写了 `drawNode`，只调用 `node.arrange()` 维持槽位计算，不绘制节点本体。画布上应只剩网格与连线，节点主体由 React DOM 渲染。

### ② 事件穿透与连线

从 `Source` 节点的 MODEL 输出端口拖到 `Target` 节点的 MODEL 输入端口。整个 React 节点层是 `pointer-events: none`，事件穿透到 canvas，由 LiteGraph 原生处理连线。左侧面板的「连线数」从 0 变为 1 即通过。

### ③ 几何对齐

平移、缩放画布后点击左侧「测量偏差」按钮。程序会比较 LiteGraph 计算的连线端点（`getInputPos` / `getOutputPos`）与 React 端口圆心的屏幕坐标。最大偏差 < 2px 即通过。

## LiteGraph 0.17.2 API 核实记录

以 `node_modules/@comfyorg/litegraph/dist/*.d.ts` 为准，以下写法已在本 Spike 中验证可编译运行：

| 项 | 正确写法 |
|---|---|
| 画布构造 | `new LGraphCanvas(canvas, graph, { autoresize: true })`，第三参数是 options 对象，支持 `skip_events` / `viewport` / `skip_render` / `autoresize` |
| 网格开关 | 0.17.2 **没有** `show_grids` 属性；`render_shadows` 等视觉项是实例属性，构造后赋值 |
| 注册节点 | `LiteGraph.registerNodeType(type, class extends LGraphNode)`，构造函数须 `super(title)` |
| 添加端口 | `this.addInput(name, type)` / `this.addOutput(name, type)` |
| Widget | `addWidget(type, name, value, callback, options)` —— 仍是**位置参数**，不是对象参数 |
| 槽位起点 | `static slot_start_y = LiteGraph.NODE_TITLE_HEIGHT` |
| 端口坐标 | `node.getInputPos(i)` / `node.getOutputPos(i)`，返回图坐标；内部公式与 `src/spike/geometry.ts` 一致 |
| 视口 | `canvas.ds.offset` / `canvas.ds.scale`，变化回调 `canvas.ds.onChanged` |

> 注意：`@comfyorg/litegraph@0.17.2` 在 npm 上被标记为 deprecated，但仍是 latest tag。

## 三个关键实现决策

1. **事件同步时机**：LiteGraph 在 capture 阶段处理 `pointerup` 并调用 `stopPropagation()`，冒泡阶段收不到事件。桥接层因此在 capture 阶段监听，并用 `requestAnimationFrame` 延后一帧同步，确保读到 `dropLinks` 完成后的状态。否则会出现"连线已建立但面板显示 0 条"。
2. **拖动实时性**：原生节点绘制关闭后，React 节点必须在拖动过程中实时跟随。`pointermove` 用 capture 阶段监听 + rAF 合并；store 用 `updateNodePositions` 做增量更新，未变节点保持引用不变，配合 `React.memo(NodeView)` 避免全量重渲染。否则会出现"拖动时节点不动、松手瞬移"的卡顿感。
3. **未启用 StrictMode**：LiteGraph 是命令式引擎，`unbindEvents()` 不会移除全部监听器；StrictMode 的双挂载会留下旧实例的监听器。因此 `main.tsx` 没有包裹 `StrictMode`。

## 项目结构

```
src/
├── main.tsx                 # React 入口
├── App.tsx                  # flex 主布局
├── index.css                # 全局与节点样式
└── spike/
    ├── geometry.ts          # 复用 LiteGraph 常量的共享几何配置
    ├── types.ts             # 节点镜像类型
    ├── store.ts             # Zustand 状态（视口 rAF 合并）
    ├── runtime.ts           # 暴露 graph/canvas 供测量
    ├── registerNodes.ts     # 示例节点注册
    ├── LiteGraphCanvas.tsx  # canvas 初始化与同步
    ├── NodeOverlay.tsx      # React 覆盖层
    ├── NodeView.tsx         # 单节点 DOM
    └── SpikePanel.tsx       # 验证面板与偏差测量
scripts/
└── verify-spike.mjs         # 一键验证：几何对齐 + 连线 + 面板同步
```
