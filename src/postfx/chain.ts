import { getNodeDefinition, readWidgetValue } from '../graph/nodeDefinitions'
import type { UILink, UINode, WorkflowUI } from '../graph/workflow'

export interface PostFXDescriptor {
  id: string
  type: 'Bloom' | 'SSAO' | 'Vignette' | 'SMAA'
  params: Record<string, number | boolean>
}

const POSTFX_TYPE_MAP: Record<string, PostFXDescriptor['type']> = {
  'postfx/Bloom': 'Bloom',
  'postfx/SSAO': 'SSAO',
  'postfx/Vignette': 'Vignette',
  'postfx/FXAA': 'SMAA',
}

function toDescriptor(node: UINode, type: PostFXDescriptor['type']): PostFXDescriptor {
  const params: Record<string, number | boolean> = {}
  const definition = getNodeDefinition(node.type)
  for (const widget of definition?.widgets ?? []) {
    const value = readWidgetValue(node, widget.name)
    if (typeof value === 'number' || typeof value === 'boolean') params[widget.name] = value
  }
  return { id: String(node.id), type, params }
}

/**
 * 从 PostFX Output 的输入端口逆序收集整条链，返回**从先到后**的执行顺序。
 * 链为空、上游不是效果节点或遇到环时停止并返回已收集部分。
 */
export function collectPostFXChain(workflow: WorkflowUI, outputId: number | null): PostFXDescriptor[] {
  if (outputId == null) return []
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]))
  const output = nodeById.get(outputId)
  if (!output || output.type !== 'postfx/Output') return []

  const linkByTarget = new Map<string, UILink>()
  for (const link of workflow.links) linkByTarget.set(`${link[3]}:${link[4]}`, link)

  const chain: PostFXDescriptor[] = []
  const visited = new Set<number>()
  let current: UINode | null = output

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    const definition = getNodeDefinition(current.type)
    // Output 的输入叫 effects，效果节点的输入叫 in；两者都只有这一个输入端口
    const inputSlot = definition?.inputs.findIndex((input) => input.name === 'in' || input.name === 'effects') ?? -1
    if (inputSlot < 0) break

    const link = linkByTarget.get(`${current.id}:${inputSlot}`)
    if (!link) break

    const origin = nodeById.get(link[1])
    // 已访问说明链中出现环：停止，避免重复追加与无限循环
    if (!origin || visited.has(origin.id)) break

    const mapped = POSTFX_TYPE_MAP[origin.type]
    if (!mapped) break

    chain.push(toDescriptor(origin, mapped))
    current = origin
  }

  return chain.reverse()
}
