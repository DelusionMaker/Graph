import { useEffect, useRef } from 'react'
import type { DirectionalLight } from 'three'
import type { EnvironmentSettings } from '../shader/compiler'
import { useProgramStore } from '../shader/useProgramStore'
import { useRequestFrame } from './requestFrame'

const FALLBACK: EnvironmentSettings = {
  ambient: 0.7,
  dirIntensity: 2.2,
  lightPos: [4, 6, 4],
  shadowEnabled: true,
  shadowMapSize: 1024,
  shadowBias: -0.0005,
}

/** Environment 节点驱动光照与阴影；参数变化只更新灯光，不重建场景 */
export function Lights() {
  const environment = useProgramStore((state) => state.program?.environment) ?? FALLBACK
  const lightRef = useRef<DirectionalLight>(null)
  const requestFrame = useRequestFrame()

  useEffect(() => {
    const light = lightRef.current
    if (!light) return

    // 改尺寸前必须释放旧 FBO，否则会泄漏
    if (light.shadow.mapSize.x !== environment.shadowMapSize) {
      light.shadow.map?.dispose()
      light.shadow.map = null
      light.shadow.mapSize.set(environment.shadowMapSize, environment.shadowMapSize)
    }
    light.shadow.bias = environment.shadowBias
    requestFrame()
  }, [environment.shadowMapSize, environment.shadowBias, requestFrame])

  return (
    <>
      <ambientLight intensity={environment.ambient} />
      <directionalLight
        ref={lightRef}
        position={environment.lightPos}
        intensity={environment.dirIntensity}
        castShadow={environment.shadowEnabled}
      />
    </>
  )
}
