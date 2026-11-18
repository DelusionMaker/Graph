import { useGraphActions } from '../../graph/actions'
import type { LightDescriptor } from '../../shader/compiler'
import { useProgramStore, type ProgramStatus } from '../../shader/useProgramStore'

const LIGHT_LABEL: Record<LightDescriptor['type'], string> = {
  ambient: '环境光',
  directional: '平行光',
  point: '点光',
}

const STATUS_LABEL: Record<ProgramStatus, string> = {
  idle: '空闲',
  dirty: '待编译',
  compiling: '编译中',
  ready: '就绪',
  error: '错误',
}

/** 未选中节点时的场景概览 */
export function SceneOverview() {
  const status = useProgramStore((state) => state.status)
  const program = useProgramStore((state) => state.program)
  const errors = useProgramStore((state) => state.errors)
  const lastGood = useProgramStore((state) => state.lastGoodProgram)
  const focusNode = useGraphActions((state) => state.focusNode)
  const lighting = program?.lighting

  return (
    <div className="inspector scene-overview">
      <h2>场景概览</h2>
      <p className="hint">未选中节点 · 在画布中点击节点查看参数</p>

      <section>
        <h3>编译</h3>
        <ul className="stats">
          <li>状态：{STATUS_LABEL[status]}</li>
          <li>结构哈希：{program?.hash || '—'}</li>
          <li>着色：{program?.shading === 'unlit' ? 'Unlit' : 'PBR'}</li>
          {status === 'error' && lastGood && <li>视口保持上一次成功结果</li>}
        </ul>
      </section>

      <section>
        <h3>网格</h3>
        <ul className="stats">
          <li>来源：{program?.meshFromNode ? 'scene/Mesh 节点' : '工具条兜底'}</li>
          <li>形状：{program?.mesh.shape ?? '—'}</li>
          <li>缩放：{program?.mesh.scale ?? 1}</li>
        </ul>
      </section>

      <section>
        <h3>光照</h3>
        {lighting && lighting.lights.length > 0 ? (
          <ul className="stats">
            {lighting.lights.map((light, index) => (
              <li key={`${light.type}-${index}`}>
                {LIGHT_LABEL[light.type]}：强度 {light.intensity.toFixed(2)}
              </li>
            ))}
            <li>
              阴影：
              {lighting.shadow?.enabled
                ? `开启（${lighting.shadow.mapSize}）`
                : '关闭'}
            </li>
          </ul>
        ) : (
          <p className="inspector-none">默认光照（未连接灯光组）</p>
        )}
      </section>

      <section>
        <h3>后处理链</h3>
        {program && program.postfxChain.length > 0 ? (
          <ol className="scene-chain">
            {program.postfxChain.map((item) => (
              <li key={item.id}>{item.type}</li>
            ))}
          </ol>
        ) : (
          <p className="inspector-none">无（连接效果节点到 postfx/Output）</p>
        )}
      </section>

      {errors.length > 0 && (
        <section>
          <h3>编译错误</h3>
          {errors.map((error, index) => (
            <button
              key={`${error.nodeId ?? 'global'}-${index}`}
              type="button"
              className="inspector-error inspector-error-link"
              title={error.nodeId != null ? '定位到出错节点' : undefined}
              onClick={() => {
                if (error.nodeId != null) focusNode(error.nodeId)
              }}
            >
              {error.nodeId != null ? `#${error.nodeId} ` : ''}
              {error.message}
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
