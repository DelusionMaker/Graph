import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.env.CANVAS_URL ?? 'http://127.0.0.1:5173'
const WHITE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const checks = []

function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
}

function makeNode(id, type, pos, size, inputs, outputs, widgets) {
  return { id, type, pos, size, inputs, outputs, widgets_values: widgets }
}

function buildWorkflow(options = {}) {
  const { shape = 'sphere', postfx = [], extraNodes = [], extraLinks = [] } = options
  const nodes = [
    makeNode(1, 'scene/Mesh', [40, 40], [220, 120], [], [{ name: 'geometry', type: 'GEOMETRY', links: [1] }], [shape, '', 1, false]),
    makeNode(2, 'scene/Root', [640, 40], [200, 100], [
      { name: 'geometry', type: 'GEOMETRY', link: 1 },
      { name: 'material', type: 'MATERIAL', link: 4 },
      { name: 'lights', type: 'LIGHTS', link: 11 },
    ], [], []),
    makeNode(3, 'shader/Color', [40, 240], [180, 100], [], [{ name: 'color', type: 'COLOR', links: [2] }], ['#ff3355']),
    makeNode(4, 'material/Surface', [320, 240], [220, 180], [
      { name: 'baseColor', type: 'COLOR', link: 2 },
      { name: 'roughness', type: 'FLOAT', link: 3 },
      { name: 'metalness', type: 'FLOAT', link: null },
      { name: 'emissive', type: 'COLOR', link: null },
    ], [{ name: 'material', type: 'MATERIAL', links: [4] }], ['pbr']),
    makeNode(5, 'shader/Float', [40, 480], [160, 100], [], [{ name: 'value', type: 'FLOAT', links: [3] }], [0.25]),
    makeNode(6, 'render/AmbientLight', [700, 240], [200, 90], [], [{ name: 'light', type: 'LIGHT', links: [9] }], ['#ffffff', 0.5]),
    makeNode(7, 'render/DirectionalLight', [700, 380], [210, 150], [], [{ name: 'light', type: 'LIGHT', links: [10] }], ['#ffffff', 1.2, -0.5, -1, -0.4]),
    makeNode(8, 'render/LightRig', [980, 300], [190, 120], [
      { name: 'light1', type: 'LIGHT', link: 9 },
      { name: 'light2', type: 'LIGHT', link: 10 },
      { name: 'light3', type: 'LIGHT', link: null },
    ], [{ name: 'lights', type: 'LIGHTS', links: [11] }], []),
    makeNode(9, 'render/Shadow', [980, 480], [200, 150], [], [], [true, '1024', 0.0015, 2]),
  ]
  const links = [
    [1, 1, 0, 2, 0, 'GEOMETRY'],
    [2, 3, 0, 4, 0, 'COLOR'],
    [3, 5, 0, 4, 1, 'FLOAT'],
    [4, 4, 0, 2, 1, 'MATERIAL'],
    [9, 6, 0, 8, 0, 'LIGHT'],
    [10, 7, 0, 8, 1, 'LIGHT'],
    [11, 8, 0, 2, 2, 'LIGHTS'],
  ]

  // 后处理链：按传入顺序依次串联，最后接 Output
  let nextLink = 5
  const postfxIds = []
  for (let index = 0; index < postfx.length; index += 1) {
    const id = 10 + index
    postfxIds.push(id)
    nodes.push(
      makeNode(id, `postfx/${postfx[index]}`, [640, 300 + index * 80], [200, 120], [{ name: 'in', type: 'POSTFX', link: null }], [{ name: 'out', type: 'POSTFX', links: [] }], []),
    )
  }
  let previousOut = null
  for (let index = 0; index < postfxIds.length; index += 1) {
    const target = index + 1 < postfxIds.length ? postfxIds[index + 1] : 99
    links.push([nextLink++, postfxIds[index], 0, target, 0, 'POSTFX'])
    previousOut = postfxIds[index]
  }
  if (previousOut !== null) {
    nodes.push(makeNode(99, 'postfx/Output', [900, 300], [190, 110], [{ name: 'effects', type: 'POSTFX', link: nextLink - 1 }], [], []))
  }

  nodes.push(...extraNodes)
  links.push(...extraLinks)

  return {
    last_node_id: Math.max(0, ...nodes.map((node) => node.id)),
    last_link_id: Math.max(0, ...links.map((link) => link[0])),
    nodes,
    links,
    groups: [],
    config: { schema_version: 2 },
  }
}

/** 构造一个最小的有效 GLB（3 个退化顶点），用于验证上传链路 */
function buildMinimalGlb() {
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', max: [1, 1, 0], min: [0, 0, 0] },
    ],
  })
  const jsonRaw = Buffer.from(json, 'utf8')
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc((4 - (jsonRaw.length % 4)) % 4, 0x20)])
  const binChunk = Buffer.alloc(36)
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length

  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.writeUInt32LE(0x4e4f534a, 4)

  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binChunk.length, 0)
  binHeader.writeUInt32LE(0x004e4942, 4)

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const pageErrors = []
const consoleErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('404')) {
    consoleErrors.push(message.text())
  }
})

const importWorkflow = async (workflow) => {
  const result = await page.evaluate((raw) => window.__graphDebug.importWorkflow(raw), workflow)
  await page.waitForTimeout(700)
  return result
}

const programState = () => page.evaluate(() => window.__graphDebug.programState())

const exportWorkflow = () => page.evaluate(() => window.__graphDebug.exportWorkflow())

const selectNode = async (id) => {
  const box = await page.locator(`.graph-node[data-node-id="${id}"]`).boundingBox()
  if (!box) return false
  await page.mouse.click(box.x + box.width / 2, box.y + 16)
  await page.waitForTimeout(250)
  return true
}

const deselect = async () => {
  await page.evaluate(() => {
    const canvas = window.__graphDebug.canvas
    canvas.selectItems([])
    canvas.onSelectionChange?.(canvas.selectedItems)
    canvas.setDirty(true, true)
  })
  await page.waitForTimeout(250)
}

const editWidget = async (nodeId, widgetName, value) => {
  await selectNode(nodeId)
  const widget = page.locator(`[data-node-id="${nodeId}"] .graph-widget[data-widget-name="${widgetName}"]`)
  const select = widget.locator('select')
  const checkbox = widget.locator('input[type="checkbox"]')
  const range = widget.locator('input[type="range"]')
  const text = widget.locator('input[type="text"]')
  const number = widget.locator('input[type="number"]')
  if (await select.count()) await select.selectOption(String(value))
  else if (await checkbox.count()) {
    // 受控 checkbox：setChecked 会在 rAF 同步前判定失败，改用 click + 等待
    await checkbox.click()
  } else if (await range.count()) {
    // React 受控 input 必须用原生 setter + input 事件才能触发 onChange
    await range.evaluate((element, next) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(element, String(next))
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  } else if (await text.count()) await text.fill(String(value))
  else if (await number.count()) await number.fill(String(value))
  await page.waitForTimeout(450)
}

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)

// 清空 localStorage，避免上一次测试残留
await page.evaluate(() => window.localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// ---------- A1 内置几何体 ----------
await importWorkflow(buildWorkflow({ shape: 'sphere' }))
let state = await programState()
check('A1 导入后 mesh 为 sphere', state.mesh?.shape === 'sphere', state.mesh?.shape)

await editWidget(1, 'shape', 'box')
state = await programState()
check('A1 切换 mesh 为 box 后编译生效', state.mesh?.shape === 'box', state.mesh?.shape)

// 工具条形状按钮也应写回 scene/Mesh，保持节点为唯一来源
await page.locator('.viewer-shapes button', { hasText: 'Knot' }).click()
await page.waitForTimeout(550)
state = await programState()
check('A1 工具条切换同步节点', state.mesh?.shape === 'torusknot', state.mesh?.shape)

// ---------- A2 相机控制 ----------
const cameraBefore = (await exportWorkflow()).config.shader_extension?.viewer?.camera
const canvasBox = await page.locator('.viewport-3d canvas').boundingBox()
await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
await page.mouse.down()
await page.mouse.move(canvasBox.x + canvasBox.width / 2 + 110, canvasBox.y + canvasBox.height / 2 + 35, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(700)
const cameraAfter = (await exportWorkflow()).config.shader_extension?.viewer?.camera
check(
  'A2 拖拽后相机状态变化',
  JSON.stringify(cameraBefore) !== JSON.stringify(cameraAfter),
  `${JSON.stringify(cameraBefore?.position)} → ${JSON.stringify(cameraAfter?.position)}`,
)

// ---------- A4/P3 uniform-only 不重编译 ----------
await deselect()
const hashBefore = (await programState()).hash
const uniformBefore = (await programState()).uniforms.u_5_value?.value
await editWidget(5, 'value', 0.75)
state = await programState()
check('A4/P3 改 Float 不改变 programHash', state.hash === hashBefore, `${hashBefore} → ${state.hash}`)
check(
  'A4/P3 uniform 已刷新',
  state.uniforms.u_5_value?.value === 0.75,
  `${uniformBefore} → ${state.uniforms.u_5_value?.value}`,
)

// ---------- 线框模式 ----------
const hashBeforeWireframe = (await programState()).hash
await page.locator('.viewer-shapes button', { hasText: '线框' }).click()
await page.waitForTimeout(450)
state = await programState()
check('线框写回 Mesh 节点', state.mesh?.wireframe === true, String(state.mesh?.wireframe))
check('线框不触发重编译', state.hash === hashBeforeWireframe, state.hash)
await page.locator('.viewer-shapes button', { hasText: '线框' }).click()
await page.waitForTimeout(450)

// ---------- Surface 兜底常量 ----------
// metalness 未连线，应使用节点上的兜底 widget
await editWidget(4, 'metalness', 0.7)
state = await programState()
check(
  'Surface 兜底常量生效',
  state.uniforms.u_4_metalness?.value === 0.7,
  JSON.stringify(state.uniforms.u_4_metalness?.value),
)
check('Surface 兜底不重编译', state.hash === hashBefore, state.hash)

// ---------- A6 独立光照与阴影节点 ----------
await editWidget(9, 'enabled', false)
state = await programState()
check('A6 关闭阴影生效', state.lighting?.shadow?.enabled === false, String(state.lighting?.shadow?.enabled))
await editWidget(7, 'intensity', 6)
state = await programState()
check(
  'A6 调整平行光强度生效',
  state.lighting?.lights?.[1]?.intensity === 6,
  String(state.lighting?.lights?.[1]?.intensity),
)
check(
  'A6 光照节点数量正确',
  state.lighting?.lights?.length === 2,
  String(state.lighting?.lights?.length),
)

// ---------- A7/A8 后处理链 ----------
await importWorkflow(buildWorkflow())
check('A7 无 postfx 时链为空', (await programState()).postfx.length === 0)

await importWorkflow(buildWorkflow({ postfx: ['Bloom'] }))
check(
  'A7 单级 Bloom 链',
  JSON.stringify((await programState()).postfx) === JSON.stringify(['Bloom']),
  JSON.stringify((await programState()).postfx),
)

await importWorkflow(buildWorkflow({ postfx: ['Bloom', 'Vignette'] }))
const chainA = (await programState()).postfx
await importWorkflow(buildWorkflow({ postfx: ['Vignette', 'Bloom'] }))
const chainB = (await programState()).postfx
check(
  'A8 链顺序可区分',
  JSON.stringify(chainA) === JSON.stringify(['Bloom', 'Vignette']) &&
    JSON.stringify(chainB) === JSON.stringify(['Vignette', 'Bloom']),
  `${chainA.join('>')} / ${chainB.join('>')}`,
)

// ---------- A10 编译错误 ----------
const broken = buildWorkflow({
  extraNodes: [
    makeNode(21, 'shader/Math', [40, 620], [170, 120], [{ name: 'a', type: 'FLOAT', link: null }], [{ name: 'result', type: 'FLOAT', links: [91] }], ['mul']),
  ],
  extraLinks: [[91, 21, 0, 4, 1, 'FLOAT']],
})
const goodHash = (await programState()).hash
await importWorkflow(broken)
state = await programState()
check('A10 编译失败状态为 error', state.status === 'error', state.status)
check('A10 错误定位到节点', state.errors[0]?.nodeId === 21, String(state.errors[0]?.nodeId))
const errorNodeCount = await page.locator('.graph-node[data-node-id="21"].is-error').count()
check('A10 出错节点标红', errorNodeCount === 1)
check('A10 视口保留上一次产物', state.hash === goodHash, `${goodHash} → ${state.hash}`)

// 点击错误条目应定位并选中出错节点
await deselect()
await page.locator('.inspector-error-link').first().click()
await page.waitForTimeout(400)
const selectedErrorNode = await page.locator('.graph-node[data-node-id="21"].is-selected').count()
check('A10 错误可点击定位节点', selectedErrorNode === 1, String(selectedErrorNode))

// ---------- A11 导出导入往返 ----------
await importWorkflow(buildWorkflow({ postfx: ['Bloom', 'Vignette'] }))
await deselect()
const exported = await exportWorkflow()
const reimport = await importWorkflow(exported)
const reexported = await exportWorkflow()
check('A11 导出可再导入', reimport.ok)
check(
  'A11 节点 / 连线 / 相机 / schema 一致',
  reexported.nodes.length === exported.nodes.length &&
    reexported.links.length === exported.links.length &&
    reexported.config.schema_version === 2 &&
    JSON.stringify(reexported.config.shader_extension) === JSON.stringify(exported.config.shader_extension),
  `${exported.nodes.length} 节点 / ${exported.links.length} 连线 / schema ${reexported.config.schema_version}`,
)

// ---------- 纹理上传 ----------
const textureWorkflow = {
  last_node_id: 4,
  last_link_id: 3,
  nodes: [
    makeNode(1, 'scene/Mesh', [40, 40], [220, 140], [], [{ name: 'geometry', type: 'GEOMETRY', links: [1] }], ['box', '', 1, false]),
    makeNode(2, 'scene/Root', [700, 40], [200, 80], [
      { name: 'geometry', type: 'GEOMETRY', link: 1 },
      { name: 'material', type: 'MATERIAL', link: 3 },
    ], [], []),
    makeNode(3, 'shader/Texture', [40, 260], [200, 150], [{ name: 'uv', type: 'VEC2', link: null }], [{ name: 'color', type: 'COLOR', links: [2] }], ['', 'repeat', true]),
    makeNode(4, 'material/Surface', [340, 240], [220, 250], [
      { name: 'baseColor', type: 'COLOR', link: 2 },
      { name: 'roughness', type: 'FLOAT', link: null },
      { name: 'metalness', type: 'FLOAT', link: null },
      { name: 'emissive', type: 'COLOR', link: null },
    ], [{ name: 'material', type: 'MATERIAL', links: [3] }], ['pbr', '#ffffff', 0.5, 0.1, '#000000']),
  ],
  links: [
    [1, 1, 0, 2, 0, 'GEOMETRY'],
    [2, 3, 0, 4, 0, 'COLOR'],
    [3, 4, 0, 2, 1, 'MATERIAL'],
  ],
  groups: [],
  config: { schema_version: 2 },
}

await importWorkflow(textureWorkflow)
const beforeTexture = await programState()
check('纹理缺失时编译报错', beforeTexture.status === 'error', beforeTexture.status)

await page.locator('.viewer-toolbar input[accept="image/*"]').setInputFiles({
  name: 'white.png',
  mimeType: 'image/png',
  buffer: Buffer.from(WHITE_PNG_BASE64, 'base64'),
})
await page.waitForTimeout(1300)
const afterTexture = await programState()
const textureUniform = Object.values(afterTexture.uniforms).find((item) => item.type === 'texture')
check('纹理上传后编译成功', afterTexture.status === 'ready', afterTexture.status)
check(
  '纹理写入 uniform',
  Boolean(textureUniform && String(textureUniform.value).startsWith('tex-')),
  JSON.stringify(textureUniform?.value),
)

// ---------- 示例工作流 ----------
const shaderDemo = JSON.parse(
  readFileSync(new URL('../examples/shader-demo.workflow.json', import.meta.url), 'utf8'),
)
await importWorkflow(shaderDemo)
state = await programState()
check(
  '示例：3D 示例可导入',
  state.mesh?.shape === 'sphere' && JSON.stringify(state.postfx) === JSON.stringify(['Bloom']),
  `${state.mesh?.shape} / ${state.postfx.join('>')}`,
)

// ---------- A3 glTF 上传与无效文件拦截 ----------
await page.locator('.viewer-toolbar input[accept*="gltf"]').setInputFiles({
  name: 'triangle.glb',
  mimeType: 'model/gltf-binary',
  buffer: buildMinimalGlb(),
})
await page.waitForTimeout(1500)
const afterValidGltf = await programState()
check(
  'A3 有效 glTF 上传并写入节点',
  afterValidGltf.mesh?.shape === 'gltf' && Boolean(afterValidGltf.mesh?.assetId),
  `${afterValidGltf.mesh?.shape} / ${afterValidGltf.mesh?.assetId}`,
)
check('A3 有效 glTF 无未捕获异常', pageErrors.length === 0, pageErrors.join(' | ') || '0')

const assetBeforeInvalid = afterValidGltf.mesh?.assetId
await page.locator('.viewer-toolbar input[accept*="gltf"]').setInputFiles({
  name: 'broken.glb',
  mimeType: 'model/gltf-binary',
  buffer: Buffer.from('not-a-glb'),
})
await page.waitForTimeout(600)
const toastText = (await page.locator('.toast').first().textContent()) ?? ''
const afterInvalidGltf = await programState()
check('A3 无效文件被拦截并提示', toastText.includes('不是有效的 glTF'), toastText)
check(
  'A3 无效文件不改变节点 assetId',
  afterInvalidGltf.mesh?.assetId === assetBeforeInvalid,
  `${assetBeforeInvalid} → ${afterInvalidGltf.mesh?.assetId}`,
)
check('A3 无效文件无未捕获异常', pageErrors.length === 0, pageErrors.join(' | ') || '0')

// ---------- P4 Math 枚举切换 300ms 内更新 ----------
await importWorkflow(
  buildWorkflow({
    extraNodes: [
      makeNode(30, 'shader/Math', [40, 620], [170, 120], [
        { name: 'a', type: 'FLOAT', link: 70 },
        { name: 'b', type: 'FLOAT', link: 71 },
      ], [{ name: 'result', type: 'FLOAT', links: [72] }], ['mul']),
      makeNode(31, 'shader/Float', [40, 760], [160, 100], [], [{ name: 'value', type: 'FLOAT', links: [70] }], [2]),
      makeNode(32, 'shader/Float', [240, 760], [160, 100], [], [{ name: 'value', type: 'FLOAT', links: [71] }], [3]),
    ],
    extraLinks: [
      [70, 31, 0, 30, 0, 'FLOAT'],
      [71, 32, 0, 30, 1, 'FLOAT'],
      [72, 30, 0, 4, 1, 'FLOAT'],
    ],
  }),
)
const hashMul = (await programState()).hash
await selectNode(30)
await page.locator('[data-node-id="30"] .graph-widget[data-widget-name="op"] select').selectOption('add')
await page.waitForTimeout(320)
state = await programState()
check('P4 Math op 切换触发重编译', state.hash !== hashMul, `${hashMul} → ${state.hash}`)
check('P4 300ms 内重编译完成', state.status === 'ready', state.status)

// ---------- P2 性能 HUD ----------
await importWorkflow(buildWorkflow({ postfx: ['Bloom'] }))
await page.locator('.viewer-perf-toggle input').click()
await page.waitForTimeout(1400)
const hud = (await page.locator('.perf-hud').textContent()) ?? ''
check('P2 性能模式 HUD 有采样值', /\d/.test(hud) && !hud.includes('FPS --'), hud)

// ---------- P1 demand 静止时停止采样 ----------
await page.locator('.viewer-perf-toggle input').click()
await page.waitForTimeout(400)
const idleHudA = (await page.locator('.perf-hud').textContent()) ?? ''
await page.waitForTimeout(900)
const idleHudB = (await page.locator('.perf-hud').textContent()) ?? ''
check('P1 demand 空闲时 HUD 停止更新', idleHudA === idleHudB, `${idleHudA} → ${idleHudB}`)

console.log(`\n${checks.filter((item) => item.ok).length}/${checks.length} 项通过`)
if (pageErrors.length > 0) {
  console.log(`未捕获异常：\n${pageErrors.join('\n')}`)
}
if (consoleErrors.length > 0) {
  console.log(`控制台日志（无效资源路径产生，属预期）：\n${consoleErrors.join('\n')}`)
}

await browser.close()
process.exit(checks.every((item) => item.ok) ? 0 : 1)
