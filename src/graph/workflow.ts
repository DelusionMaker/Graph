/**
 * 工作流双格式模型（纯函数，无 LiteGraph / DOM 依赖，便于单元测试）。
 *
 * - UI 格式：带布局坐标，用于保存与恢复画布
 * - 执行格式：纯拓扑，用于提交后端
 */

export const SCHEMA_VERSION = 1

export const PORT_TYPES = [
  // 既有 ComfyUI 类型，全部保留
  'MODEL',
  'CLIP',
  'VAE',
  'CONDITIONING',
  'LATENT',
  'IMAGE',
  'MASK',
  'CONTROL_NET',
  'SIGMAS',
  'INT',
  'FLOAT',
  'STRING',
  'BOOLEAN',
  '*',
  // shader 值类型
  'VEC2',
  'VEC3',
  'COLOR',
  // 资源与终端类型
  'GEOMETRY',
  'MATERIAL',
  'POSTFX',
] as const

export type PortType = (typeof PORT_TYPES)[number]

export interface PortDef {
  name: string
  type: string
  /** 输入端口：连接的 link id */
  link?: number | null
  /** 输出端口：连接的 link id 列表 */
  links?: number[]
}

export interface UINode {
  id: number
  type: string
  title?: string
  pos: [number, number]
  size: [number, number]
  /** 0=正常 1=静音 2=旁路 */
  mode?: 0 | 1 | 2
  inputs: PortDef[]
  outputs: PortDef[]
  widgets_values: unknown[]
  /** 与 widgets_values 一一对应的控件名，序列化时写入，便于反查执行格式的 inputs 键名 */
  widget_names?: string[]
}

export interface UIGroup {
  id: number
  title: string
  pos: [number, number]
  size: [number, number]
  color?: string
  nodes?: number[]
}

/** [link_id, 源节点, 源槽位, 目标节点, 目标槽位, 类型] */
export type UILink = [number, number, number, number, number, string]

export interface WorkflowConfig {
  schema_version: number
  [key: string]: unknown
}

export interface WorkflowUI {
  last_node_id: number
  last_link_id: number
  nodes: UINode[]
  links: UILink[]
  groups: UIGroup[]
  config: WorkflowConfig
}

export interface PromptNode {
  class_type: string
  inputs: Record<string, unknown>
  _meta?: { title?: string }
}

export type PromptAPI = Record<string, PromptNode>

/** 导入问题级别：1 = 结构性错误（拒绝导入）；2 = 引用问题（丢弃相关数据）；3 = 类型问题（降级为 *） */
export interface ImportIssue {
  level: 1 | 2 | 3
  message: string
}

export interface ParseResult {
  workflow: WorkflowUI | null
  issues: ImportIssue[]
}

export function createEmptyWorkflow(): WorkflowUI {
  return {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: { schema_version: SCHEMA_VERSION },
  }
}

/**
 * UI 格式 → 执行格式。
 * - 静音 / 旁路节点不进入执行图
 * - 已连线的输入写 `[源节点 id, 源槽位]`，不再被 widget 值覆盖
 * - widget 值按 widget_names 映射到 inputs 键名
 */
export function toPromptAPI(workflow: WorkflowUI): PromptAPI {
  const linkById = new Map(workflow.links.map((link) => [link[0], link]))
  const result: PromptAPI = {}

  for (const node of workflow.nodes) {
    if (node.mode === 1 || node.mode === 2) continue

    const inputs: Record<string, unknown> = {}
    const connected = new Set<string>()

    for (const port of node.inputs) {
      if (port.link == null) continue
      const link = linkById.get(port.link)
      if (!link) continue
      inputs[port.name] = [link[1], link[2]]
      connected.add(port.name)
    }

    node.widgets_values.forEach((value, index) => {
      const name = node.widget_names?.[index] ?? node.inputs[index]?.name ?? `widget_${index}`
      if (!connected.has(name)) inputs[name] = value
    })

    result[String(node.id)] = {
      class_type: node.type,
      inputs,
      ...(node.title ? { _meta: { title: node.title } } : {}),
    }
  }

  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPoint(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0])
    const y = Number(value[1])
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
  }
  return fallback
}

function isKnownPortType(type: string): type is PortType {
  return (PORT_TYPES as readonly string[]).includes(type)
}

function readPorts(value: unknown, nodeId: number, kind: '输入' | '输出', issues: ImportIssue[]): PortDef[] {
  if (!Array.isArray(value)) return []
  const ports: PortDef[] = []

  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string') continue
    let type = typeof item.type === 'string' ? item.type : '*'
    if (!isKnownPortType(type)) {
      issues.push({
        level: 3,
        message: `节点 ${nodeId} 的${kind}端口「${item.name}」类型 ${type} 未知，已降级为 *`,
      })
      type = '*'
    }
    ports.push({ name: item.name, type })
  }

  return ports
}

/**
 * 三级校验 + 归一化：
 * ① 结构完整性 → 致命错误返回 null
 * ② 引用完整性 → 丢弃悬空连线并记录
 * ③ 类型合法性 → 未知类型降级为 *
 */
export function parseWorkflow(raw: unknown): ParseResult {
  const issues: ImportIssue[] = []

  if (!isRecord(raw)) {
    return { workflow: null, issues: [{ level: 1, message: '工作流必须是 JSON 对象' }] }
  }
  if (!Array.isArray(raw.nodes)) {
    return { workflow: null, issues: [{ level: 1, message: '缺少 nodes 数组' }] }
  }
  if (!Array.isArray(raw.links)) {
    return { workflow: null, issues: [{ level: 1, message: '缺少 links 数组' }] }
  }

  const rawConfig = isRecord(raw.config) ? raw.config : {}
  const rawVersion = Number(rawConfig.schema_version ?? SCHEMA_VERSION)
  if (!Number.isInteger(rawVersion) || rawVersion < 1) {
    return { workflow: null, issues: [{ level: 1, message: `非法的 schema_version：${rawConfig.schema_version}` }] }
  }
  if (rawVersion > SCHEMA_VERSION) {
    return {
      workflow: null,
      issues: [{ level: 1, message: `工作流版本 ${rawVersion} 高于当前支持的 ${SCHEMA_VERSION}` }],
    }
  }

  const nodes: UINode[] = []
  const nodeById = new Map<number, UINode>()

  for (const item of raw.nodes) {
    if (!isRecord(item) || typeof item.id !== 'number' || typeof item.type !== 'string') {
      issues.push({ level: 2, message: '跳过缺少 id 或 type 的节点' })
      continue
    }
    if (nodeById.has(item.id)) {
      issues.push({ level: 2, message: `节点 id 重复（${item.id}），已跳过` })
      continue
    }
    const node: UINode = {
      id: item.id,
      type: item.type,
      ...(typeof item.title === 'string' ? { title: item.title } : {}),
      pos: readPoint(item.pos, [0, 0]),
      size: readPoint(item.size, [220, 120]),
      mode: item.mode === 1 || item.mode === 2 ? item.mode : 0,
      inputs: readPorts(item.inputs, item.id, '输入', issues),
      outputs: readPorts(item.outputs, item.id, '输出', issues),
      widgets_values: Array.isArray(item.widgets_values) ? [...item.widgets_values] : [],
      ...(Array.isArray(item.widget_names)
        ? { widget_names: item.widget_names.filter((name): name is string => typeof name === 'string') }
        : {}),
    }
    nodes.push(node)
    nodeById.set(node.id, node)
  }

  const links: UILink[] = []
  const linkIds = new Set<number>()

  for (const item of raw.links) {
    if (!Array.isArray(item) || item.length < 5) {
      issues.push({ level: 2, message: '跳过格式不正确的连线' })
      continue
    }
    const [id, originId, originSlot, targetId, targetSlot] = item.map(Number)
    if (![id, originId, originSlot, targetId, targetSlot].every(Number.isInteger)) {
      issues.push({ level: 2, message: '跳过包含非整数字段的连线' })
      continue
    }
    if (linkIds.has(id)) {
      issues.push({ level: 2, message: `连线 id 重复（${id}），已跳过` })
      continue
    }
    const origin = nodeById.get(originId)
    const target = nodeById.get(targetId)
    if (!origin || !target) {
      issues.push({ level: 2, message: `连线 ${id} 的端点节点不存在，已丢弃` })
      continue
    }
    if (originSlot < 0 || originSlot >= origin.outputs.length || targetSlot < 0 || targetSlot >= target.inputs.length) {
      issues.push({ level: 2, message: `连线 ${id} 的槽位越界，已丢弃` })
      continue
    }
    let type = typeof item[5] === 'string' ? item[5] : String(origin.outputs[originSlot].type)
    if (!isKnownPortType(type)) {
      issues.push({ level: 3, message: `连线 ${id} 的类型 ${type} 未知，已降级为 *` })
      type = '*'
    }
    linkIds.add(id)
    links.push([id, originId, originSlot, targetId, targetSlot, type])
  }

  // 以 links 为唯一真相源重建两侧索引，修正导入数据里不一致的 link/links 字段
  for (const node of nodes) {
    for (const port of node.inputs) port.link = null
    for (const port of node.outputs) port.links = []
  }
  for (const link of links) {
    const target = nodeById.get(link[3])
    const origin = nodeById.get(link[1])
    if (target) target.inputs[link[4]].link = link[0]
    if (origin) origin.outputs[link[2]].links?.push(link[0])
  }

  const groups: UIGroup[] = Array.isArray(raw.groups)
    ? raw.groups.flatMap((item): UIGroup[] => {
        if (!isRecord(item) || typeof item.id !== 'number') return []
        return [
          {
            id: item.id,
            title: typeof item.title === 'string' ? item.title : 'Group',
            pos: readPoint(item.pos, [0, 0]),
            size: readPoint(item.size, [200, 100]),
            ...(typeof item.color === 'string' ? { color: item.color } : {}),
            ...(Array.isArray(item.nodes)
              ? { nodes: item.nodes.filter((id): id is number => typeof id === 'number') }
              : {}),
          },
        ]
      })
    : []

  const lastNodeId = Math.max(
    Number(raw.last_node_id) || 0,
    ...nodes.map((node) => node.id),
    0,
  )
  const lastLinkId = Math.max(
    Number(raw.last_link_id) || 0,
    ...links.map((link) => link[0]),
    0,
  )

  const workflow: WorkflowUI = {
    last_node_id: lastNodeId,
    last_link_id: lastLinkId,
    nodes,
    links,
    groups,
    config: { ...rawConfig, schema_version: SCHEMA_VERSION },
  }

  return { workflow: migrateWorkflow(workflow), issues }
}

/** 版本迁移入口：后续 schema 升级时在这里按版本分派 */
export function migrateWorkflow(workflow: WorkflowUI): WorkflowUI {
  return workflow
}
