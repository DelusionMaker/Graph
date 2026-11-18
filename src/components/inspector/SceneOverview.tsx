import type { EnvironmentSettings } from '../../shader/compiler'
import { useProgramStore, type ProgramStatus } from '../../shader/useProgramStore'

const FALLBACK_ENV: EnvironmentSettings = {
  ambient: 0.7,
  dirIntensity: 2.2,
  lightPos: [4, 6, 4],
  shadowEnabled: true,
  shadowMapSize: 1024,
  shadowBias: -0.0005,
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
  const environment = program?.environment ?? FALLBACK_ENV

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
        <h3>环境</h3>
        <ul className="stats">
          <li>环境光：{environment.ambient.toFixed(2)}</li>
          <li>平行光：{environment.dirIntensity.toFixed(2)}</li>
          <li>
            阴影：
            {environment.shadowEnabled
              ? `开启（${environment.shadowMapSize}）`
              : '关闭'}
          </li>
        </ul>
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
            <p key={`${error.nodeId ?? 'global'}-${index}`} className="inspector-error">
              {error.nodeId != null ? `#${error.nodeId} ` : ''}
              {error.message}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}
