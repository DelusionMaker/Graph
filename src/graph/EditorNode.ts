import { LGraphNode, LiteGraph } from '@comfyorg/litegraph'
import { reportConnectionError } from './connectionFeedback'

/** 沿已有连线从 start 出发能否到达 target */
function canReach(start: LGraphNode, target: LGraphNode): boolean {
  const graph = start.graph
  if (!graph) return false

  const stack: LGraphNode[] = [start]
  const seen = new Set<number>()

  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === target) return true
    const id = Number(node.id)
    if (seen.has(id)) continue
    seen.add(id)

    for (const output of node.outputs ?? []) {
      for (const linkId of output.links ?? []) {
        const link = graph.links.get(linkId)
        const next = link ? graph.getNodeById(link.target_id) : null
        if (next) stack.push(next)
      }
    }
  }

  return false
}

/**
 * 所有节点类型的基类。
 *
 * 0.17.2 的原生节点把标题栏画在 `pos` 上方：`measure()` 产出的包围盒是
 * `[pos.x, pos.y - NODE_TITLE_HEIGHT, size.w, size.h + NODE_TITLE_HEIGHT]`。
 * 本项目由 React 渲染节点，`pos` 就是节点可见区域的左上角（标题栏在框内）。
 * 若不覆写，框选矩形、点击命中、节点剔除都会整体上移 30px——表现为
 * "在节点上方空白处框选也会选中它"。
 */
export class EditorNode extends LGraphNode {
  static slot_start_y = LiteGraph.NODE_TITLE_HEIGHT

  /** 包围盒与 React DOM 保持一致：pos + size 即节点可见矩形 */
  measure(out: Float32Array): void {
    out[0] = this.pos[0]
    out[1] = this.pos[1]
    out[2] = this.size[0]
    out[3] = this.size[1]
  }

  /** 连线建立前拦截环路：目标节点已经能到达当前节点时拒绝 */
  onConnectOutput(
    _slot: number,
    _type: unknown,
    _input: unknown,
    targetNode: unknown,
    _targetSlot: number,
  ): boolean {
    const graph = this.graph
    if (!graph) return true
    const target =
      typeof targetNode === 'number' ? graph.getNodeById(targetNode) : (targetNode as LGraphNode)
    if (!target) return true
    if (target === this || canReach(target, this)) {
      reportConnectionError('不能连接：会形成循环依赖')
      return false
    }
    return true
  }

  /** 反向拖动（从输入端口拉起连线）时的环路检查 */
  onConnectInput(
    _slot: number,
    _type: unknown,
    _output: unknown,
    sourceNode: unknown,
    _sourceSlot: number,
  ): boolean {
    if (!(sourceNode instanceof LGraphNode)) return true
    if (sourceNode === this || canReach(this, sourceNode)) {
      reportConnectionError('不能连接：会形成循环依赖')
      return false
    }
    return true
  }
}
