let gestureActive = false
let lastError: string | null = null

/** 一次连线拖拽开始：只记录本次手势内的错误 */
export function beginConnectionGesture(): void {
  gestureActive = true
  lastError = null
}

/** 一次连线拖拽结束：返回最后一次拒绝原因（悬停类型错误 / 落点环路），没有则返回 null */
export function endConnectionGesture(): string | null {
  const message = lastError
  lastError = null
  gestureActive = false
  return message
}

/**
 * 记录连接被拒绝的原因。拖拽过程中可能经过多个端口，
 * 只保留最后一次，等松手后统一提示，避免中途的类型错误盖住落点的环路错误。
 */
export function reportConnectionError(message: string): void {
  if (!gestureActive) return
  lastError = message
}
