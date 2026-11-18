import { useGraphActions } from '../../graph/actions'
import type { ProgramError } from '../../shader/useProgramStore'

/** 编译错误首行提示；点击可定位到出错节点 */
export function CompileBanner({ errors }: { errors: ProgramError[] }) {
  const focusNode = useGraphActions((state) => state.focusNode)

  if (errors.length === 0) return null

  const first = errors[0]
  const firstLine = first.message.split('\n')[0]

  return (
    <div className="inspector-error-banner" role="alert">
      <strong>编译失败</strong>
      <button
        type="button"
        className="inspector-error-link"
        title="定位到出错节点"
        onClick={() => {
          if (first.nodeId != null) focusNode(first.nodeId)
        }}
      >
        {first.nodeId != null ? `#${first.nodeId} ` : ''}
        {firstLine}
      </button>
      <span className="inspector-error-hint">视口保留上一次成功结果</span>
    </div>
  )
}
