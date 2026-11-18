import { useEffect, useRef } from 'react'
import { LGraph, LGraphCanvas } from '@comfyorg/litegraph'
import '@comfyorg/litegraph/style.css'
import { registerSpikeNodes, SpikeSource, SpikeTarget } from './registerNodes'
import { runtime } from './runtime'
import { useGraphStore } from './store'
import type { NodeSnapshot } from './types'

export function LiteGraphCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    registerSpikeNodes()
    const graph = new LGraph()
    // 0.17.2：第三个参数是 options 对象，仅支持 skip_events / viewport / skip_render / autoresize
    const lgraphCanvas = new LGraphCanvas(canvas, graph, {
      autoresize: true,
    })
    // 其余视觉配置是实例属性，构造后赋值（0.17.2 没有 show_grids 属性）
    lgraphCanvas.render_shadows = false

    runtime.graph = graph
    runtime.canvas = lgraphCanvas

    // 验证项 1：隐藏 LiteGraph 原生节点绘制，仅保留连线与网格。
    // 仍调用 arrange() 以维持槽位坐标计算，否则连线端点会错位。
    lgraphCanvas.drawNode = (node) => {
      node.arrange()
    }

    const source = new SpikeSource('Source')
    source.pos = [80, 120]
    graph.add(source)

    const target = new SpikeTarget('Target')
    target.pos = [440, 200]
    graph.add(target)

    const sync = () => {
      const nodes: NodeSnapshot[] = graph.nodes.map((n) => ({
        id: Number(n.id),
        type: n.type,
        title: n.title,
        pos: [n.pos[0], n.pos[1]],
        size: [n.size[0], n.size[1]],
        inputs: (n.inputs ?? []).map((p, i) => ({
          index: i,
          name: p.name ?? '',
          type: String(p.type),
          connected: p.link != null,
        })),
        outputs: (n.outputs ?? []).map((p, i) => ({
          index: i,
          name: p.name ?? '',
          type: String(p.type),
          connected: (p.links?.length ?? 0) > 0,
        })),
      }))
      const store = useGraphStore.getState()
      store.setNodes(nodes)
      store.setLinkCount(graph.links.size)
    }

    const syncViewport = () => {
      const { scale, offset } = lgraphCanvas.ds
      useGraphStore.getState().setViewport({
        x: offset[0],
        y: offset[1],
        zoom: scale,
      })
    }

    lgraphCanvas.ds.onChanged = () => syncViewport()

    let fullSyncFrame = 0
    const scheduleFullSync = () => {
      if (fullSyncFrame) return
      fullSyncFrame = requestAnimationFrame(() => {
        fullSyncFrame = 0
        sync()
        syncViewport()
      })
    }
    // 节点增删后即时同步，不必等下一次 pointerup
    graph.onNodeAdded = scheduleFullSync
    graph.onNodeRemoved = scheduleFullSync

    // LiteGraph 在 capture 阶段处理 pointerup 并 stopPropagation，
    // 冒泡阶段收不到事件；改在 capture 阶段监听，并延后一帧等它完成 dropLinks。
    const onPointerUp = scheduleFullSync
    // 拖动节点时实时同步位置：LiteGraph 原生节点绘制已关闭，
    // 若只在 pointerup 同步，React 节点会停在原地、松手才瞬移。
    let positionFrame = 0
    const syncNodePositions = () => {
      const positions = new Map<number, [number, number]>()
      for (const n of graph.nodes) positions.set(Number(n.id), [n.pos[0], n.pos[1]])
      useGraphStore.getState().updateNodePositions(positions)
    }
    const onPointerMove = () => {
      if (positionFrame) return
      positionFrame = requestAnimationFrame(() => {
        positionFrame = 0
        syncNodePositions()
      })
    }
    canvas.addEventListener('pointerup', onPointerUp, true)
    canvas.addEventListener('pointermove', onPointerMove, true)
    canvas.addEventListener('wheel', syncViewport, { passive: true })

    const observer = new ResizeObserver(() => lgraphCanvas.resize())
    observer.observe(canvas)

    sync()
    syncViewport()

    return () => {
      observer.disconnect()
      canvas.removeEventListener('pointerup', onPointerUp, true)
      canvas.removeEventListener('pointermove', onPointerMove, true)
      canvas.removeEventListener('wheel', syncViewport)
      graph.stop()
      lgraphCanvas.clear()
      graph.clear()
      runtime.graph = null
      runtime.canvas = null
    }
  }, [])

  return <canvas ref={canvasRef} className="litegraph-canvas" />
}
