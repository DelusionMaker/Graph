import type { EmitContext, EmitResult } from './index'

export function emitMath(ctx: EmitContext): EmitResult {
  const op = String(ctx.widget('op') ?? 'mul')
  const a = ctx.input('a')?.expr ?? ctx.error('Math 节点缺少输入 a')

  if (op === 'sin') return { expr: `sin(${a})`, type: 'FLOAT' }

  const b = ctx.input('b')?.expr ?? ctx.error(`Math 节点（${op}）缺少输入 b`)

  switch (op) {
    case 'add':
      return { expr: `(${a} + ${b})`, type: 'FLOAT' }
    case 'sub':
      return { expr: `(${a} - ${b})`, type: 'FLOAT' }
    case 'mul':
      return { expr: `(${a} * ${b})`, type: 'FLOAT' }
    case 'div':
      return { expr: `(${a} / max(${b}, 1e-5))`, type: 'FLOAT' }
    case 'pow':
      return { expr: `pow(max(${a}, 0.0), ${b})`, type: 'FLOAT' }
    case 'lerp':
      ctx.warn('Math lerp 使用固定的 0.5 混合系数（节点没有 t 输入）')
      return { expr: `mix(${a}, ${b}, 0.5)`, type: 'FLOAT' }
    default:
      return ctx.error(`未知的 Math 运算：${op}`)
  }
}

export function emitMixColor(ctx: EmitContext): EmitResult {
  const a = ctx.input('a')?.expr ?? ctx.error('MixColor 节点缺少输入 a')
  const b = ctx.input('b')?.expr ?? ctx.error('MixColor 节点缺少输入 b')
  const t = ctx.input('t')?.expr ?? ctx.error('MixColor 节点缺少输入 t')
  return { expr: `mix(${a}, ${b}, clamp(${t}, 0.0, 1.0))`, type: 'COLOR' }
}
