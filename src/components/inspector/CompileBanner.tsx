import type { ProgramError } from '../../shader/useProgramStore'

/** 编译错误首行提示；错误详情在场景概览里完整列出 */
export function CompileBanner({ errors }: { errors: ProgramError[] }) {
  if (errors.length === 0) return null

  const first = errors[0]
  const firstLine = first.message.split('\n')[0]

  return (
    <div className="inspector-error-banner" role="alert">
      <strong>编译失败</strong>
      <span>
        {first.nodeId != null ? `#${first.nodeId} ` : ''}
        {firstLine}
      </span>
      <span className="inspector-error-hint">视口保留上一次成功结果</span>
    </div>
  )
}
