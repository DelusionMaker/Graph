import { LiteGraph, type LGraph, type LGraphCanvas, type LGraphNode } from '@comfyorg/litegraph'
import { getNodeDefinition } from './nodeRegistry'
import {
  SCHEMA_VERSION,
  type ImportIssue,
  type UILink,
  type UINode,
  type WorkflowUI,
} from './workflow'

/** LGraph → UI 格式（带布局，可直接 JSON 化） */
export function graphToWorkflow(graph: LGraph): WorkflowUI {
  const nodes: UINode[] = graph.nodes.map((node) => ({
    id: Number(node.id),
    type: node.type,
    title: node.title,
    pos: [node.pos[0], node.pos[1]],
    size: [node.size[0], node.size[1]],
    mode: node.mode === 1 || node.mode === 2 ? node.mode : 0,
    inputs: (node.inputs ?? []).map((port) => ({
      name: port.name ?? '',
      type: String(port.type),
      link: port.link ?? null,
    })),
    outputs: (node.outputs ?? []).map((port) => ({
      name: port.name ?? '',
      type: String(port.type),
      links: [...(port.links ?? [])],
    })),
    widgets_values: (node.widgets ?? []).map((widget) => widget.value),
    widget_names: (node.widgets ?? []).map((widget) => widget.name ?? ''),
  }))

  const links: UILink[] = [...graph.links.values()].map((link) => [
    Number(link.id),
    Number(link.origin_id),
    link.origin_slot,
    Number(link.target_id),
    link.target_slot,
    String(link.type),
  ])

  return {
    last_node_id: nodes.reduce((max, node) => Math.max(max, node.id), 0),
    last_link_id: links.reduce((max, link) => Math.max(max, link[0]), 0),
    nodes,
    links,
    groups: [],
    config: { schema_version: SCHEMA_VERSION },
  }
}

/**
 * UI 格式 → LGraph：清空后重建。
 * 未知节点类型会被跳过并记录（引用完整性），其余节点保持原有 id 与布局。
 */
export function applyWorkflow(graph: LGraph, canvas: LGraphCanvas, workflow: WorkflowUI): ImportIssue[] {
  const issues: ImportIssue[] = []

  canvas.deselectAll()
  graph.clear()

  const byId = new Map<number, LGraphNode>()

  for (const uiNode of workflow.nodes) {
    if (!getNodeDefinition(uiNode.type)) {
      issues.push({ level: 2, message: `未知节点类型「${uiNode.type}」，已跳过` })
      continue
    }
    const node = LiteGraph.createNode(uiNode.type)
    if (!node) {
      issues.push({ level: 2, message: `无法创建节点「${uiNode.type}」` })
      continue
    }
    node.id = uiNode.id
    node.pos = [uiNode.pos[0], uiNode.pos[1]]
    node.size = [uiNode.size[0], uiNode.size[1]]
    if (uiNode.title) node.title = uiNode.title
    node.mode = uiNode.mode ?? 0
    uiNode.widgets_values.forEach((value, index) => {
      const widget = node.widgets?.[index]
      if (widget) (widget as { value: unknown }).value = value
    })
    graph.add(node)
    byId.set(uiNode.id, node)
  }

  for (const link of workflow.links) {
    const [id, originId, originSlot, targetId, targetSlot] = link
    const origin = byId.get(originId)
    const target = byId.get(targetId)
    if (!origin || !target) {
      issues.push({ level: 2, message: `连线 ${id} 的端点节点缺失，已丢弃` })
      continue
    }
    const created = origin.connect(originSlot, target, targetSlot)
    if (!created) {
      issues.push({ level: 2, message: `连线 ${id} 无法恢复（类型或槽位不合法）` })
    }
  }

  canvas.setDirty(true, true)
  return issues
}
