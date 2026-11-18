import { useEffect, useState, type RefObject } from 'react'
import { LGraph, LGraphCanvas, LGraphNode, LiteGraph, type LLink } from '@comfyorg/litegraph'
import '@comfyorg/litegraph/style.css'
import { resetGraphActions, useGraphActions } from './actions'
import { SnapshotHistory } from './history'
import { getNodeDefinition, registerNodeDefinitions } from './nodeRegistry'
import { readPersistedWorkflow, writePersistedWorkflow } from './persistence'
import { seedDemoGraph } from './seed'
import { applyWorkflow, graphToWorkflow } from './serialize'
import { useGraphStore } from './store'
import { installTypeSystem } from './typeSystem'
import { useUiStore } from './uiStore'
import { parseWorkflow, toPromptAPI, type ImportIssue, type WorkflowUI } from './workflow'
import type {
  LinkSnapshot,
  NodeGeometryUpdate,
  NodeSnapshot,
  PortSnapshot,
  WidgetSnapshot,
} from './types'

export interface GraphContext {
  graph: LGraph
  canvas: LGraphCanvas
  /** 在视口中心或指定图坐标处添加节点 */
  addNode: (type: string, pos?: [number, number]) => void
}

/**
 * LiteGraph ↔ Zustand 桥接层。
 *
 * 职责边界：
 * - LGraph 是图数据的唯一真相源，Zustand 只保存渲染镜像；
 * - 画布交互（平移/缩放/框选/拖拽/连线）全部由 LiteGraph 处理，本 hook 只做同步；
 * - React 侧不直接写 LGraph，后续的图操作统一经 graph 提供的命令接口。
 */
export function useLiteGraphBridge(canvasRef: RefObject<HTMLCanvasElement>): GraphContext | null {
  const [context, setContext] = useState<GraphContext | null>(null)

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return

    registerNodeDefinitions()
    installTypeSystem()
    const graph = new LGraph()
    // 0.17.2：第三个参数是 options 对象，仅支持 skip_events / viewport / skip_render / autoresize
    const canvas = new LGraphCanvas(element, graph, { autoresize: true })
    canvas.render_shadows = false
    // 关闭 FPS/节点计数调试信息（默认会画在画布左下角）
    canvas.show_info = false

    // 浅色主题需要一张浅色网格图（默认的深色网格图叠加在浅底上会发灰）
    const createGridImage = (stroke: string, step = 20): string | null => {
      const grid = document.createElement('canvas')
      grid.width = step
      grid.height = step
      const ctx = grid.getContext('2d')
      if (!ctx) return null
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, 0.5)
      ctx.lineTo(step, 0.5)
      ctx.moveTo(0.5, 0)
      ctx.lineTo(0.5, step)
      ctx.stroke()
      return grid.toDataURL()
    }
    const lightGrid = createGridImage('rgba(15, 23, 42, 0.10)')

    // 主题切换只重绘画布底色，不触碰图数据与视口
    const applyCanvasTheme = (theme: string) => {
      canvas.clear_background_color = theme === 'light' ? '#f6f7fa' : '#222'
      if (lightGrid) {
        canvas.background_image =
          theme === 'light' ? lightGrid : LGraphCanvas.DEFAULT_BACKGROUND_IMAGE
        // LiteGraph 会缓存 pattern，换图后必须清掉缓存才会重建
        const internal = canvas as unknown as { _pattern?: unknown; _bg_img?: unknown }
        internal._pattern = null
        internal._bg_img = null
      }
      canvas.setDirty(true, true)
    }
    applyCanvasTheme(useUiStore.getState().theme)
    const unsubscribeTheme = useUiStore.subscribe((state) => applyCanvasTheme(state.theme))

    // 关闭原生节点绘制：只 arrange() 维持槽位坐标，不画节点本体
    canvas.drawNode = (node) => {
      node.arrange()
    }

    // 框选矩形由 React 绘制（见 onPointerMove），绘制期间临时隐藏原生矩形
    const originalDrawFrontCanvas = canvas.drawFrontCanvas.bind(canvas)
    canvas.drawFrontCanvas = () => {
      const rect = canvas.dragging_rectangle
      if (!rect) {
        originalDrawFrontCanvas()
        return
      }
      canvas.dragging_rectangle = null
      try {
        originalDrawFrontCanvas()
      } finally {
        canvas.dragging_rectangle = rect
      }
    }

    const store = useGraphStore.getState()

    /** 端口坐标直接取 LiteGraph 的权威计算结果；输出端口 x 依赖节点宽度，缩放节点后需要重算 */
    const readPorts = (node: LGraphNode, direction: 'in' | 'out'): PortSnapshot[] => {
      const [nx, ny] = node.pos
      if (direction === 'in') {
        return (node.inputs ?? []).map((port, index) => {
          const [px, py] = node.getInputPos(index)
          return {
            index,
            name: port.name ?? '',
            type: String(port.type),
            connected: port.link != null,
            offset: [px - nx, py - ny] as [number, number],
          }
        })
      }
      return (node.outputs ?? []).map((port, index) => {
        const [px, py] = node.getOutputPos(index)
        return {
          index,
          name: port.name ?? '',
          type: String(port.type),
          connected: (port.links?.length ?? 0) > 0,
          offset: [px - nx, py - ny] as [number, number],
        }
      })
    }

    const syncSnapshot = () => {
      const nodes: NodeSnapshot[] = graph.nodes.map((node) => {
        const [x, y] = node.pos
        node.arrange()
        return {
          id: Number(node.id),
          type: node.type,
          title: node.title,
          pos: [x, y],
          size: [node.size[0], node.size[1]],
          inputs: readPorts(node, 'in'),
          outputs: readPorts(node, 'out'),
          // widget 的值存在 LiteGraph widget 上（唯一真相源），kind / 取值范围来自节点定义
          widgets: (node.widgets ?? []).map((widget, index): WidgetSnapshot => {
            const schema = getNodeDefinition(node.type)?.widgets[index]
            return {
              index,
              name: widget.name ?? schema?.name ?? `widget_${index}`,
              kind: schema?.kind ?? 'text',
              value: widget.value,
              values: schema?.values,
              min: schema?.min,
              max: schema?.max,
              step: schema?.step,
            }
          }),
        }
      })

      const links: LinkSnapshot[] = [...graph.links.values()].map((link) => ({
        id: Number(link.id),
        originId: Number(link.origin_id),
        originSlot: link.origin_slot,
        targetId: Number(link.target_id),
        targetSlot: link.target_slot,
        type: String(link.type),
      }))

      // selectedItems 是 0.17.2 的正式选择集（含节点/组/reroute），selected_nodes 已废弃
      const selectedNodes = [...(canvas.selectedItems ?? [])].filter(
        (item): item is LGraphNode => item instanceof LGraphNode,
      )

      store.setNodes(nodes)
      store.setLinks(links)
      store.setSelection(selectedNodes.map((node) => Number(node.id)))
    }

    const syncViewport = () => {
      const { scale, offset } = canvas.ds
      useGraphStore.getState().setViewport({ x: offset[0], y: offset[1], zoom: scale })
    }

    // 平移/缩放（中键拖拽、滚轮、changeScale）统一由 DragAndScale 的状态变化驱动
    canvas.ds.onChanged = syncViewport

    let syncFrame = 0
    const scheduleSync = () => {
      if (syncFrame) return
      syncFrame = requestAnimationFrame(() => {
        syncFrame = 0
        syncSnapshot()
        syncViewport()
      })
    }

    // ---- 历史 / 持久化 / 导入导出 ----
    const AUTOSAVE_DELAY = 1000
    const history = new SnapshotHistory({ limit: 50, coalesceWindowMs: 600 })
    let autosaveTimer = 0

    const snapshotGraph = () => JSON.stringify(graphToWorkflow(graph))
    const persistNow = () => writePersistedWorkflow(graphToWorkflow(graph))
    const queueAutosave = () => {
      window.clearTimeout(autosaveTimer)
      autosaveTimer = window.setTimeout(persistNow, AUTOSAVE_DELAY)
    }
    const syncHistoryFlags = () => {
      useGraphActions.setState({ canUndo: history.canUndo, canRedo: history.canRedo })
    }
    // 重建图（撤销/重做/导入/启动恢复）期间必须暂停记录，
    // 否则 graph.clear() 与逐节点 add 会把中间态写进历史
    let suspendHistory = false
    const commit = (options?: { coalesce?: boolean }) => {
      if (suspendHistory) return
      if (history.push(snapshotGraph(), options)) queueAutosave()
      syncHistoryFlags()
    }

    const rebuild = (workflow: WorkflowUI) => {
      suspendHistory = true
      try {
        clearLinkSelection()
        const issues = applyWorkflow(graph, canvas, workflow)
        syncSnapshot()
        syncViewport()
        return issues
      } finally {
        suspendHistory = false
      }
    }

    const applySnapshot = (snapshot: string) => {
      const { workflow } = parseWorkflow(JSON.parse(snapshot))
      if (!workflow) return
      rebuild(workflow)
      queueAutosave()
    }
    const undo = () => {
      const snapshot = history.undo()
      if (snapshot) applySnapshot(snapshot)
      syncHistoryFlags()
    }
    const redo = () => {
      const snapshot = history.redo()
      if (snapshot) applySnapshot(snapshot)
      syncHistoryFlags()
    }

    const exportWorkflow = () => graphToWorkflow(graph)
    const exportPrompt = () => toPromptAPI(graphToWorkflow(graph))
    const importWorkflow = (raw: unknown): { ok: boolean; issues: ImportIssue[] } => {
      const { workflow, issues } = parseWorkflow(raw)
      if (!workflow) return { ok: false, issues }
      const applyIssues = rebuild(workflow)
      commit()
      return { ok: true, issues: [...issues, ...applyIssues] }
    }

    // 拖动/缩放节点时实时同步几何：原生节点绘制已关闭，
    // 若只在 pointerup 同步，React 节点会停在原地、松手才瞬移；
    // 缩放还需要同步 size 与端口偏移（输出端口 x 依赖节点宽度）。
    let positionFrame = 0
    const syncLiveGeometry = () => {
      const state = useGraphStore.getState()
      const byId = new Map(state.nodes.map((node) => [node.id, node]))
      const updates: NodeGeometryUpdate[] = []

      for (const node of graph.nodes) {
        const id = Number(node.id)
        const snapshot = byId.get(id)
        if (!snapshot) continue
        const posChanged = snapshot.pos[0] !== node.pos[0] || snapshot.pos[1] !== node.pos[1]
        const sizeChanged = snapshot.size[0] !== node.size[0] || snapshot.size[1] !== node.size[1]
        if (!posChanged && !sizeChanged) continue
        updates.push({
          id,
          pos: [node.pos[0], node.pos[1]],
          size: [node.size[0], node.size[1]],
          inputs: sizeChanged ? readPorts(node, 'in') : undefined,
          outputs: sizeChanged ? readPorts(node, 'out') : undefined,
        })
      }

      state.updateNodeGeometry(updates)
    }
    const onPointerMove = (event: PointerEvent) => {
      // 框选提示框改由 React 绘制：
      // LiteGraph 自己的矩形用 `safeOffset * devicePixelRatio` 绘制，而它的画布缓冲区并不按 DPR 放大，
      // 在 125% / 150% 缩放的屏幕上会整体放大偏移；且矩形画在 canvas 上会被 React 节点遮住。
      if (canvas.dragging_rectangle) {
        const rect = element.getBoundingClientRect()
        const x0 = pointerDownX - rect.left
        const y0 = pointerDownY - rect.top
        const x1 = event.clientX - rect.left
        const y1 = event.clientY - rect.top
        store.setSelectionRect({
          x: Math.min(x0, x1),
          y: Math.min(y0, y1),
          w: Math.abs(x1 - x0),
          h: Math.abs(y1 - y0),
        })
      }

      if (positionFrame) return
      positionFrame = requestAnimationFrame(() => {
        positionFrame = 0
        syncLiveGeometry()
      })
    }

    // 0.17.2 默认是 legacy 导航模式：空白左键拖拽是平移、框选需要 Ctrl。
    // 这里切到 standard，对齐 ComfyUI：空白左键框选、中键平移。
    LiteGraph.canvasNavigationMode = 'standard'

    // 0.17.2 没有连线命中测试，也没有内置的连线选中/删除；
    // 用渲染时缓存的 Path2D 做命中测试，再自己维护选中态。
    // 同时关掉 LiteGraph 自带的连线中心菜单（Add Node / Add Reroute），阶段 1 用"选中 + Delete"替代。
    let selectedLink: LLink | null = null
    const LINK_SELECTED_COLOR = '#4a9eff'
    canvas.showLinkMenu = () => false

    const findLinkAt = (clientX: number, clientY: number): LLink | null => {
      const ctx = element.getContext('2d')
      if (!ctx) return null
      const rect = element.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      ctx.save()
      // 与渲染时相同的变换：dpr → ds.scale/translate，isPointInStroke 会按当前 CTM 变换路径
      ctx.setTransform(element.width / rect.width, 0, 0, element.height / rect.height, 0, 0)
      canvas.ds.toCanvasContext(ctx)
      // 命中容差：8 个图坐标单位（跟随缩放）
      ctx.lineWidth = 8 / canvas.ds.scale
      let hit: LLink | null = null
      for (const link of graph.links.values()) {
        if (!link.path) continue
        if (ctx.isPointInStroke(link.path, x, y)) {
          hit = link
          break
        }
      }
      ctx.restore()
      return hit
    }

    const clearLinkSelection = () => {
      if (!selectedLink) return
      selectedLink.color = ''
      selectedLink = null
      canvas.setDirty(true, true)
    }

    const selectLink = (link: LLink) => {
      if (selectedLink === link) return
      clearLinkSelection()
      selectedLink = link
      selectedLink.color = LINK_SELECTED_COLOR
      canvas.setDirty(true, true)
    }

    let pointerDownX = 0
    let pointerDownY = 0
    let pointerDownButton = -1

    // LiteGraph 在 capture 阶段处理 pointerup 并 stopPropagation，
    // 冒泡阶段收不到事件；改在 capture 阶段监听，并延后一帧等它完成状态变更。
    const onPointerDown = (event: PointerEvent) => {
      pointerDownX = event.clientX
      pointerDownY = event.clientY
      pointerDownButton = event.button
    }
    const onPointerUp = (event: PointerEvent) => {
      scheduleSync()
      store.setSelectionRect(null)
      // 拖拽 / 缩放 / 连线结束都落一条历史记录；仅选中节点时快照不变，push 会自动去重
      commit()
      // 只有"点击"才切换连线选中，避免拖拽结束时误选脚下的连线
      const isClick =
        pointerDownButton === 0 && Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) < 4
      if (!isClick) return
      const link = findLinkAt(event.clientX, event.clientY)
      if (link) {
        canvas.deselectAll()
        selectLink(link)
      } else {
        clearLinkSelection()
      }
    }
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // 焦点在 Widget 控件里时，快捷键交还给浏览器（例如输入框内的撤销）
      if (isEditableTarget(event.target)) return

      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (modifier && key === 'y') {
        event.preventDefault()
        redo()
        return
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (selectedLink) {
        // 删除选中的连线；同步走 rAF，等 LiteGraph 自己的按键处理结束
        graph.removeLink(selectedLink.id)
        selectedLink = null
        canvas.setDirty(true, true)
        scheduleSync()
        commit()
        return
      }
      scheduleSync()
    }
    // standard 导航模式下 LiteGraph 只处理 Ctrl+滚轮，普通滚轮按规划要求直接缩放（0.2x–3x）
    canvas.ds.min_scale = 0.2
    canvas.ds.max_scale = 3
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        // 触控板捏合 / Ctrl+滚轮交给 LiteGraph 原生逻辑
        syncViewport()
        return
      }
      event.preventDefault()
      const factor = Math.pow(1.1, -event.deltaY / 120)
      canvas.ds.changeScale(canvas.ds.scale * factor, [event.clientX, event.clientY])
      canvas.setDirty(true, true)
      syncViewport()
    }
    // 挂到画布容器而不是 canvas：鼠标停在 Widget 上时事件不会落到 canvas，
    // 但滚轮仍应以光标为锚点缩放画布
    const wheelTarget = element.parentElement ?? element

    graph.onNodeAdded = () => {
      scheduleSync()
      commit()
    }
    graph.onNodeRemoved = () => {
      scheduleSync()
      commit()
    }
    canvas.onSelectionChange = scheduleSync

    // LiteGraph 的 Pointer 在 canvas 的 capture 阶段会 stopImmediatePropagation，冒泡阶段收不到 pointerdown，
    // 因此把"按下位置"的监听放到 window 的 capture 阶段（先于 canvas 执行）。
    window.addEventListener('pointerdown', onPointerDown, true)
    element.addEventListener('pointerup', onPointerUp, true)
    element.addEventListener('pointermove', onPointerMove, true)
    element.addEventListener('keydown', onKeyDown)
    wheelTarget.addEventListener('wheel', onWheel, { passive: false })

    const observer = new ResizeObserver(() => {
      canvas.resize()
      useGraphStore.getState().setCanvasSize({ w: element.clientWidth, h: element.clientHeight })
    })
    observer.observe(element)
    useGraphStore.getState().setCanvasSize({ w: element.clientWidth, h: element.clientHeight })

    const addNode = (type: string, pos?: [number, number]) => {
      const node = LiteGraph.createNode(type)
      if (!node) return
      if (pos) {
        node.pos = [pos[0], pos[1]]
      } else {
        const rect = element.getBoundingClientRect()
        const [cx, cy] = canvas.convertCanvasToOffset([rect.width / 2, rect.height / 2])
        node.pos = [cx - node.size[0] / 2, cy - node.size[1] / 2]
      }
      graph.add(node)
      canvas.selectItems([node])
      canvas.setDirty(true, true)
      scheduleSync()
    }

    const centerOn = (graphX: number, graphY: number) => {
      const rect = element.getBoundingClientRect()
      const scale = canvas.ds.scale
      // 屏幕坐标 = (图坐标 + offset) * scale；要让该图坐标落在画布中心：
      // offset = 画布尺寸 / (2 * scale) - 图坐标（注意是"尺寸减坐标"，写反会把点击位置镜像到另一侧）
      canvas.ds.offset = [rect.width / (2 * scale) - graphX, rect.height / (2 * scale) - graphY]
      canvas.setDirty(true, true)
      syncViewport()
    }

    const setWidgetValue = (nodeId: number, index: number, value: unknown) => {
      const widget = graph.getNodeById(nodeId)?.widgets?.[index]
      if (!widget) return
      ;(widget as { value: unknown }).value = value
      canvas.setDirty(true, true)
      scheduleSync()
      // 连续调参合并为一条历史记录
      commit({ coalesce: true })
    }

    // UI 只通过这些动作访问图引擎，不直接持有 LGraph
    useGraphActions.setState({
      addNode,
      setWidgetValue,
      centerOn,
      undo,
      redo,
      exportWorkflow,
      exportPrompt,
      importWorkflow,
      canUndo: false,
      canRedo: false,
    })

    // 启动：优先恢复本地工作流，没有或数据损坏时写入示例图
    let restored = false
    const persisted = readPersistedWorkflow()
    if (persisted) {
      const { workflow } = parseWorkflow(persisted)
      if (workflow && workflow.nodes.length > 0) {
        rebuild(workflow)
        restored = true
      }
    }
    if (!restored) {
      suspendHistory = true
      try {
        seedDemoGraph(graph)
      } finally {
        suspendHistory = false
      }
    }

    syncSnapshot()
    syncViewport()
    history.reset(snapshotGraph())
    syncHistoryFlags()
    setContext({ graph, canvas, addNode })

    return () => {
      observer.disconnect()
      unsubscribeTheme()
      window.removeEventListener('pointerdown', onPointerDown, true)
      element.removeEventListener('pointerup', onPointerUp, true)
      element.removeEventListener('pointermove', onPointerMove, true)
      element.removeEventListener('keydown', onKeyDown)
      wheelTarget.removeEventListener('wheel', onWheel)

      cancelAnimationFrame(syncFrame)
      cancelAnimationFrame(positionFrame)
      window.clearTimeout(autosaveTimer)
      clearLinkSelection()
      resetGraphActions()

      graph.onNodeAdded = undefined
      graph.onNodeRemoved = undefined
      canvas.onSelectionChange = undefined
      canvas.ds.onChanged = undefined
      canvas.drawFrontCanvas = originalDrawFrontCanvas

      graph.stop()
      canvas.unbindEvents()
      canvas.clear()
      graph.clear()
      setContext(null)
    }
  }, [canvasRef])

  return context
}
