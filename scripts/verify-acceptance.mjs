import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

/**
 * 阶段 5 验收脚本：覆盖规划 §11.1 的功能完整性、性能、错误处理与兼容性。
 * 与 verify-canvas.mjs 的分工：
 * - verify-canvas 关注画布交互的逐项回归；
 * - 本脚本关注"完整工作流 + 性能 + 异常路径"的端到端验收。
 */

const url = process.env.CANVAS_URL ?? 'http://127.0.0.1:5173'
const results = []

const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

await page.addInitScript(() => localStorage.clear())
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__graphDebug))
await page.waitForSelector('.graph-port')

const dragPort = async (fromSelector, toSelector) => {
  const from = await page.locator(fromSelector).first().boundingBox()
  const to = await page.locator(toSelector).first().boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}

const graphState = () =>
  page.evaluate(() => ({ nodes: window.__graphDebug.graph.nodes.length, links: window.__graphDebug.graph.links.size }))

// ① 3D 示例：载入后 11 节点 8 连线，编译产物就绪
await page.getByRole('button', { name: '载入 3D 示例' }).click()
await page.waitForTimeout(700)
const sample = await page.evaluate(() => {
  const api = window.__graphDebug
  const state = api.programState()
  return {
    nodes: api.graph.nodes.length,
    links: api.graph.links.size,
    shading: state.shading,
    lights: state.lighting?.lights?.length,
    postfx: state.postfx,
  }
})
check('3D 示例 11 节点 / 9 连线', sample.nodes === 11 && sample.links === 9, `${sample.nodes} / ${sample.links}`)
check(
  '3D 示例编译产物就绪',
  sample.shading === 'pbr' && sample.lights === 2 && sample.postfx.length === 1,
  `shading=${sample.shading} lights=${sample.lights} postfx=${sample.postfx.join('>')}`,
)

// ② 删除节点 → 撤销恢复
const nodeToDelete = await page.locator('.graph-node[data-node-id="5"]').boundingBox()
// 点击靠左的位置，避免落到右侧检查器面板上
await page.mouse.click(nodeToDelete.x + 30, nodeToDelete.y + 14)
await page.waitForTimeout(150)
await page.keyboard.press('Delete')
await page.waitForTimeout(300)
const afterDelete = await graphState()
await page.evaluate(() => window.__graphDebug.undo())
await page.waitForTimeout(300)
const afterRestore = await graphState()
check(
  '删除节点后撤销恢复',
  afterDelete.nodes === 10 && afterRestore.nodes === 11 && afterRestore.links === 9,
  `${afterDelete.nodes} → ${afterRestore.nodes}`,
)

// ③ 导出 → 导入结构一致
const roundTrip = await page.evaluate(() => {
  const api = window.__graphDebug
  const exported = api.exportWorkflow()
  const result = api.importWorkflow(exported)
  const normalize = (workflow) =>
    JSON.stringify({
      nodes: workflow.nodes
        .map((node) => [node.id, node.type, node.pos, node.size, node.widgets_values])
        .sort((left, right) => left[0] - right[0]),
      links: workflow.links.map((link) => [link[1], link[2], link[3], link[4], link[5]]).sort(),
    })
  return { ok: result.ok, same: normalize(exported) === normalize(api.exportWorkflow()) }
})
check('导出再导入结构一致', roundTrip.ok && roundTrip.same)

// ④ 非法类型连接：被拦截并给出提示
await page.evaluate(() => window.__graphDebug.setView(0.6, 0, 40))
await page.waitForTimeout(200)
await dragPort(
  '.graph-port[data-direction="out"][data-port-type="GEOMETRY"]',
  '.graph-port[data-direction="in"][data-port-type="MATERIAL"]',
)
const invalid = await page.evaluate(() => ({
  links: window.__graphDebug.graph.links.size,
  toasts: [...document.querySelectorAll('.toast')].map((element) => element.textContent).join(' | '),
}))
check('非法类型连接被拦截', invalid.links === 9, `${invalid.links} 条`)
check('非法连接给出提示', /类型不匹配/.test(invalid.toasts), invalid.toasts)

// ⑤ 环路拦截：用干净的两个 shader/Math，避免节点重叠遮挡端口
await page.evaluate(() => {
  const mathNode = (id, x) => ({
    id,
    type: 'shader/Math',
    pos: [x, 100],
    size: [170, 120],
    inputs: [
      { name: 'a', type: 'FLOAT', link: null },
      { name: 'b', type: 'FLOAT', link: null },
    ],
    outputs: [{ name: 'result', type: 'FLOAT', links: [] }],
    widgets_values: ['mul'],
  })
  window.__graphDebug.importWorkflow({
    nodes: [mathNode(20, 100), mathNode(21, 420)],
    links: [],
    config: { schema_version: 2 },
  })
})
await page.waitForTimeout(400)
const firstMath = 20
const secondMath = 21
await dragPort(
  `.graph-port[data-node-id="${firstMath}"][data-direction="out"][data-port-index="0"]`,
  `.graph-port[data-node-id="${secondMath}"][data-direction="in"][data-port-index="0"]`,
)
const forwardLinks = (await graphState()).links
await dragPort(
  `.graph-port[data-node-id="${secondMath}"][data-direction="out"][data-port-index="0"]`,
  `.graph-port[data-node-id="${firstMath}"][data-direction="in"][data-port-index="0"]`,
)
const cycle = await page.evaluate(() => ({
  links: window.__graphDebug.graph.links.size,
  toasts: [...document.querySelectorAll('.toast')].map((element) => element.textContent).join(' | '),
}))
check('同类连线可建立（环路前置）', forwardLinks === 1, `${forwardLinks} 条`)
check('环路被拦截', cycle.links === 1, `${cycle.links} 条`)
check('环路给出提示', /循环依赖/.test(cycle.toasts), cycle.toasts)

// ⑥ 100 节点渲染性能 + 撤销
const originalWorkflow = await page.evaluate(() => window.__graphDebug.exportWorkflow())
const perf = await page.evaluate(() => {
  const api = window.__graphDebug
  const nodes = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    type: 'shader/Float',
    pos: [(index % 10) * 260, Math.floor(index / 10) * 200],
    size: [160, 90],
    inputs: [],
    outputs: [],
    widgets_values: [1],
  }))
  const result = api.importWorkflow({ nodes, links: [], config: { schema_version: 1 } })
  const count = api.graph.nodes.length

  const measure = () => {
    const canvas = api.canvas
    let max = 0
    const start = performance.now()
    for (let frame = 0; frame < 20; frame++) {
      const begin = performance.now()
      canvas.draw(true, true)
      max = Math.max(max, performance.now() - begin)
    }
    return { avg: (performance.now() - start) / 20, max }
  }

  api.setView(0.3, 40, 40)
  const zoomOut = measure()
  api.setView(1, 0, 0)
  const zoomIn = measure()
  return { ok: result.ok, count, zoomOut, zoomIn }
})
check('100 节点导入成功', perf.ok && perf.count === 100, `${perf.count} 个`)
check(
  '100 节点渲染 ≥ 50fps（0.3x）',
  perf.zoomOut.avg < 20 && perf.zoomOut.max < 33,
  `平均 ${perf.zoomOut.avg.toFixed(1)}ms / 峰值 ${perf.zoomOut.max.toFixed(1)}ms`,
)

await page.evaluate(() => window.__graphDebug.setView(0.3, 40, 40))
await page.waitForTimeout(300)
const lodState = await page.evaluate(() => ({
  domNodes: document.querySelectorAll('.graph-node').length,
  lod: document.querySelector('.node-overlay')?.classList.contains('is-lod') ?? false,
  widgetDisplay: getComputedStyle(document.querySelector('.graph-widgets')).display,
}))
check(
  '100 节点 LOD 生效',
  lodState.domNodes === 100 && lodState.lod && lodState.widgetDisplay === 'none',
  `DOM ${lodState.domNodes} / LOD ${lodState.lod}`,
)

await page.evaluate(() => window.__graphDebug.undo())
await page.waitForTimeout(300)
const undoCount = (await graphState()).nodes
await page.evaluate(() => window.__graphDebug.redo())
await page.waitForTimeout(300)
const redoCount = (await graphState()).nodes
check('撤销/重做恢复 100 节点导入', undoCount === 2 && redoCount === 100, `${undoCount} → ${redoCount}`)

await page.evaluate((workflow) => window.__graphDebug.importWorkflow(workflow), originalWorkflow)
await page.evaluate(() => window.__graphDebug.setView(1, 0, 0))
await page.waitForTimeout(300)

// ⑦ localStorage 写入失败不影响编辑
const resilient = await page.evaluate(() => {
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  proto.setItem = () => {
    throw new Error('QuotaExceededError')
  }
  try {
    window.__graphDebug.saveNow()
    return true
  } catch {
    return false
  } finally {
    proto.setItem = original
  }
})
check('localStorage 写入失败不崩溃', resilient && pageErrors.length === 0, `${pageErrors.length} 个页面异常`)

// ⑧ 保存后刷新恢复（独立上下文，避免与主流程互相影响）
const persistContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const persistPage = await persistContext.newPage()
await persistPage.goto(url, { waitUntil: 'networkidle' })
await persistPage.waitForFunction(() => Boolean(window.__graphDebug))
await persistPage.waitForSelector('.graph-port')
const persistedBefore = await persistPage.evaluate(() => window.__graphDebug.graph.nodes.length)
await persistPage.getByRole('button', { name: /Vec3/ }).click()
await persistPage.waitForTimeout(300)
await persistPage.evaluate(() => window.__graphDebug.saveNow())
const persistedAdded = await persistPage.evaluate(() => window.__graphDebug.graph.nodes.length)
await persistPage.reload({ waitUntil: 'networkidle' })
await persistPage.waitForFunction(() => Boolean(window.__graphDebug))
await persistPage.waitForSelector('.graph-port')
const persistedAfter = await persistPage.evaluate(() => window.__graphDebug.graph.nodes.length)
await persistContext.close()
check(
  '保存后刷新恢复',
  persistedAdded === persistedBefore + 1 && persistedAfter === persistedAdded,
  `${persistedBefore} → ${persistedAdded} → ${persistedAfter}`,
)

// ⑨ 1280 / 1920 布局无溢出
for (const width of [1280, 1920]) {
  const probeContext = await browser.newContext({ viewport: { width, height: 860 } })
  const probePage = await probeContext.newPage()
  await probePage.goto(url, { waitUntil: 'networkidle' })
  await probePage.waitForFunction(() => Boolean(window.__graphDebug))
  const layout = await probePage.evaluate(() => {
    const canvas = document.querySelector('.graph-canvas').getBoundingClientRect()
    const header = document.querySelector('.app-header').getBoundingClientRect()
    const side = document.querySelector('.side-panel').getBoundingClientRect()
    const status = document.querySelector('.status-bar').getBoundingClientRect()
    return {
      canvasWidth: canvas.width,
      maxRight: Math.max(header.right, side.right, status.right),
      innerWidth: window.innerWidth,
    }
  })
  await probeContext.close()
  check(
    `${width}px 布局无溢出`,
    layout.maxRight <= layout.innerWidth + 0.5 && layout.canvasWidth > 400,
    `画布 ${Math.round(layout.canvasWidth)}px`,
  )
}

// ⑩ 仓库内的 3D 示例 JSON 可直接导入
const sampleFile = JSON.parse(readFileSync('examples/shader-demo.workflow.json', 'utf8'))
const fileImport = await page.evaluate((workflow) => {
  const result = window.__graphDebug.importWorkflow(workflow)
  return { ok: result.ok, nodes: window.__graphDebug.graph.nodes.length, links: window.__graphDebug.graph.links.size }
}, sampleFile)
check('示例 JSON 可导入', fileImport.ok && fileImport.nodes === 11 && fileImport.links === 9, `${fileImport.nodes} / ${fileImport.links}`)

check('无页面异常', pageErrors.length === 0, `${pageErrors.length} 个`)

const passed = results.filter((result) => result.ok).length
console.log(`\n${passed}/${results.length} 项通过`)
await browser.close()
process.exit(passed === results.length ? 0 : 1)
