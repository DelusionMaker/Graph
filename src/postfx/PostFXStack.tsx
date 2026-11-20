import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing'
import { useMemo, type ReactElement } from 'react'
import { useProgramStore } from '../shader/useProgramStore'
import type { PostFXDescriptor } from './chain'
import { CustomSSAO } from './CustomSSAOEffect'

const EMPTY: PostFXDescriptor[] = []

function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function renderEffect(item: PostFXDescriptor): ReactElement | null {
  const params = item.params
  switch (item.type) {
    case 'Bloom':
      return (
        <Bloom
          key={item.id}
          intensity={numberParam(params.intensity, 1)}
          luminanceThreshold={numberParam(params.luminanceThreshold, 0.2)}
          mipmapBlur={params.mipmapBlur !== false}
        />
      )
    case 'SSAO':
      return (
        <CustomSSAO
          key={item.id}
          samples={numberParam(params.samples, 16)}
          radius={numberParam(params.radius, 0.1)}
          intensity={numberParam(params.intensity, 1)}
          worldDistanceThreshold={numberParam(params.worldDistanceThreshold, 0.5)}
          worldDistanceFalloff={numberParam(params.worldDistanceFalloff, 0.1)}
          worldProximityThreshold={numberParam(params.worldProximityThreshold, 0.5)}
          worldProximityFalloff={numberParam(params.worldProximityFalloff, 0.1)}
        />
      )
    case 'Vignette':
      return (
        <Vignette
          key={item.id}
          darkness={numberParam(params.darkness, 0.5)}
          offset={numberParam(params.offset, 0.3)}
        />
      )
    case 'SMAA':
      return <SMAA key={item.id} />
    default:
      return null
  }
}

/**
 * 后处理链：按编译产物的顺序渲染。
 * 链结构变化时用 key 重建 Composer；仅参数变化时复用同一个 Composer。
 */
export function PostFXStack() {
  const chain = useProgramStore((state) => state.program?.postfxChain ?? EMPTY)
  const chainHash = useMemo(() => chain.map((item) => `${item.id}:${item.type}`).join('|'), [chain])

  if (chain.length === 0) return null

  const effects = chain
    .map(renderEffect)
    .filter((element): element is ReactElement => element !== null)
  // SSAO 依赖 NormalPass，未开启时组件会直接报错并返回空 effect
  const needsNormalPass = chain.some((item) => item.type === 'SSAO')

  return (
    <EffectComposer key={chainHash} multisampling={0} enableNormalPass={needsNormalPass}>
      {effects}
    </EffectComposer>
  )
}
