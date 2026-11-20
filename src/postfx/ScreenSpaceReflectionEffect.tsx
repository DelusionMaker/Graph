import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { ScreenSpaceReflectionEffect, type ScreenSpaceReflectionOptions } from './ssr'

type ScreenSpaceReflectionProps = Partial<ScreenSpaceReflectionOptions>

export const ScreenSpaceReflection = forwardRef<
  ScreenSpaceReflectionEffect,
  ScreenSpaceReflectionProps
>(function ScreenSpaceReflection(
  { samples = 12, maxDistance = 6, thickness = 0.3, intensity = 0.6 },
  ref,
) {
  const { camera, normalPass } = useContext(EffectComposerContext)
  const gl = useThree((state) => state.gl)
  const supported = gl.capabilities.isWebGL2
  const normalBuffer = normalPass?.texture ?? null
  const initialOptions = useRef<ScreenSpaceReflectionOptions>({
    samples,
    maxDistance,
    thickness,
    intensity,
  })

  const effect = useMemo(
    () => new ScreenSpaceReflectionEffect(camera, normalBuffer, initialOptions.current),
    [camera, normalBuffer],
  )

  useEffect(() => {
    effect.setParams({ samples, maxDistance, thickness, intensity })
  }, [effect, samples, maxDistance, thickness, intensity])

  useFrame(() => effect.updateProjection(camera))

  useImperativeHandle(ref, () => effect, [effect])

  return supported ? <primitive object={effect} dispose={null} /> : null
})
