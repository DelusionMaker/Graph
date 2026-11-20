import type { EmitContext, EmitResult } from './index'
import { readNumber } from './values'

/** 输出一个等距柱状 HDR 环境贴图及其强度 / 旋转参数。 */
export function emitHdr(ctx: EmitContext): EmitResult {
  const assetId = String(ctx.widget('assetId') ?? '').trim()
  const sampler = ctx.texture('hdr', assetId, 'clamp', true)

  const intensity = ctx.uniform('intensity', 'float', readNumber(ctx.widget('intensity'), 1), {
    nodeId: ctx.nodeId,
    widgets: ['intensity'],
    kind: 'float',
  })
  const rotation = ctx.uniform('rotation', 'float', readNumber(ctx.widget('rotation'), 0), {
    nodeId: ctx.nodeId,
    widgets: ['rotation'],
    kind: 'float',
  })

  return {
    expr: sampler,
    type: 'HDRI',
    environment: { sampler, intensity, rotation },
  }
}
