import type { EmitContext, EmitResult, TextureSlot } from './index'

export function emitTexture(ctx: EmitContext): EmitResult {
  const assetId = String(ctx.widget('assetId') ?? '').trim()
  if (!assetId) ctx.error('Texture 节点缺少贴图（assetId 为空）')

  const uv = ctx.input('uv')?.expr ?? 'vShaderUv'
  const wrapValue = String(ctx.widget('wrap') ?? 'repeat')
  const wrap: TextureSlot['wrap'] =
    wrapValue === 'clamp' ? 'clamp' : wrapValue === 'mirror' ? 'mirror' : 'repeat'
  const flipY = ctx.widget('flipY') !== false

  const uniform = ctx.texture('tex', assetId, wrap, flipY)
  return { expr: `texture2D(${uniform}, ${uv}).rgb`, type: 'COLOR' }
}
