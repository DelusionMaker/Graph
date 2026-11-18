import { LGraphNode, LiteGraph } from '@comfyorg/litegraph'

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
}
