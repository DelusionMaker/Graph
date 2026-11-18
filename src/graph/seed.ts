import type { LGraph } from '@comfyorg/litegraph'
import { DemoSource, DemoTarget } from './registerNodes'

/** 阶段 1 的示例图；阶段 3 接入导入/持久化后由工作流数据替代 */
export function seedDemoGraph(graph: LGraph): void {
  const source = new DemoSource('Source')
  source.pos = [80, 120]
  graph.add(source)

  const target = new DemoTarget('Target')
  target.pos = [440, 200]
  graph.add(target)
}
