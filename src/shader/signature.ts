import { getNodeDefinition } from '../graph/nodeDefinitions'
import type { UILink, WorkflowUI } from '../graph/workflow'
import { getReachableNodes } from './topology'

/** djb2 短哈希：不依赖对象键顺序，稳定可复现 */
export function djb2(input: string): string {
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) | 0
  }
  return (hash >>> 0).toString(36)
}

function stableValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

/**
 * 结构签名：只纳入会影响 GLSL 结构的内容。
 * - 节点类型、links、codeAffectingWidgets 的值、activeRoot / activePostFXOutput；
 * - 只统计终端可达节点与环境节点，与终端无关的改动不会触发重编译。
 *
 * 其余 widget（数值、颜色、环境参数、后处理参数）变化时签名不变，只刷新 uniform / 配置。
 */
export function computeSignature(workflow: WorkflowUI): string {
  const terminals = workflow.nodes.filter(
    (node) => node.type === 'scene/Root' || node.type === 'postfx/Output',
  )

  const relevant = new Set<number>()
  for (const terminal of terminals) {
    for (const id of getReachableNodes(workflow.nodes, workflow.links, terminal.id)) {
      relevant.add(id)
    }
  }
  // 环境节点全局生效，即使不在终端链上也要纳入
  for (const node of workflow.nodes) {
    if (node.type === 'render/Environment') relevant.add(node.id)
  }

  const parts: string[] = []
  const nodes = [...workflow.nodes]
    .filter((node) => relevant.has(node.id))
    .sort((left, right) => left.id - right.id)

  for (const node of nodes) {
    parts.push(`${node.id}:${node.type}`)
    const definition = getNodeDefinition(node.type)
    for (const name of definition?.codeAffectingWidgets ?? []) {
      const index = definition?.widgets.findIndex((widget) => widget.name === name) ?? -1
      parts.push(`${name}=${stableValue(node.widgets_values[index])}`)
    }
  }

  const links: UILink[] = [...workflow.links]
    .filter((link) => relevant.has(link[1]) && relevant.has(link[3]))
    .sort((left, right) => left[0] - right[0])
  for (const link of links) parts.push(link.join(':'))

  parts.push(`root=${stableValue(workflow.config.activeRoot)}`)
  parts.push(`postfx=${stableValue(workflow.config.activePostFXOutput)}`)

  return djb2(parts.join('|'))
}
