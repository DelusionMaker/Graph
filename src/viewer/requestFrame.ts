import { useThree } from '@react-three/fiber'

/**
 * R3F 单帧渲染请求。
 *
 * 命名刻意与数据失效链路（桥接层 commit + invalidateProgram）区分：
 * - requestFrame：只请求重绘一帧，不改变任何业务状态；
 * - invalidateProgram：让编译产物失效，触发 shader 重编译。
 */
export function useRequestFrame(): () => void {
  return useThree((state) => state.invalidate)
}
