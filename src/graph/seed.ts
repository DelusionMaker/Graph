import { LiteGraph, type LGraph } from '@comfyorg/litegraph'

/**
 * 阶段 2 的示例工作流：加载器 / 文本编码 / 采样 / 空 latent。
 * 不预置连线，交给自动验证脚本按类型创建，顺便验证类型系统。
 */
export function seedDemoGraph(graph: LGraph): void {
  const place = (type: string, pos: [number, number]) => {
    const node = LiteGraph.createNode(type)
    if (!node) return null
    node.pos = pos
    graph.add(node)
    return node
  }

  place('loaders/CheckpointLoader', [60, 90])
  place('sampling/KSampler', [400, 120])
  place('conditioning/CLIPTextEncode', [60, 560])
  place('latent/EmptyLatentImage', [620, 560])
}
