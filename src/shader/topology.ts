import type { UILink, UINode, WorkflowUI } from '../graph/workflow'

/**
 * 编译期图算法（纯函数，无副作用）。
 * 连线拦截仍由 EditorNode.ts 的 canReach 负责，这里只做可达性分析与排序。
 */

/** 按 target 建立入边索引；UILink = [id, origin, originSlot, target, targetSlot, type] */
export function buildIncomingIndex(links: UILink[]): Map<number, UILink[]> {
  const incoming = new Map<number, UILink[]>()
  for (const link of links) {
    const list = incoming.get(link[3])
    if (list) list.push(link)
    else incoming.set(link[3], [link])
  }
  return incoming
}

/**
 * 从终端节点逆着输入连线收集可达节点（含终端自身）。
 * 用于把与终端无关的节点排除在编译之外。
 */
export function getReachableNodes(nodes: UINode[], links: UILink[], terminalId: number): Set<number> {
  const known = new Set(nodes.map((node) => node.id))
  const reached = new Set<number>()
  if (!known.has(terminalId)) return reached

  const incoming = buildIncomingIndex(links)
  const stack = [terminalId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (reached.has(id)) continue
    reached.add(id)
    for (const link of incoming.get(id) ?? []) {
      const origin = link[1]
      if (known.has(origin) && !reached.has(origin)) stack.push(origin)
    }
  }
  return reached
}

export interface TopoSortResult {
  /** 拓扑序，上游在前 */
  order: number[]
  /** 未能排序的节点（图中存在环时非空） */
  cyclic: number[]
}

/**
 * Kahn 拓扑排序，可选 subset 只排序可达子图。
 * 成环时返回 cyclic，让编译器给出明确警告而不是静默产出半成品。
 */
export function topoSort(nodes: UINode[], links: UILink[], subset?: Set<number>): TopoSortResult {
  const ids = nodes.map((node) => node.id).filter((id) => !subset || subset.has(id))
  const idSet = new Set(ids)
  const indegree = new Map<number, number>(ids.map((id) => [id, 0]))
  const outgoing = new Map<number, number[]>()

  for (const link of links) {
    const [, origin, , target] = link
    if (!idSet.has(origin) || !idSet.has(target)) continue
    indegree.set(target, (indegree.get(target) ?? 0) + 1)
    const list = outgoing.get(origin)
    if (list) list.push(target)
    else outgoing.set(origin, [target])
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0)
  const order: number[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const next of outgoing.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1
      indegree.set(next, left)
      if (left === 0) queue.push(next)
    }
  }

  const ordered = new Set(order)
  return { order, cyclic: ids.filter((id) => !ordered.has(id)) }
}

/** 找出指定类型的所有终端节点（scene/Root、postfx/Output） */
export function findTerminals(workflow: WorkflowUI, terminalTypes: Set<string>): UINode[] {
  return workflow.nodes.filter((node) => terminalTypes.has(node.type))
}
