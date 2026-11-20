import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { CustomSSAOEffect, type CustomSSAOOptions } from './customSSAO'

type CustomSSAOProps = Partial<CustomSSAOOptions>

export const CustomSSAO = forwardRef<CustomSSAOEffect, CustomSSAOProps>(function CustomSSAO(
  {
    samples = 16,
    radius = 0.1,
    intensity = 1,
    worldDistanceThreshold = 0.5,
    worldDistanceFalloff = 0.1,
    worldProximityThreshold = 0.5,
    worldProximityFalloff = 0.1,
  },
  ref,
) {
  const { camera, normalPass } = useContext(EffectComposerContext)
  const gl = useThree((state) => state.gl)
  const supported = gl.capabilities.isWebGL2
  const normalBuffer = normalPass?.texture ?? null
  const initialOptions = useRef<CustomSSAOOptions>({
    samples,
    radius,
    intensity,
    worldDistanceThreshold,
    worldDistanceFalloff,
    worldProximityThreshold,
    worldProximityFalloff,
  })

  const effect = useMemo(
    () => new CustomSSAOEffect(camera, normalBuffer, initialOptions.current),
    [camera, normalBuffer],
  )

  useEffect(() => {
    effect.setParams({
      samples,
      radius,
      intensity,
      worldDistanceThreshold,
      worldDistanceFalloff,
      worldProximityThreshold,
      worldProximityFalloff,
    })
  }, [
    effect,
    samples,
    radius,
    intensity,
    worldDistanceThreshold,
    worldDistanceFalloff,
    worldProximityThreshold,
    worldProximityFalloff,
  ])

  useFrame(() => effect.updateProjection(camera))

  useImperativeHandle(ref, () => effect, [effect])

  return supported ? <primitive object={effect} dispose={null} /> : null
})
